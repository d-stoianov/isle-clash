import {
    CROPS,
    DROUGHT_DURATION_MS,
    DROUGHT_GROWTH_MULTIPLIER,
    FREEZE_DURATION_MS,
    ITEM_IDS,
    ITEMS,
    MATCH_DURATION_MS,
    RIPE_WINDOW_MS,
    SCARECROW_DURATION_MS,
    STARTING_MONEY,
    TICK_RATE,
    TILE_COUNT,
    type ClientMessage,
    type GameEvent,
    type ItemId,
    type PlayerState,
    type ServerMessage,
    type Side,
} from '@gogrow/shared'

/** Anything that can sit in a match: a websocket connection or a bot. */
export interface Participant {
    name: string
    send(msg: ServerMessage): void
}

type GameAction = Extract<ClientMessage, { t: 'plant' | 'harvest' | 'use' }>

interface Seat {
    participant: Participant
    state: PlayerState
    /** events queued for this seat, flushed every tick */
    events: GameEvent[]
}

function freshPlayer(name: string): PlayerState {
    return {
        name,
        money: STARTING_MONEY,
        tiles: Array.from({ length: TILE_COUNT }, () => ({ crop: null, progress: 0, witherInMs: 0 })),
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
        })
        this.seats = [seat(a), seat(b)]
    }

    start() {
        const [a, b] = this.seats
        a.participant.send({ t: 'start', opponentName: b.state.name, durationMs: MATCH_DURATION_MS })
        b.participant.send({ t: 'start', opponentName: a.state.name, durationMs: MATCH_DURATION_MS })
        this.lastTick = performance.now()
        this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE)
        this.broadcast()
    }

    has(p: Participant) {
        return this.seats.some((s) => s.participant === p)
    }

    /** Read-only view used by bots to make decisions. */
    view(p: Participant) {
        const me = this.seat(p)
        const opp = this.other(me)
        return { you: me.state, opponent: opp.state, timeLeftMs: this.timeLeftMs }
    }

    leave(p: Participant) {
        if (this.finished) return
        const leaver = this.seat(p)
        this.finish('opponent_left', this.other(leaver))
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
        if (s.effects.frozenMs > 0) return 'You are frozen!'

        switch (msg.t) {
            case 'plant': {
                const tile = s.tiles[msg.tile]
                const crop = CROPS[msg.crop]
                if (!tile || !crop) return 'Invalid move'
                if (tile.crop) return 'Tile is occupied'
                if (s.money < crop.cost) return 'Not enough money'
                s.money -= crop.cost
                tile.crop = crop.id
                tile.progress = 0
                tile.witherInMs = 0
                return null
            }
            case 'harvest': {
                const tile = s.tiles[msg.tile]
                if (!tile?.crop) return 'Nothing to harvest'
                if (tile.progress < 1) return 'Not ripe yet'
                const amount = CROPS[tile.crop].sellPrice
                s.money += amount
                clearTile(tile)
                this.emit(me, { kind: 'harvest', tile: msg.tile, amount })
                return null
            }
            case 'use':
                return this.useItem(me, msg.item, msg.tile)
        }
    }

    private useItem(me: Seat, itemId: ItemId, tileIndex?: number): string | null {
        const item = ITEMS[itemId]
        if (!item) return 'Invalid item'
        const s = me.state
        if (s.cooldowns[itemId] > 0) return `${item.name} is on cooldown`
        if (s.money < item.cost) return 'Not enough money'

        const opp = this.other(me)
        if (item.targeted) {
            const target = tileIndex === undefined ? undefined : opp.state.tiles[tileIndex]
            if (!target) return 'Pick an enemy tile'
            if (!target.crop) return 'That tile is empty'
        }

        s.money -= item.cost
        s.cooldowns[itemId] = item.cooldownMs

        if (item.kind === 'buff') {
            if (itemId === 'fertilizer') {
                for (const t of s.tiles) {
                    if (t.crop && t.progress < 1) ripen(t)
                }
            } else if (itemId === 'scarecrow') {
                s.effects.scarecrowMs = SCARECROW_DURATION_MS
            }
            this.emit(me, { kind: 'item', item: itemId, blocked: false })
            return null
        }

        const blocked = opp.state.effects.scarecrowMs > 0
        if (blocked) {
            opp.state.effects.scarecrowMs = 0
        } else {
            const o = opp.state
            switch (itemId) {
                case 'lightning':
                    clearTile(o.tiles[tileIndex!]!)
                    break
                case 'drought':
                    o.effects.droughtMs = DROUGHT_DURATION_MS
                    break
                case 'freeze':
                    o.effects.frozenMs = FREEZE_DURATION_MS
                    break
                case 'tornado':
                    o.tiles.forEach(clearTile)
                    break
            }
        }
        this.emit(me, { kind: 'item', item: itemId, tile: tileIndex, blocked })
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
            s.tiles.forEach((tile, i) => {
                if (!tile.crop) return
                if (tile.progress < 1) {
                    tile.progress = Math.min(1, tile.progress + (dt * growth) / CROPS[tile.crop].growMs)
                    if (tile.progress >= 1) ripen(tile)
                } else {
                    tile.witherInMs -= dt
                    if (tile.witherInMs <= 0) {
                        clearTile(tile)
                        this.emit(seat, { kind: 'wither', tile: i })
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
            const winner =
                a.state.money === b.state.money ? null : a.state.money > b.state.money ? a : b
            this.finish('time', winner)
        }
    }

    private finish(reason: 'time' | 'opponent_left', winner: Seat | null) {
        if (this.finished) return
        this.finished = true
        if (this.timer) clearInterval(this.timer)
        for (const seat of this.seats) {
            const opp = this.other(seat)
            seat.participant.send({
                t: 'end',
                result: winner === null ? 'draw' : winner === seat ? 'win' : 'lose',
                reason,
                yourMoney: seat.state.money,
                opponentMoney: opp.state.money,
            })
        }
        this.onFinish?.()
    }

    private broadcast() {
        for (const seat of this.seats) {
            const opp = this.other(seat)
            seat.participant.send({
                t: 'state',
                timeLeftMs: this.timeLeftMs,
                you: seat.state,
                opponent: opp.state,
            })
            const events = [...seat.events]
            seat.events = []
            if (events.length) seat.participant.send({ t: 'events', events })
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

/** Messages come straight off the wire, so never trust their shape. */
function isValidAction(msg: GameAction): boolean {
    const validTile = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < TILE_COUNT
    switch (msg.t) {
        case 'plant':
            return validTile(msg.tile) && Object.hasOwn(CROPS, msg.crop)
        case 'harvest':
            return validTile(msg.tile)
        case 'use':
            return Object.hasOwn(ITEMS, msg.item) && (msg.tile === undefined || validTile(msg.tile))
        default:
            return false
    }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

function clearTile(tile: PlayerState['tiles'][number]) {
    tile.crop = null
    tile.progress = 0
    tile.witherInMs = 0
}

function ripen(tile: PlayerState['tiles'][number]) {
    tile.progress = 1
    tile.witherInMs = RIPE_WINDOW_MS
}
