import {
    atGate,
    BOUNDS,
    clamp,
    distance,
    FIRE_MS,
    BRIDGE_HALF,
    BRIDGE_Y,
    ISLAND_W,
    isShopId,
    KEG_UNIT_DAMAGE,
    STRAIT,
    toArena,
    nearestTarget,
    KEG_FUSE_MS,
    KEG_RADIUS,
    KEG_STUN_MS,
    LOADS,
    MATCH_DURATION_MS,
    MAX_SOLDIERS,
    MEADOW,
    RAIDER_LIFETIME_MS,
    RAIDER_REACH,
    RAIDER_SPEED,
    RAIDER_STUN_MS,
    RAIDER_WINDUP_MS,
    REGROW_MS,
    RESOURCE_SPOTS,
    SHEEP_COUNT,
    SHEEP_FLEE_RANGE,
    SHEEP_FLEE_SPEED,
    SHEEP_SPEED,
    SHOP,
    SHOP_IDS,
    SPAWN,
    speedFor,
    STARTING_GOLD,
    SWING_COOLDOWN_MS,
    SWINGS,
    TICK_RATE,
    TOWER_MS,
    TOWER_SHOT_DELAY_MS,
    type Facing,
    type GameAction,
    type GameEvent,
    type LoadKind,
    type PlayerState,
    type Point,
    type ServerMessage,
    type SheepState,
    type ShopId,
    type Side,
} from '@gogrow/shared'
import { Army, type ArenaEvent, type SeatIndex } from './army.ts'

/** Anything that can sit in a match: a websocket connection or a bot. */
export interface Participant {
    name: string
    send(msg: ServerMessage): void
}

type PendingEvent = DistributiveOmit<GameEvent, 'island'> | ArenaEvent

interface Seat {
    index: SeatIndex
    participant: Participant
    state: PlayerState
    lastMoveAt: number
    lastSwingAt: number
    /** per-sheep wander target */
    sheepGoals: Point[]
    /** per-sheep ms until a caught sheep respawns */
    sheepRespawnMs: number[]
    raiderWindupMs: number
    raiderAge: number
    /** After a soldier stuns the worker, give them a moment to act before the next one. */
    smackImmuneUntil: number
}

/** Extra reach for network jitter between what the client saw and what the server has. */
const RANGE_SLACK = 10
const DT_CAP_MS = 250
/** Time a worker can act between soldier stuns, so armies can't stun-lock them. */
const SMACK_GRACE_MS = 2_000
// Dev/playtest overrides, e.g. START_GOLD=500 MATCH_MS=30000 npm run dev:server
const START_GOLD = Number(process.env.START_GOLD ?? STARTING_GOLD)
const MATCH_MS = Number(process.env.MATCH_MS ?? MATCH_DURATION_MS)
let kegIds = 1

function randomMeadowPoint(): Point {
    return {
        x: MEADOW.minX + Math.random() * (MEADOW.maxX - MEADOW.minX),
        y: MEADOW.minY + Math.random() * (MEADOW.maxY - MEADOW.minY),
    }
}

function freshSheep(): SheepState {
    const p = randomMeadowPoint()
    return { ...p, facing: 'right', moving: false, alive: true, hp: SWINGS.sheep.base }
}

function freshPlayer(name: string): PlayerState {
    return {
        name,
        order: 'defend',
        gold: START_GOLD,
        pawn: { ...SPAWN, facing: 'right', moving: false },
        carrying: null,
        upgrades: { axe: false, pickaxe: false, boots: false },
        cooldowns: Object.fromEntries(SHOP_IDS.map((id) => [id, 0])) as Record<ShopId, number>,
        effects: { stunMs: 0, fireMs: 0, towerMs: 0 },
        resources: RESOURCE_SPOTS.map((r) => {
            const hp = SWINGS[r.kind].base
            return { kind: r.kind, hp, maxHp: hp, regrowMs: 0 }
        }),
        sheep: Array.from({ length: SHEEP_COUNT }, freshSheep),
        raider: null,
        kegs: [],
    }
}

export class Match {
    private readonly seats: [Seat, Seat]
    private timeLeftMs = MATCH_MS
    private timer: ReturnType<typeof setInterval> | null = null
    private lastTick = 0
    private finished = false
    private pending: { island?: Seat; owner?: Seat; event: PendingEvent }[] = []
    private army: Army
    onFinish: (() => void) | null = null

    constructor(a: Participant, b: Participant) {
        const seat = (participant: Participant, index: SeatIndex): Seat => ({
            index,
            participant,
            state: freshPlayer(participant.name),
            lastMoveAt: performance.now(),
            lastSwingAt: 0,
            sheepGoals: Array.from({ length: SHEEP_COUNT }, randomMeadowPoint),
            sheepRespawnMs: Array.from({ length: SHEEP_COUNT }, () => 0),
            raiderWindupMs: 0,
            raiderAge: 0,
            smackImmuneUntil: 0,
        })
        this.seats = [seat(a, 0), seat(b, 1)]
        this.army = new Army({
            player: (i) => this.seats[i].state,
            emitArena: (event, owner) => this.pending.push({ event, owner: owner === undefined ? undefined : this.seats[owner] }),
            plunder: (victim, amount) => this.plunder(this.seats[victim], amount),
            smackPawn: (i) => {
                const seat = this.seats[i]
                const now = performance.now()
                if (seat.state.effects.stunMs > 0 || now < seat.smackImmuneUntil) return
                seat.smackImmuneUntil = now + RAIDER_STUN_MS + SMACK_GRACE_MS
                this.emit(seat, { kind: 'smack' })
                this.hurtPawn(seat, RAIDER_STUN_MS)
            },
        })
    }

    start() {
        const [a, b] = this.seats
        a.participant.send({ t: 'start', opponentName: b.state.name, durationMs: MATCH_MS, seat: 0 })
        b.participant.send({ t: 'start', opponentName: a.state.name, durationMs: MATCH_MS, seat: 1 })
        this.lastTick = performance.now()
        for (const s of this.seats) s.lastMoveAt = this.lastTick
        this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE)
        this.broadcast()
    }

    /** Read-only view used by bots to make decisions. */
    view(p: Participant) {
        const me = this.seat(p)
        return {
            you: me.state,
            opponent: this.other(me).state,
            timeLeftMs: this.timeLeftMs,
            soldiers: this.army.snapshot(me.index),
            bridge: this.army.bridge,
        }
    }

    leave(p: Participant) {
        if (this.finished) return
        this.finish('opponent_left', this.other(this.seat(p)))
    }

    handle(p: Participant, msg: GameAction) {
        if (this.finished) return
        const me = this.seat(p)
        const error = this.apply(me, msg)
        if (error) p.send({ t: 'error', message: error })
    }

    // ---------- actions ----------

    private apply(me: Seat, msg: GameAction): string | null {
        if (!isValidAction(msg)) return 'Invalid move'
        const s = me.state
        if (s.effects.stunMs > 0) {
            // Movement is dropped silently while stunned; the next snapshot snaps the client back.
            return msg.t === 'move' ? null : 'You are stunned!'
        }
        switch (msg.t) {
            case 'move':
                this.move(me, msg)
                return null
            case 'swing':
                return this.swing(me)
            case 'buy':
                return this.buy(me, msg.id, msg.x, msg.y)
            case 'order':
                if (s.order !== msg.order) {
                    s.order = msg.order
                    this.emit(me, { kind: 'charge', order: msg.order })
                }
                return null
        }
    }

    /**
     * Clients move their own worker for instant response. The server only checks the
     * move is physically possible (speed + bounds) and clamps it otherwise.
     */
    private move(me: Seat, msg: Extract<GameAction, { t: 'move' }>) {
        const now = performance.now()
        const elapsed = Math.min(DT_CAP_MS, now - me.lastMoveAt)
        me.lastMoveAt = now
        const p = me.state.pawn
        const maxStep = (speedFor(me.state.upgrades.boots) * elapsed) / 1000 + 10
        let x = clamp(msg.x, BOUNDS.minX, BOUNDS.maxX)
        let y = clamp(msg.y, BOUNDS.minY, BOUNDS.maxY)
        const d = distance(p, { x, y })
        if (d > maxStep) {
            x = p.x + ((x - p.x) / d) * maxStep
            y = p.y + ((y - p.y) / d) * maxStep
        }
        p.x = x
        p.y = y
        p.facing = msg.facing
        p.moving = msg.moving
        this.tryDeposit(me)
    }

    /** One tool swing at the nearest thing in reach: a tree, a gold rock or a sheep. */
    private swing(me: Seat): string | null {
        const now = performance.now()
        if (now - me.lastSwingAt < SWING_COOLDOWN_MS) return null
        const s = me.state
        if (s.carrying) return 'Hands full! Bring it to your castle'
        const target = nearestTarget(s, s.pawn, RANGE_SLACK)
        if (!target) return null
        me.lastSwingAt = now
        s.pawn.facing = target.x < s.pawn.x ? 'left' : 'right'

        if (target.type === 'sheep') {
            const sheep = s.sheep[target.index]!
            this.emit(me, { kind: 'swing', target: 'sheep', index: target.index })
            sheep.hp--
            sheep.moving = false
            if (sheep.hp <= 0) {
                sheep.alive = false
                sheep.hp = 0
                me.sheepRespawnMs[target.index] = REGROW_MS.sheep
                this.gather(me, 'meat')
            }
            return null
        }

        const res = s.resources[target.index]!
        this.emit(me, { kind: 'swing', target: res.kind, index: target.index })
        res.hp--
        if (res.hp <= 0) {
            res.hp = 0
            res.regrowMs = REGROW_MS[res.kind]
            this.gather(me, res.kind === 'tree' ? 'wood' : 'gold')
        }
        return null
    }

    private gather(me: Seat, load: LoadKind) {
        me.state.carrying = load
        this.emit(me, { kind: 'gather', load })
    }

    private tryDeposit(me: Seat) {
        const s = me.state
        if (!s.carrying || s.effects.fireMs > 0 || !atGate(s.pawn, RANGE_SLACK)) return
        const amount = LOADS[s.carrying].value
        s.gold += amount
        this.emit(me, { kind: 'deposit', load: s.carrying, amount })
        s.carrying = null
    }

    private buy(me: Seat, id: ShopId, tx?: number, ty?: number): string | null {
        const s = me.state
        const item = SHOP[id]
        if (!atGate(s.pawn, RANGE_SLACK)) return 'Walk to your castle to shop'
        if (s.effects.fireMs > 0) return 'Your castle is on fire!'
        if (item.kind === 'upgrade' && s.upgrades[id as keyof typeof s.upgrades]) return 'Already bought'
        if (s.cooldowns[id] > 0) return `${item.name} is not ready yet`
        if (s.gold < item.cost) return 'Not enough gold'
        if (item.targeted && (tx === undefined || ty === undefined)) return 'Pick a target'

        const opp = this.other(me)
        const o = opp.state
        if (id === 'raider' && o.raider) return 'A raider is already there'
        if (id === 'bridge' && this.army.bridge.status !== 'none') return 'The bridge is already there'
        if (item.kind === 'army' && this.army.count(me.index) >= MAX_SOLDIERS) return `Army is full (${MAX_SOLDIERS})`

        s.gold -= item.cost
        s.cooldowns[id] = item.cooldownMs
        this.emit(item.kind === 'attack' ? opp : me, { kind: 'buy', item: id })

        switch (id) {
            case 'warrior':
            case 'archer':
            case 'lancer':
            case 'monk':
                this.army.spawn(me.index, id)
                break
            case 'bridge':
                this.army.buildBridge()
                break
            case 'axe':
            case 'pickaxe':
            case 'boots':
                s.upgrades[id] = true
                if (id === 'axe') this.applyUpgrade(s, 'tree')
                if (id === 'pickaxe') this.applyUpgrade(s, 'gold')
                break
            case 'tower':
                s.effects.towerMs = TOWER_MS
                break
            case 'fire':
                o.effects.fireMs = FIRE_MS
                break
            case 'keg': {
                // Kegs can also be dropped on the bridge (past the island's inner edge).
                const onBridge = Math.abs(ty! - BRIDGE_Y) <= BRIDGE_HALF && tx! > BOUNDS.maxX
                o.kegs.push({
                    id: kegIds++,
                    x: clamp(tx!, BOUNDS.minX, onBridge ? ISLAND_W + STRAIT / 2 : BOUNDS.maxX),
                    y: clamp(ty!, BOUNDS.minY, BOUNDS.maxY),
                    fuseMs: KEG_FUSE_MS,
                })
                break
            }
            case 'raider': {
                // Land on the island edge farthest from their worker.
                const x = o.pawn.x < BOUNDS.maxX / 2 ? BOUNDS.maxX : BOUNDS.minX
                o.raider = { x, y: clamp(o.pawn.y, 300, BOUNDS.maxY), facing: 'left', moving: true, attacking: false, lifeMs: RAIDER_LIFETIME_MS }
                opp.raiderWindupMs = 0
                opp.raiderAge = 0
                break
            }
        }
        return null
    }

    private applyUpgrade(s: PlayerState, kind: 'tree' | 'gold') {
        const max = SWINGS[kind].upgraded
        for (const r of s.resources) {
            if (r.kind !== kind) continue
            r.maxHp = max
            r.hp = Math.min(r.hp, max)
            if (r.regrowMs === 0 && r.hp === 0) r.hp = max
        }
    }

    // ---------- simulation ----------

    private tick() {
        const now = performance.now()
        const dt = Math.min(DT_CAP_MS, now - this.lastTick)
        this.lastTick = now
        this.timeLeftMs = Math.max(0, this.timeLeftMs - dt)

        for (const seat of this.seats) {
            const s = seat.state
            s.effects.stunMs = Math.max(0, s.effects.stunMs - dt)
            s.effects.fireMs = Math.max(0, s.effects.fireMs - dt)
            s.effects.towerMs = Math.max(0, s.effects.towerMs - dt)
            for (const id of SHOP_IDS) s.cooldowns[id] = Math.max(0, s.cooldowns[id] - dt)

            for (const r of s.resources) {
                if (r.regrowMs <= 0) continue
                r.regrowMs = Math.max(0, r.regrowMs - dt)
                if (r.regrowMs === 0) r.hp = r.maxHp
            }
            this.tickSheep(seat, dt)
            this.tickKegs(seat, dt)
            this.tickRaider(seat, dt)
            // Deliveries also happen if the worker stands still at the gate once a fire ends.
            this.tryDeposit(seat)
        }

        this.army.tick(dt)
        this.broadcast()

        if (this.timeLeftMs <= 0) {
            const [a, b] = this.seats
            const winner = a.state.gold === b.state.gold ? null : a.state.gold > b.state.gold ? a : b
            this.finish('time', winner)
        }
    }

    private tickSheep(seat: Seat, dt: number) {
        const s = seat.state
        s.sheep.forEach((sheep, i) => {
            if (!sheep.alive) {
                seat.sheepRespawnMs[i]! -= dt
                if (seat.sheepRespawnMs[i]! <= 0) {
                    Object.assign(sheep, freshSheep())
                    seat.sheepGoals[i] = randomMeadowPoint()
                }
                return
            }
            const goal = seat.sheepGoals[i]!
            const threat = distance(sheep, s.pawn) < SHEEP_FLEE_RANGE && s.effects.stunMs === 0
            let target = goal
            let speed = SHEEP_SPEED
            if (threat) {
                const d = distance(sheep, s.pawn) || 1
                target = { x: sheep.x + ((sheep.x - s.pawn.x) / d) * 60, y: sheep.y + ((sheep.y - s.pawn.y) / d) * 60 }
                speed = SHEEP_FLEE_SPEED
            } else if (distance(sheep, goal) < 6) {
                // Graze a while, then pick a new spot.
                sheep.moving = false
                if (Math.random() < dt / 2500) seat.sheepGoals[i] = randomMeadowPoint()
                return
            }
            const d = distance(sheep, target)
            if (d < 1) return
            const step = Math.min(d, (speed * dt) / 1000)
            const nx = clamp(sheep.x + ((target.x - sheep.x) / d) * step, MEADOW.minX, MEADOW.maxX)
            const ny = clamp(sheep.y + ((target.y - sheep.y) / d) * step, MEADOW.minY, MEADOW.maxY)
            sheep.facing = nx < sheep.x ? 'left' : nx > sheep.x ? 'right' : sheep.facing
            sheep.moving = Math.abs(nx - sheep.x) + Math.abs(ny - sheep.y) > 0.01
            sheep.x = nx
            sheep.y = ny
        })
    }

    private tickKegs(seat: Seat, dt: number) {
        const s = seat.state
        for (const keg of s.kegs) keg.fuseMs -= dt
        const blown = s.kegs.filter((k) => k.fuseMs <= 0)
        if (!blown.length) return
        s.kegs = s.kegs.filter((k) => k.fuseMs > 0)
        for (const keg of blown) {
            this.emit(seat, { kind: 'explode', x: keg.x, y: keg.y })
            if (distance(keg, s.pawn) <= KEG_RADIUS) this.hurtPawn(seat, KEG_STUN_MS)
            this.army.blast(toArena(seat.index, keg), KEG_RADIUS, KEG_UNIT_DAMAGE)
            if (keg.x > ISLAND_W - 50 && Math.abs(keg.y - BRIDGE_Y) <= BRIDGE_HALF + 40) this.army.destroyBridge()
            s.resources.forEach((r, i) => {
                if (r.regrowMs === 0 && distance(keg, RESOURCE_SPOTS[i]!) <= KEG_RADIUS) {
                    r.hp = 0
                    r.regrowMs = REGROW_MS[r.kind]
                }
            })
            s.sheep.forEach((sheep, i) => {
                if (sheep.alive && distance(keg, sheep) <= KEG_RADIUS) {
                    sheep.alive = false
                    seat.sheepRespawnMs[i] = REGROW_MS.sheep
                }
            })
        }
    }

    private tickRaider(seat: Seat, dt: number) {
        const s = seat.state
        const r = s.raider
        if (!r) return
        seat.raiderAge += dt
        r.lifeMs -= dt
        if (s.effects.towerMs > 0 && seat.raiderAge >= TOWER_SHOT_DELAY_MS) {
            this.emit(seat, { kind: 'shot', x: r.x, y: r.y })
            s.raider = null
            return
        }
        if (r.lifeMs <= 0) {
            s.raider = null
            return
        }
        const d = distance(r, s.pawn)
        if (seat.raiderWindupMs > 0) {
            seat.raiderWindupMs -= dt
            if (seat.raiderWindupMs <= 0) {
                r.attacking = false
                if (d <= RAIDER_REACH + 18 && s.effects.stunMs === 0) {
                    this.emit(seat, { kind: 'smack' })
                    this.hurtPawn(seat, RAIDER_STUN_MS)
                }
            }
            return
        }
        if (d <= RAIDER_REACH && s.effects.stunMs === 0) {
            r.attacking = true
            r.moving = false
            seat.raiderWindupMs = RAIDER_WINDUP_MS
            return
        }
        // Wait out the stun next to the victim instead of stun-locking them.
        if (s.effects.stunMs > 0 && d < RAIDER_REACH * 2) {
            r.moving = false
            return
        }
        const step = Math.min(d, (RAIDER_SPEED * dt) / 1000)
        const facing: Facing = s.pawn.x < r.x ? 'left' : 'right'
        r.x += ((s.pawn.x - r.x) / (d || 1)) * step
        r.y += ((s.pawn.y - r.y) / (d || 1)) * step
        r.facing = facing
        r.moving = true
    }

    private plunder(victim: Seat, amount: number) {
        const stolen = Math.min(victim.state.gold, amount)
        if (stolen <= 0) return
        victim.state.gold -= stolen
        this.other(victim).state.gold += stolen
        this.emit(victim, { kind: 'plunder', amount: stolen })
    }

    private hurtPawn(seat: Seat, stunMs: number) {
        const s = seat.state
        s.effects.stunMs = Math.max(s.effects.stunMs, stunMs)
        s.pawn.moving = false
        if (s.carrying) {
            this.emit(seat, { kind: 'drop', load: s.carrying })
            s.carrying = null
        }
    }

    // ---------- plumbing ----------

    private finish(reason: 'time' | 'opponent_left', winner: Seat | null) {
        if (this.finished) return
        this.finished = true
        if (this.timer) clearInterval(this.timer)
        for (const seat of this.seats) {
            seat.participant.send({
                t: 'end',
                result: winner === null ? 'draw' : winner === seat ? 'win' : 'lose',
                reason,
                yourGold: seat.state.gold,
                opponentGold: this.other(seat).state.gold,
            })
        }
        this.onFinish?.()
    }

    private broadcast() {
        const all = this.pending
        this.pending = []
        for (const seat of this.seats) {
            seat.participant.send({
                t: 'state',
                timeLeftMs: this.timeLeftMs,
                you: seat.state,
                opponent: this.other(seat).state,
                soldiers: this.army.snapshot(seat.index),
                bridge: this.army.bridge,
            })
        }
        // Each event is delivered to both players, with `island` relative to the receiver.
        if (!all.length) return
        for (const seat of this.seats) {
            const events = all.map(({ island, owner, event }) => {
                const out: Record<string, unknown> = { ...event }
                if (island) out.island = (island === seat ? 'you' : 'opponent') satisfies Side
                if (owner) out.mine = owner === seat
                return out as unknown as GameEvent
            })
            seat.participant.send({ t: 'events', events })
        }
    }

    /** Queue an event that happened on `island`'s island. */
    private emit(island: Seat, event: PendingEvent) {
        this.pending.push({ island, event })
    }

    private seat(p: Participant): Seat {
        const seat = this.seats.find((s) => s.participant === p)
        if (!seat) throw new Error('participant not in match')
        return seat
    }

    private other(seat: Seat): Seat {
        return seat === this.seats[0] ? this.seats[1] : this.seats[0]
    }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Messages come straight off the wire, so never trust their shape. */
function isValidAction(msg: GameAction): boolean {
    switch (msg.t) {
        case 'move':
            return (
                Number.isFinite(msg.x) &&
                Number.isFinite(msg.y) &&
                (msg.facing === 'left' || msg.facing === 'right') &&
                typeof msg.moving === 'boolean'
            )
        case 'swing':
            return true
        case 'order':
            return msg.order === 'charge' || msg.order === 'defend'
        case 'buy':
            return (
                isShopId(msg.id) &&
                (msg.x === undefined || Number.isFinite(msg.x)) &&
                (msg.y === undefined || Number.isFinite(msg.y))
            )
        default:
            return false
    }
}
