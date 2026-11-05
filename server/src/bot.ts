import {
    atShop,
    CROP_IDS,
    CROPS,
    distance,
    ITEMS,
    PLAYER_SPEED,
    plotCenter,
    plotInReach,
    SHOP,
    type Facing,
    type ServerMessage,
} from '@gogrow/shared'
import type { Match, Participant } from './match.ts'

const BOT_NAMES = ['Farmer Bot', 'Old MacBot', 'Robo Reaper', 'Tractor 3000']
const THINK_MS = 50
/** Pause between actions so the bot plays at a human-ish pace. */
const ACTION_COOLDOWN_MS = 350

/** A simple practice opponent. It walks and acts through the same Match API as humans. */
export class Bot implements Participant {
    readonly name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]!
    private match: Match | null = null
    private timer: ReturnType<typeof setInterval> | null = null
    private busyMs = 0

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
        const { you, opponent, timeLeftMs } = match.view(this)
        if (you.effects.frozenMs > 0) return
        if (this.busyMs > 0) {
            this.busyMs -= THINK_MS
            return
        }
        const act = (msg: Parameters<Match['handle']>[1]) => {
            this.stop()
            match.handle(this, msg)
            this.busyMs = ACTION_COOLDOWN_MS
        }

        // 1. Harvest anything ripe.
        const ripe = you.plots.findIndex((p) => p.crop && p.progress >= 1)
        if (ripe !== -1) {
            if (plotInReach(you.avatar) === ripe) return act({ t: 'harvest', plot: ripe })
            return this.walkTo(plotCenter(ripe))
        }

        const seedCount = CROP_IDS.reduce((n, id) => n + you.seeds[id], 0)
        const emptyPlots = you.plots.flatMap((p, i) => (p.crop ? [] : [i]))

        // 2. Plant seeds we carry.
        if (seedCount > 0 && emptyPlots.length) {
            const target = emptyPlots.sort((a, b) => distance(you.avatar, plotCenter(a)) - distance(you.avatar, plotCenter(b)))[0]!
            if (plotInReach(you.avatar) === target) {
                const crop = CROP_IDS.find((id) => you.seeds[id] > 0)!
                return act({ t: 'plant', plot: target, crop })
            }
            return this.walkTo(plotCenter(target))
        }

        // 3. Restock (and maybe sabotage) at the shop.
        const affordable = CROP_IDS.filter((id) => CROPS[id].cost <= you.money && CROPS[id].growMs < timeLeftMs - 4_000)
        if (emptyPlots.length && affordable.length) {
            if (!atShop(you.avatar)) return this.walkTo(SHOP.door)
            const juiciest = opponent.plots
                .map((p, i) => ({ i, value: p.crop ? CROPS[p.crop].sellPrice * p.progress : 0 }))
                .sort((a, b) => b.value - a.value)[0]
            if (
                juiciest &&
                juiciest.value > 90 &&
                you.cooldowns.lightning === 0 &&
                you.money >= ITEMS.lightning.cost + 30 &&
                Math.random() < 0.3
            ) {
                return act({ t: 'buy', id: 'lightning', plot: juiciest.i })
            }
            const pick = affordable[Math.floor(Math.random() * affordable.length)]!
            return act({ t: 'buy', id: pick })
        }

        this.stop()
    }

    private walkTo(target: { x: number; y: number }) {
        const match = this.match!
        const a = match.view(this).you.avatar
        const dx = target.x - a.x
        const dy = target.y - a.y
        const d = Math.hypot(dx, dy)
        const step = Math.min(d, (PLAYER_SPEED * 0.9 * THINK_MS) / 1000)
        if (d < 1) return this.stop()
        const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
        match.handle(this, { t: 'move', x: a.x + (dx / d) * step, y: a.y + (dy / d) * step, facing, moving: true })
    }

    private stop() {
        const match = this.match!
        const a = match.view(this).you.avatar
        if (a.moving) match.handle(this, { t: 'move', x: a.x, y: a.y, facing: a.facing, moving: false })
    }
}
