import {
    atShop,
    BOUNDS,
    CROP_IDS,
    CROPS,
    distance,
    DROUGHT_DURATION_MS,
    DROUGHT_GROWTH_MULTIPLIER,
    FREEZE_DURATION_MS,
    isCrop,
    isItem,
    ITEM_IDS,
    ITEMS,
    MATCH_DURATION_MS,
    PLAYER_SPEED,
    PLOT_COUNT,
    plotCenter,
    PLOT_RANGE,
    RIPE_WINDOW_MS,
    SCARECROW_DURATION_MS,
    SPAWN,
    STARTING_MONEY,
    TICK_RATE,
    type CropId,
    type GameAction,
    type GameEvent,
    type ItemId,
    type PlayerState,
    type PlotState,
    type ServerMessage,
    type Side,
} from '@gogrow/shared'

/** Anything that can sit in a match: a websocket connection or a bot. */
export interface Participant {
    name: string
    send(msg: ServerMessage): void
}

interface Seat {
    participant: Participant
    state: PlayerState
    /** events queued for this seat, flushed every tick */
    events: GameEvent[]
    lastMoveAt: number
}

/** Extra reach granted for network jitter between what the client saw and what the server has. */
const RANGE_SLACK = 6
const FACINGS = new Set(['down', 'up', 'left', 'right'])

function freshPlayer(name: string): PlayerState {
    return {
        name,
        money: STARTING_MONEY,
        avatar: { ...SPAWN, facing: 'down', moving: false },
        seeds: Object.fromEntries(CROP_IDS.map((id) => [id, 0])) as Record<CropId, number>,
        plots: Array.from({ length: PLOT_COUNT }, () => ({ crop: null, progress: 0, witherInMs: 0 })),
        effects: { droughtMs: 0, frozenMs: 0, scarecrowMs: 0 },
        cooldowns: Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>,
    }
}

export class Match {
    private readonly seats: [Seat, Seat]
    private timeLeftMs = MATCH_DURATION_MS
    private timer: ReturnType<typeof setInterval> | null = null
    private lastTick = 0
    private finished = false
    onFinish: (() => void) | null = null

    constructor(a: Participant, b: Participant) {
        const seat = (participant: Participant): Seat => ({
            participant,
            state: freshPlayer(participant.name),
            events: [],
            lastMoveAt: performance.now(),
        })
        this.seats = [seat(a), seat(b)]
    }

    start() {
        const [a, b] = this.seats
        a.participant.send({ t: 'start', opponentName: b.state.name, durationMs: MATCH_DURATION_MS })
        b.participant.send({ t: 'start', opponentName: a.state.name, durationMs: MATCH_DURATION_MS })
        this.lastTick = performance.now()
        for (const s of this.seats) s.lastMoveAt = this.lastTick
        this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE)
        this.broadcast()
    }

    /** Read-only view used by bots to make decisions. */
    view(p: Participant) {
        const me = this.seat(p)
        return { you: me.state, opponent: this.other(me).state, timeLeftMs: this.timeLeftMs }
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

    private apply(me: Seat, msg: GameAction): string | null {
        if (!isValidAction(msg)) return 'Invalid move'
        const s = me.state
        if (s.effects.frozenMs > 0) {
            // Movement is dropped silently while frozen; the next snapshot snaps the client back.
            return msg.t === 'move' ? null : 'You are frozen!'
        }

        switch (msg.t) {
            case 'move':
                this.move(me, msg)
                return null
            case 'buy':
                if (!atShop(s.avatar, RANGE_SLACK)) return 'Walk to the shop first'
                return isCrop(msg.id) ? this.buySeed(s, msg.id) : this.useItem(me, msg.id, msg.plot)
            case 'plant': {
                const plot = s.plots[msg.plot]!
                if (!this.inReach(s, msg.plot)) return 'Too far away'
                if (plot.crop) return 'Plot is occupied'
                if (s.seeds[msg.crop] <= 0) return `No ${CROPS[msg.crop].name} seeds, visit the shop`
                s.seeds[msg.crop]--
                plot.crop = msg.crop
                plot.progress = 0
                plot.witherInMs = 0
                return null
            }
            case 'harvest': {
                const plot = s.plots[msg.plot]!
                if (!this.inReach(s, msg.plot)) return 'Too far away'
                if (!plot.crop) return 'Nothing to harvest'
                if (plot.progress < 1) return 'Not ripe yet'
                const amount = CROPS[plot.crop].sellPrice
                s.money += amount
                clearPlot(plot)
                this.emit(me, { kind: 'harvest', plot: msg.plot, amount })
                return null
            }
        }
    }

    /**
     * Clients move their own avatar for instant response. The server only checks the
     * move is physically possible (speed + bounds) and clamps it otherwise.
     */
    private move(me: Seat, msg: Extract<GameAction, { t: 'move' }>) {
        const now = performance.now()
        const elapsed = Math.min(250, now - me.lastMoveAt)
        me.lastMoveAt = now
        const a = me.state.avatar
        const maxStep = (PLAYER_SPEED * elapsed) / 1000 + 8
        let x = clamp(msg.x, BOUNDS.minX, BOUNDS.maxX)
        let y = clamp(msg.y, BOUNDS.minY, BOUNDS.maxY)
        const d = distance(a, { x, y })
        if (d > maxStep) {
            x = a.x + ((x - a.x) / d) * maxStep
            y = a.y + ((y - a.y) / d) * maxStep
        }
        a.x = x
        a.y = y
        a.facing = msg.facing
        a.moving = msg.moving
    }

    private inReach(s: PlayerState, plot: number) {
        return distance(s.avatar, plotCenter(plot)) <= PLOT_RANGE + RANGE_SLACK
    }

    private buySeed(s: PlayerState, id: CropId): string | null {
        const crop = CROPS[id]
        if (s.money < crop.cost) return 'Not enough money'
        s.money -= crop.cost
        s.seeds[id]++
        return null
    }

    private useItem(me: Seat, itemId: ItemId, plotIndex?: number): string | null {
        const item = ITEMS[itemId]
        const s = me.state
        if (s.cooldowns[itemId] > 0) return `${item.name} is on cooldown`
        if (s.money < item.cost) return 'Not enough money'

        const opp = this.other(me)
        if (item.targeted) {
            const target = plotIndex === undefined ? undefined : opp.state.plots[plotIndex]
            if (!target) return 'Pick an enemy plot'
            if (!target.crop) return 'That plot is empty'
        }

        s.money -= item.cost
        s.cooldowns[itemId] = item.cooldownMs

        if (item.kind === 'buff') {
            if (itemId === 'fertilizer') {
                for (const p of s.plots) if (p.crop && p.progress < 1) ripen(p)
            } else if (itemId === 'scarecrow') {
                s.effects.scarecrowMs = SCARECROW_DURATION_MS
            }
            this.emit(me, { kind: 'item', item: itemId, blocked: false })
            return null
        }

        const o = opp.state
        const blocked = o.effects.scarecrowMs > 0
        if (blocked) {
            o.effects.scarecrowMs = 0
        } else {
            switch (itemId) {
                case 'lightning':
                    clearPlot(o.plots[plotIndex!]!)
                    break
                case 'drought':
                    o.effects.droughtMs = DROUGHT_DURATION_MS
                    break
                case 'freeze':
                    o.effects.frozenMs = FREEZE_DURATION_MS
                    o.avatar.moving = false
                    break
                case 'tornado':
                    o.plots.forEach(clearPlot)
                    break
            }
        }
        this.emit(me, { kind: 'item', item: itemId, plot: plotIndex, blocked })
        return null
    }

    private tick() {
        const now = performance.now()
        const dt = now - this.lastTick
        this.lastTick = now
        this.timeLeftMs = Math.max(0, this.timeLeftMs - dt)

        for (const seat of this.seats) {
            const s = seat.state
            const growth = s.effects.droughtMs > 0 ? DROUGHT_GROWTH_MULTIPLIER : 1
            s.plots.forEach((plot, i) => {
                if (!plot.crop) return
                if (plot.progress < 1) {
                    plot.progress = Math.min(1, plot.progress + (dt * growth) / CROPS[plot.crop].growMs)
                    if (plot.progress >= 1) ripen(plot)
                } else {
                    plot.witherInMs -= dt
                    if (plot.witherInMs <= 0) {
                        clearPlot(plot)
                        this.emit(seat, { kind: 'wither', plot: i })
                    }
                }
            })
            s.effects.droughtMs = Math.max(0, s.effects.droughtMs - dt)
            s.effects.frozenMs = Math.max(0, s.effects.frozenMs - dt)
            s.effects.scarecrowMs = Math.max(0, s.effects.scarecrowMs - dt)
            for (const id of ITEM_IDS) s.cooldowns[id] = Math.max(0, s.cooldowns[id] - dt)
        }

        this.broadcast()

        if (this.timeLeftMs <= 0) {
            const [a, b] = this.seats
            const winner = a.state.money === b.state.money ? null : a.state.money > b.state.money ? a : b
            this.finish('time', winner)
        }
    }

    private finish(reason: 'time' | 'opponent_left', winner: Seat | null) {
        if (this.finished) return
        this.finished = true
        if (this.timer) clearInterval(this.timer)
        for (const seat of this.seats) {
            seat.participant.send({
                t: 'end',
                result: winner === null ? 'draw' : winner === seat ? 'win' : 'lose',
                reason,
                yourMoney: seat.state.money,
                opponentMoney: this.other(seat).state.money,
            })
        }
        this.onFinish?.()
    }

    private broadcast() {
        for (const seat of this.seats) {
            seat.participant.send({
                t: 'state',
                timeLeftMs: this.timeLeftMs,
                you: seat.state,
                opponent: this.other(seat).state,
            })
            if (seat.events.length) {
                seat.participant.send({ t: 'events', events: seat.events })
                seat.events = []
            }
        }
    }

    /** Queue an event caused by/happening to `actor`, mirrored for both sides. */
    private emit(actor: Seat, event: DistributiveOmit<GameEvent, 'by'>) {
        for (const seat of this.seats) {
            const by: Side = seat === actor ? 'you' : 'opponent'
            seat.events.push({ ...event, by } as GameEvent)
        }
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
    const validPlot = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < PLOT_COUNT
    switch (msg.t) {
        case 'move':
            return (
                Number.isFinite(msg.x) &&
                Number.isFinite(msg.y) &&
                FACINGS.has(msg.facing) &&
                typeof msg.moving === 'boolean'
            )
        case 'buy':
            return (
                typeof msg.id === 'string' &&
                (isCrop(msg.id) || isItem(msg.id)) &&
                (msg.plot === undefined || validPlot(msg.plot))
            )
        case 'plant':
            return validPlot(msg.plot) && typeof msg.crop === 'string' && isCrop(msg.crop)
        case 'harvest':
            return validPlot(msg.plot)
        default:
            return false
    }
}

function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v))
}

function clearPlot(plot: PlotState) {
    plot.crop = null
    plot.progress = 0
    plot.witherInMs = 0
}

function ripen(plot: PlotState) {
    plot.progress = 1
    plot.witherInMs = RIPE_WINDOW_MS
}
