import {
    atGate,
    CASTLE,
    distance,
    LOADS,
    REACH,
    RESOURCE_SPOTS,
    SHOP,
    speedFor,
    SWING_COOLDOWN_MS,
    walk,
    type Facing,
    type Point,
    type ServerMessage,
    type ShopId,
} from '@gogrow/shared'
import type { Match, Participant } from './match.ts'

const SOLDIER_PICKS: ShopId[] = ['warrior', 'archer', 'lancer', 'warrior', 'monk']
const BOT_NAMES = ['Sir Botsalot', 'Lord Pixel', 'Duke Chopper', 'Baron Bleat']
const THINK_MS = 50
/** The bot swings a bit slower than a fast human can mash. */
const BOT_SWING_MS = SWING_COOLDOWN_MS + 140

/** A practice opponent that walks, gathers and sabotages through the same Match API as humans. */
export class Bot implements Participant {
    readonly name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]!
    private match: Match | null = null
    private timer: ReturnType<typeof setInterval> | null = null
    private swingIn = 0
    private shopIn = 0

    attach(match: Match) {
        this.match = match
        this.timer = setInterval(() => this.think(), THINK_MS)
    }

    send(msg: ServerMessage) {
        if (msg.t === 'end' && this.timer) clearInterval(this.timer)
    }

    private think() {
        const match = this.match
        if (!match) return
        const { you, opponent, soldiers, bridge } = match.view(this)
        this.swingIn -= THINK_MS
        this.shopIn -= THINK_MS
        if (you.effects.stunMs > 0) return

        // Army: charge once we have a squad and a way across, fall back when outnumbered.
        const mine = soldiers.filter((s) => s.mine).length
        const theirs = soldiers.length - mine
        const order = bridge.status === 'up' && mine >= 3 && mine >= theirs ? 'charge' : 'defend'
        if (order !== you.order) match.handle(this, { t: 'order', order })

        if (atGate(you.pawn, 8) && this.shopIn <= 0) {
            this.shopIn = 1200
            const army = { mine, theirs, bridgeDown: bridge.status === 'none' }
            const pick = this.shoppingList(you.gold, you.upgrades, opponent.raider !== null, army)
            if (pick && you.cooldowns[pick] === 0) {
                const target = SHOP[pick].targeted ? { x: opponent.pawn.x, y: opponent.pawn.y } : {}
                match.handle(this, { t: 'buy', id: pick, ...target })
            }
        }

        if (you.carrying) return this.walkTo(CASTLE.gate, 20)

        // Pick the best value-per-distance target that is standing.
        const options: { p: Point; value: number }[] = []
        you.resources.forEach((r, i) => {
            if (r.regrowMs === 0 && r.hp > 0) options.push({ p: RESOURCE_SPOTS[i]!, value: LOADS[r.kind === 'tree' ? 'wood' : 'gold'].value / r.hp })
        })
        you.sheep.forEach((s) => {
            if (s.alive) options.push({ p: s, value: LOADS.meat.value / 3 })
        })
        const best = options.sort((a, b) => b.value / (distance(you.pawn, b.p) + 120) - a.value / (distance(you.pawn, a.p) + 120))[0]
        if (!best) return this.stop()
        if (distance(you.pawn, best.p) <= REACH - 8) {
            this.stop()
            if (this.swingIn <= 0) {
                match.handle(this, { t: 'swing' })
                this.swingIn = BOT_SWING_MS
            }
            return
        }
        this.walkTo(best.p, REACH - 14)
    }

    private shoppingList(
        gold: number,
        upgrades: Record<string, boolean>,
        raiderBusy: boolean,
        army: { mine: number; theirs: number; bridgeDown: boolean },
    ): ShopId | null {
        if (!upgrades.pickaxe && gold >= SHOP.pickaxe.cost + 40) return 'pickaxe'
        if (!upgrades.axe && gold >= SHOP.axe.cost + 40) return 'axe'
        if (army.theirs > army.mine && gold >= SHOP.warrior.cost) return SOLDIER_PICKS[Math.floor(Math.random() * 3)]!
        if (army.mine < 4 && gold >= 140) return SOLDIER_PICKS[Math.floor(Math.random() * SOLDIER_PICKS.length)]!
        if (army.bridgeDown && army.mine >= 3 && gold >= SHOP.bridge.cost + 20) return 'bridge'
        if (gold >= 180 && Math.random() < 0.5) return 'keg'
        if (gold >= 260 && !raiderBusy && Math.random() < 0.4) return 'raider'
        if (!upgrades.boots && gold >= 200) return 'boots'
        return null
    }

    private walkTo(target: Point, stopAt: number) {
        const match = this.match!
        const { you } = match.view(this)
        const a = you.pawn
        const d = distance(a, target)
        if (d <= stopAt) return this.stop()
        const step = Math.min(d, (speedFor(you.upgrades.boots) * 0.85 * THINK_MS) / 1000)
        let next = walk(a, { x: a.x + ((target.x - a.x) / d) * step, y: a.y + ((target.y - a.y) / d) * step })
        // Stuck on a collider: sidestep vertically, then horizontally.
        if (distance(next, a) < 0.5) next = walk(a, { x: a.x, y: a.y + Math.sign(target.y - a.y || 1) * step })
        if (distance(next, a) < 0.5) next = walk(a, { x: a.x + Math.sign(target.x - a.x || 1) * step, y: a.y })
        const facing: Facing = target.x < a.x ? 'left' : 'right'
        match.handle(this, { t: 'move', x: next.x, y: next.y, facing, moving: true })
    }

    private stop() {
        const match = this.match!
        const a = match.view(this).you.pawn
        if (a.moving) match.handle(this, { t: 'move', x: a.x, y: a.y, facing: a.facing, moving: false })
    }
}
