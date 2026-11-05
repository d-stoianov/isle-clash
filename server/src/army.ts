import {
    ARMY_AGGRO,
    BRIDGE_BUILD_MS,
    BRIDGE_Y,
    CASTLE,
    COUNTERS,
    distance,
    ISLAND_W,
    MAX_SOLDIERS,
    PLUNDER_RATE,
    regionOf,
    SOLDIERS,
    STRAIT,
    toArena,
    TOWER_DAMAGE,
    TOWER_FIRE_MS,
    TOWER_RANGE,
    TOWER_SPOT,
    walkArena,
    type BridgeState,
    type Facing,
    type GameEvent,
    type PlayerState,
    type Point,
    type SoldierState,
    type SoldierType,
} from '@isle-clash/shared'

export type SeatIndex = 0 | 1

interface Soldier {
    id: number
    owner: SeatIndex
    type: SoldierType
    x: number
    y: number
    facing: Facing
    hp: number
    maxHp: number
    action: SoldierState['action']
    actionMs: number
    cooldownMs: number
}

type ArmyEvent = Extract<GameEvent, { kind: 'arrow' | 'hit' | 'heal' | 'die' | 'spawn' | 'bridge' }>
/** Army events as emitted: `mine` is filled in per receiver from the owner. */
export type ArenaEvent = DistributiveOmit<ArmyEvent, 'mine'>

/** What the army needs from the match it lives in. */
export interface ArmyHost {
    player(seat: SeatIndex): PlayerState
    /** Arena event; `owner` decides who sees `mine: true`. */
    emitArena(event: ArenaEvent, owner?: SeatIndex): void
    plunder(victim: SeatIndex, amount: number): void
    smackPawn(seat: SeatIndex): void
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** How long a swing/shot animation is reported to clients. */
const ATTACK_ANIM_MS = 380
const CASTLE_REACH = 64
const PERSONAL_SPACE = 30
let soldierIds = 1

/**
 * Soldiers, the bridge and archer towers. Soldiers are fully server-driven:
 * players only train them and pick an order (charge / defend).
 */
export class Army {
    soldiers: Soldier[] = []
    bridge: BridgeState = { status: 'none', progress: 0 }
    private towerCooldown: [number, number] = [0, 0]
    private host: ArmyHost

    constructor(host: ArmyHost) {
        this.host = host
    }

    count(owner: SeatIndex) {
        return this.soldiers.filter((s) => s.owner === owner).length
    }

    spawn(owner: SeatIndex, type: SoldierType): string | null {
        if (this.count(owner) >= MAX_SOLDIERS) return `Army is full (${MAX_SOLDIERS})`
        const n = this.soldiers.length
        const gate = toArena(owner, { x: CASTLE.gate.x + ((n % 3) - 1) * 26, y: CASTLE.gate.y + 34 })
        const stats = SOLDIERS[type]
        this.soldiers.push({
            id: soldierIds++,
            owner,
            type,
            ...gate,
            facing: owner === 0 ? 'right' : 'left',
            hp: stats.hp,
            maxHp: stats.hp,
            action: 'idle',
            actionMs: 0,
            cooldownMs: 400,
        })
        this.host.emitArena({ kind: 'spawn', ...gate }, owner)
        return null
    }

    buildBridge(): string | null {
        if (this.bridge.status !== 'none') return 'The bridge is already there'
        this.bridge = { status: 'building', progress: 0 }
        this.host.emitArena({ kind: 'bridge', status: 'building' })
        return null
    }

    destroyBridge() {
        if (this.bridge.status === 'none') return
        this.bridge = { status: 'none', progress: 0 }
        this.host.emitArena({ kind: 'bridge', status: 'destroyed' })
        // Anyone standing on it falls into the strait.
        for (const s of this.soldiers) if (regionOf(s.x) === 'strait') s.hp = 0
        this.reap()
    }

    /** Area damage (powder kegs), arena coordinates. */
    blast(at: Point, radius: number, damage: number) {
        for (const s of this.soldiers) {
            if (distance(s, at) <= radius) {
                s.hp -= damage
                this.host.emitArena({ kind: 'hit', x: s.x, y: s.y, amount: damage })
            }
        }
        this.reap()
    }

    snapshot(viewer: SeatIndex): SoldierState[] {
        return this.soldiers.map((s) => ({
            id: s.id,
            type: s.type,
            mine: s.owner === viewer,
            x: s.x,
            y: s.y,
            facing: s.facing,
            hp: s.hp,
            maxHp: s.maxHp,
            action: s.action,
        }))
    }

    tick(dt: number) {
        if (this.bridge.status === 'building') {
            this.bridge.progress = Math.min(1, this.bridge.progress + dt / BRIDGE_BUILD_MS)
            if (this.bridge.progress >= 1) {
                this.bridge = { status: 'up', progress: 1 }
                this.host.emitArena({ kind: 'bridge', status: 'up' })
            }
        }
        for (const s of this.soldiers) this.think(s, dt)
        this.separate()
        this.towers(dt)
        this.reap()
    }

    // ---------- AI ----------

    private think(s: Soldier, dt: number) {
        const stats = SOLDIERS[s.type]
        s.cooldownMs -= dt
        s.actionMs -= dt
        if (s.actionMs <= 0 && s.action === 'attack') s.action = 'idle'
        const enemySeat: SeatIndex = s.owner === 0 ? 1 : 0
        const me = this.host.player(s.owner)

        if (s.type === 'monk') return this.thinkMonk(s, dt)

        // 1. Fight enemy soldiers nearby (that we can actually reach).
        const foe = this.nearest(s, (o) => o.owner !== s.owner && this.reachable(s, o), ARMY_AGGRO)
        if (foe) return this.engage(s, foe, stats.range, dt, () => this.strike(s, foe))

        // 2. Knock over the enemy worker if we're on their island.
        const enemy = this.host.player(enemySeat)
        if (regionOf(s.x) === enemySeat && enemy.effects.stunMs === 0) {
            const pawn = toArena(enemySeat, enemy.pawn)
            if (distance(s, pawn) <= ARMY_AGGRO * 0.7) {
                return this.engage(s, pawn, Math.min(stats.range, 60), dt, () => {
                    if (s.type === 'archer') this.host.emitArena({ kind: 'arrow', x1: s.x, y1: s.y, x2: pawn.x, y2: pawn.y }, s.owner)
                    this.host.smackPawn(enemySeat)
                })
            }
        }

        // 3. Follow orders.
        if (me.order === 'charge') {
            const gate = toArena(enemySeat, CASTLE.gate)
            const canReach = this.bridge.status === 'up' || regionOf(s.x) === enemySeat
            if (canReach) {
                return this.engage(s, gate, s.type === 'archer' ? 150 : CASTLE_REACH, dt, () => {
                    if (s.type === 'archer') this.host.emitArena({ kind: 'arrow', x1: s.x, y1: s.y, x2: gate.x, y2: gate.y - 60 }, s.owner)
                    this.host.plunder(enemySeat, Math.round(stats.damage * PLUNDER_RATE))
                })
            }
            // No bridge yet: wait at our bridgehead, ready to go.
            return this.moveTo(s, this.slot(s, toArena(s.owner, { x: ISLAND_W - 60, y: BRIDGE_Y })), dt)
        }
        this.moveTo(s, this.slot(s, toArena(s.owner, { x: CASTLE.gate.x, y: CASTLE.gate.y + 110 })), dt)
    }

    private thinkMonk(s: Soldier, dt: number) {
        const stats = SOLDIERS.monk
        const hurt = this.soldiers
            .filter((o) => o.owner === s.owner && o.hp < o.maxHp && distance(s, o) <= stats.range)
            .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
        if (hurt && s.cooldownMs <= 0) {
            hurt.hp = Math.min(hurt.maxHp, hurt.hp + stats.damage)
            s.cooldownMs = stats.cooldownMs
            this.attackAnim(s, hurt)
            this.host.emitArena({ kind: 'heal', x: hurt.x, y: hurt.y, amount: stats.damage }, s.owner)
            return
        }
        // Tag along behind the closest friend; otherwise stay home.
        const friend = this.nearest(s, (o) => o.owner === s.owner && o.type !== 'monk', 2000)
        if (friend && distance(s, friend) > 90) return this.moveTo(s, friend, dt)
        if (!friend) this.moveTo(s, this.slot(s, toArena(s.owner, { x: CASTLE.gate.x, y: CASTLE.gate.y + 80 })), dt)
        else s.action = s.action === 'run' ? 'idle' : s.action
    }

    /** Walk into range of a target, then act on it whenever the weapon is ready. */
    private engage(s: Soldier, target: Point, range: number, dt: number, act: () => void) {
        if (distance(s, target) > range) return this.moveTo(s, target, dt)
        if (s.action === 'run') s.action = 'idle'
        s.facing = target.x < s.x ? 'left' : 'right'
        if (s.cooldownMs > 0) return
        s.cooldownMs = SOLDIERS[s.type].cooldownMs
        this.attackAnim(s, target)
        act()
    }

    private strike(s: Soldier, foe: Soldier) {
        const stats = SOLDIERS[s.type]
        const damage = Math.round(stats.damage * (COUNTERS[s.type]?.[foe.type] ?? 1))
        foe.hp -= damage
        if (s.type === 'archer') this.host.emitArena({ kind: 'arrow', x1: s.x, y1: s.y, x2: foe.x, y2: foe.y }, s.owner)
        this.host.emitArena({ kind: 'hit', x: foe.x, y: foe.y, amount: damage })
    }

    private attackAnim(s: Soldier, target: Point) {
        s.action = 'attack'
        s.actionMs = ATTACK_ANIM_MS
        s.facing = target.x < s.x ? 'left' : 'right'
    }

    /** Move toward a point, routing over the bridge when it's on the other island. */
    private moveTo(s: Soldier, target: Point, dt: number) {
        const here = regionOf(s.x)
        const there = regionOf(target.x)
        let waypoint = target
        if (here !== there && this.bridge.status === 'up') {
            const nearEnd = here === 0 || (here === 'strait' && there === 1) ? ISLAND_W - 24 : ISLAND_W + STRAIT + 24
            const farSide = there === 0 ? ISLAND_W - 30 : ISLAND_W + STRAIT + 30
            // Line up with the bridge first, then cross it.
            waypoint = here === 'strait' || Math.abs(s.y - BRIDGE_Y) < 14 ? { x: farSide, y: BRIDGE_Y } : { x: nearEnd, y: BRIDGE_Y }
        }
        const d = distance(s, waypoint)
        if (d < 4) {
            if (s.action === 'run') s.action = 'idle'
            return
        }
        const step = Math.min(d, (SOLDIERS[s.type].speed * dt) / 1000)
        const next = walkArena(s, { x: s.x + ((waypoint.x - s.x) / d) * step, y: s.y + ((waypoint.y - s.y) / d) * step }, this.bridge.status === 'up')
        if (s.action !== 'attack') s.action = distance(next, s) > 0.2 ? 'run' : 'idle'
        if (Math.abs(next.x - s.x) > 0.2) s.facing = next.x < s.x ? 'left' : 'right'
        s.x = next.x
        s.y = next.y
    }

    /** A spread-out spot around a rally point so the army doesn't stack on one pixel. */
    private slot(s: Soldier, center: Point): Point {
        const i = s.id % 6
        return { x: center.x + ((i % 3) - 1) * 44, y: center.y + (Math.floor(i / 3) - 0.5) * 44 }
    }

    private nearest(s: Soldier, pick: (o: Soldier) => boolean, within: number) {
        let best: Soldier | null = null
        let bestDist = within
        for (const o of this.soldiers) {
            if (o === s || o.hp <= 0 || !pick(o)) continue
            const d = distance(s, o)
            if (d <= bestDist) {
                best = o
                bestDist = d
            }
        }
        return best
    }

    /** Different islands are only reachable over a standing bridge. */
    private reachable(a: Point, b: Point) {
        return this.bridge.status === 'up' || regionOf(a.x) === regionOf(b.x)
    }

    private separate() {
        for (const a of this.soldiers) {
            for (const b of this.soldiers) {
                if (a.id >= b.id) continue
                const d = distance(a, b)
                if (d === 0 || d >= PERSONAL_SPACE) continue
                const push = (PERSONAL_SPACE - d) / 2
                const nx = (a.x - b.x) / d
                const ny = (a.y - b.y) / d
                const up = this.bridge.status === 'up'
                Object.assign(a, walkArena(a, { x: a.x + nx * push, y: a.y + ny * push }, up))
                Object.assign(b, walkArena(b, { x: b.x - nx * push, y: b.y - ny * push }, up))
            }
        }
    }

    private towers(dt: number) {
        for (const seat of [0, 1] as SeatIndex[]) {
            this.towerCooldown[seat] -= dt
            if (this.host.player(seat).effects.towerMs <= 0 || this.towerCooldown[seat] > 0) continue
            const tower = toArena(seat, TOWER_SPOT)
            const target = this.soldiers
                .filter((o) => o.owner !== seat && distance(o, tower) <= TOWER_RANGE)
                .sort((a, b) => distance(a, tower) - distance(b, tower))[0]
            if (!target) continue
            this.towerCooldown[seat] = TOWER_FIRE_MS
            target.hp -= TOWER_DAMAGE
            this.host.emitArena({ kind: 'arrow', x1: tower.x, y1: tower.y - 150, x2: target.x, y2: target.y }, seat)
            this.host.emitArena({ kind: 'hit', x: target.x, y: target.y, amount: TOWER_DAMAGE })
        }
    }

    private reap() {
        const dead = this.soldiers.filter((s) => s.hp <= 0)
        if (!dead.length) return
        this.soldiers = this.soldiers.filter((s) => s.hp > 0)
        for (const s of dead) this.host.emitArena({ kind: 'die', x: s.x, y: s.y, type: s.type }, s.owner)
    }
}
