import { CROP_IDS, CROPS, ITEMS, type ServerMessage } from '@gogrow/shared'
import type { Match, Participant } from './match.ts'

const BOT_NAMES = ['Farmer Bot', 'Old MacBot', 'Robo Reaper', 'Tractor 3000']

/** A simple practice opponent that plays through the same Match API as humans. */
export class Bot implements Participant {
    readonly name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]!
    private match: Match | null = null
    private timer: ReturnType<typeof setInterval> | null = null

    attach(match: Match) {
        this.match = match
        // Act at a human-ish pace.
        this.timer = setInterval(() => this.think(), 700)
    }

    send(msg: ServerMessage) {
        if (msg.t === 'end' && this.timer) clearInterval(this.timer)
    }

    private think() {
        const match = this.match
        if (!match) return
        const { you, opponent, timeLeftMs } = match.view(this)
        if (you.effects.frozenMs > 0) return

        const ripe = you.tiles.findIndex((t) => t.crop && t.progress >= 1)
        if (ripe !== -1) return match.handle(this, { t: 'harvest', tile: ripe })

        // Occasionally strike the opponent's most valuable crop.
        const juiciest = opponent.tiles
            .map((t, i) => ({ i, value: t.crop ? CROPS[t.crop].sellPrice * t.progress : 0 }))
            .sort((a, b) => b.value - a.value)[0]
        if (
            juiciest &&
            juiciest.value > 80 &&
            you.cooldowns.lightning === 0 &&
            you.money >= ITEMS.lightning.cost + 20 &&
            Math.random() < 0.35
        ) {
            return match.handle(this, { t: 'use', item: 'lightning', tile: juiciest.i })
        }

        const empty = you.tiles.findIndex((t) => !t.crop)
        if (empty === -1) return
        // Only plant crops that can still ripen before time runs out.
        const affordable = CROP_IDS.filter(
            (id) => CROPS[id].cost <= you.money && CROPS[id].growMs < timeLeftMs - 1_000,
        )
        const pick = affordable[Math.floor(Math.random() * affordable.length)]
        if (pick) match.handle(this, { t: 'plant', tile: empty, crop: pick })
    }
}
