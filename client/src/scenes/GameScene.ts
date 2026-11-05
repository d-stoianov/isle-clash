import Phaser from 'phaser'
import {
    CROP_IDS,
    CROPS,
    ITEM_IDS,
    ITEMS,
    type CropId,
    type GameEvent,
    type ItemId,
    type ServerMessage,
} from '@gogrow/shared'
import { net } from '../net.ts'
import { FieldView, FIELD_W } from '../FieldView.ts'
import { button, floatText, pixelPanel, text } from '../ui.ts'

type Selection = { kind: 'crop'; id: CropId } | { kind: 'item'; id: ItemId }
type StateMsg = Extract<ServerMessage, { t: 'state' }>
type EndMsg = Extract<ServerMessage, { t: 'end' }>

const HALF = 640
const FIELD_Y = 100
const DEFAULT_SELECTION: Selection = { kind: 'crop', id: 'radish' }
const SEED_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'] as const
const ITEM_KEYS = ['Q', 'W', 'E', 'R', 'T', 'Y'] as const

interface Card {
    bg: Phaser.GameObjects.Graphics
    x: number
    y: number
    w: number
    h: number
    cost: number
    parts: (Phaser.GameObjects.Text | Phaser.GameObjects.Image)[]
    cooldown: Phaser.GameObjects.Text
}

export class GameScene extends Phaser.Scene {
    private myField!: FieldView
    private oppField!: FieldView
    private selection: Selection = DEFAULT_SELECTION
    private state: StateMsg | null = null
    private seedCards = new Map<CropId, Card>()
    private itemCards = new Map<ItemId, Card>()
    private timerText!: Phaser.GameObjects.Text
    private myMoney!: Phaser.GameObjects.Text
    private oppMoney!: Phaser.GameObjects.Text
    private hint!: Phaser.GameObjects.Text
    private feed: string[] = []
    private feedText!: Phaser.GameObjects.Text
    private toast!: Phaser.GameObjects.Text
    private opponentName = 'Opponent'
    private ended = false

    constructor() {
        super('game')
    }

    create(data: { myName: string; opponentName: string }) {
        this.ended = false
        this.feed = []
        this.state = null
        this.selection = DEFAULT_SELECTION
        this.seedCards.clear()
        this.itemCards.clear()
        this.opponentName = data.opponentName

        // halves
        this.add.rectangle(HALF / 2, 360, HALF, 720, 0x24361f)
        this.add.rectangle(HALF + HALF / 2, 360, HALF, 720, 0x2d2a1f)
        this.add.rectangle(HALF, 360, 8, 720, 0x0e150d)

        // header
        text(this, 24, 26, data.myName, 16, '#c8f56b')
        text(this, HALF + 96, 26, data.opponentName, 16, '#ffb36b')
        this.myMoney = text(this, HALF - 96, 26, '', 16, '#ffe066').setOrigin(1, 0)
        this.oppMoney = text(this, 1280 - 24, 26, '', 16, '#ffe066').setOrigin(1, 0)
        const timerBg = this.add.graphics().setDepth(49)
        pixelPanel(timerBg, HALF - 70, 10, 140, 52, 0x1d2b1f)
        this.timerText = text(this, HALF, 37, '2:00', 22).setOrigin(0.5).setDepth(50)

        const fx = (HALF - FIELD_W) / 2
        this.myField = new FieldView(this, fx, FIELD_Y, (i) => this.clickMyTile(i))
        this.oppField = new FieldView(this, HALF + fx, FIELD_Y, (i) => this.clickOppTile(i))
        this.myField.hoverColor = 0xffffff

        this.buildShop()

        text(this, HALF + 40, 484, 'BATTLE LOG', 12, '#bfae8a')
        this.feedText = text(this, HALF + 40, 512, '', 11, '#efe6d2', { lineSpacing: 12 })
        this.hint = text(this, HALF / 2, 708, '', 9, '#a9c49a').setOrigin(0.5, 1)
        this.toast = text(this, HALF / 2, 456, '', 14, '#ff7b6b').setOrigin(0.5).setStroke('#000000', 6).setDepth(60).setAlpha(0)

        this.bindKeys()
        this.refreshSelection()

        const handlers: [string, (msg: never) => void][] = [
            ['state', (m: StateMsg) => this.onState(m)],
            ['events', (m: { events: GameEvent[] }) => m.events.forEach((e) => this.onEvent(e))],
            ['end', (m: EndMsg) => this.onEnd(m)],
            ['error', (m: { message: string }) => this.showToast(m.message)],
            ['close', () => this.onDisconnect()],
        ]
        for (const [name, fn] of handlers) net.on(name, fn)
        this.events.once('shutdown', () => {
            for (const [name, fn] of handlers) net.off(name, fn)
        })
    }

    // ---------- shop ----------

    private buildShop() {
        const seedW = 108
        const seedX = (HALF - (seedW * 5 + 8 * 4)) / 2
        CROP_IDS.forEach((id, i) => {
            const c = CROPS[id]
            const card = this.card(seedX + i * (seedW + 8), 480, seedW, 100, c.cost, String(i + 1), id, [
                `$${c.cost}>$${c.sellPrice}`,
                `${c.growMs / 1000}s`,
            ])
            this.seedCards.set(id, card)
            this.cardZone(card, () => this.select({ kind: 'crop', id }))
        })

        const itemW = 92
        const itemX = (HALF - (itemW * 6 + 8 * 5)) / 2
        ITEM_IDS.forEach((id, i) => {
            const it = ITEMS[id]
            const card = this.card(itemX + i * (itemW + 8), 592, itemW, 96, it.cost, ITEM_KEYS[i]!, id, [it.name, `$${it.cost}`])
            this.itemCards.set(id, card)
            const zone = this.cardZone(card, () => this.clickItem(id))
            zone.on('pointerover', () => this.hint.setText(`${it.name}: ${it.description}`))
            zone.on('pointerout', () => this.refreshHint())
        })
    }

    private card(x: number, y: number, w: number, h: number, cost: number, key: string, sprite: string, lines: string[]): Card {
        const bg = this.add.graphics()
        const parts: Card['parts'] = [this.add.image(x + w / 2, y + 32, sprite).setScale(3)]
        lines.forEach((line, i) => {
            const size = line.length > 8 ? 7 : 9
            parts.push(text(this, x + w / 2, y + 62 + i * 16, line, size, '#1d1d1d').setOrigin(0.5, 0))
        })
        text(this, x + 9, y + 9, key, 8, '#6b5a3a')
        const cooldown = text(this, x + w / 2, y + h / 2, '', 20).setOrigin(0.5).setStroke('#000000', 6).setDepth(5)
        return { bg, x, y, w, h, cost, parts, cooldown }
    }

    private cardZone(card: Card, onClick: () => void) {
        const zone = this.add.zone(card.x + card.w / 2, card.y + card.h / 2, card.w, card.h).setInteractive({ useHandCursor: true })
        zone.on('pointerdown', onClick)
        return zone
    }

    private drawCard(card: Card, selected: boolean, affordable: boolean, cooldownMs = 0, cooldownTotal = 1) {
        const { bg, x, y, w, h } = card
        bg.clear()
        pixelPanel(bg, x, y, w, h, selected ? 0xd7f5a8 : affordable ? 0xf3e7c4 : 0x8f8875)
        if (selected) {
            bg.fillStyle(0x3fbf3f, 1)
            bg.fillRect(x, y, w, 4).fillRect(x, y + h - 4, w, 4).fillRect(x, y, 4, h).fillRect(x + w - 4, y, 4, h)
        }
        if (cooldownMs > 0) bg.fillStyle(0x000000, 0.55).fillRect(x + 4, y + 4, w - 8, (h - 8) * (cooldownMs / cooldownTotal))
        card.parts.forEach((p) => p.setAlpha(affordable ? 1 : 0.5))
        card.cooldown.setText(cooldownMs > 0 ? String(Math.ceil(cooldownMs / 1000)) : '')
    }

    private refreshShop() {
        const me = this.state?.you
        const money = me?.money ?? 0
        for (const [id, card] of this.seedCards) {
            const sel = this.selection.kind === 'crop' && this.selection.id === id
            this.drawCard(card, sel, money >= card.cost)
        }
        for (const [id, card] of this.itemCards) {
            const sel = this.selection.kind === 'item' && this.selection.id === id
            this.drawCard(card, sel, money >= card.cost, me?.cooldowns[id] ?? 0, ITEMS[id].cooldownMs)
        }
    }

    // ---------- input ----------

    private bindKeys() {
        const kb = this.input.keyboard!
        SEED_KEYS.forEach((k, i) => kb.on(`keydown-${k}`, () => this.select({ kind: 'crop', id: CROP_IDS[i]! })))
        ITEM_KEYS.forEach((k, i) => kb.on(`keydown-${k}`, () => this.clickItem(ITEM_IDS[i]!)))
        kb.on('keydown-ESC', () => this.select(DEFAULT_SELECTION))
        this.input.mouse?.disableContextMenu()
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
            if (p.rightButtonDown() && this.selection.kind === 'item') this.select(DEFAULT_SELECTION)
        })
    }

    private select(sel: Selection) {
        this.selection = sel
        this.refreshSelection()
    }

    private refreshSelection() {
        this.oppField.hoverColor = this.selection.kind === 'item' ? 0xffe14a : null
        this.refreshShop()
        this.refreshHint()
    }

    private refreshHint() {
        const s = this.selection
        this.hint.setText(
            s.kind === 'item'
                ? `${ITEMS[s.id].name}: click an enemy crop. ESC to cancel`
                : `Planting ${CROPS[s.id].name}. Click empty tiles. Click ripe crops to sell`,
        )
    }

    private clickItem(id: ItemId) {
        if (this.ended) return
        if (ITEMS[id].targeted) return this.select({ kind: 'item', id })
        net.send({ t: 'use', item: id })
    }

    private clickMyTile(i: number) {
        if (this.ended) return
        const tile = this.state?.you.tiles[i]
        if (!tile) return
        if (tile.crop) {
            if (tile.progress >= 1) net.send({ t: 'harvest', tile: i })
            return
        }
        if (this.selection.kind === 'crop') net.send({ t: 'plant', tile: i, crop: this.selection.id })
    }

    private clickOppTile(i: number) {
        if (this.ended || this.selection.kind !== 'item') return
        net.send({ t: 'use', item: this.selection.id, tile: i })
        this.select(DEFAULT_SELECTION)
    }

    // ---------- server messages ----------

    private onState(msg: StateMsg) {
        this.state = msg
        this.myField.update(msg.you)
        this.oppField.update(msg.opponent)
        this.myMoney.setText(`$${msg.you.money}`)
        this.oppMoney.setText(`$${msg.opponent.money}`)
        const s = Math.ceil(msg.timeLeftMs / 1000)
        this.timerText.setText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
        this.timerText.setColor(s <= 10 ? '#ff6b5b' : '#ffffff')
        this.refreshShop()
    }

    private onEvent(e: GameEvent) {
        const mine = e.by === 'you'
        const ownField = mine ? this.myField : this.oppField
        const enemyField = mine ? this.oppField : this.myField

        if (e.kind === 'harvest') {
            const { cx, cy } = ownField.tileCenter(e.tile)
            floatText(this, cx, cy - 20, `+$${e.amount}`, '#ffe066')
            return
        }
        if (e.kind === 'wither') {
            const { cx, cy } = ownField.tileCenter(e.tile)
            floatText(this, cx, cy - 20, 'withered', '#d0a080', 12)
            return
        }

        const item = ITEMS[e.item]
        this.log(`${mine ? 'You' : this.opponentName}: ${item.name}${e.blocked ? ' (blocked)' : ''}`)
        if (item.kind === 'buff') {
            const { cx, cy } = ownField.center
            this.burst(cx, cy, e.item, 8)
            floatText(this, cx, cy + 50, `${item.name}!`, '#9cff8a', 18)
            return
        }

        const { cx, cy } = e.tile !== undefined ? enemyField.tileCenter(e.tile) : enemyField.center
        if (e.blocked) {
            this.burst(cx, cy, 'scarecrow', 8)
            floatText(this, cx, cy + 50, 'Blocked!', '#9fd8ff', 18)
            return
        }
        this.burst(cx, cy, e.item, e.tile !== undefined ? 7 : 12, e.item === 'tornado')
        if (!mine && (e.item === 'tornado' || e.item === 'lightning')) this.cameras.main.shake(e.item === 'tornado' ? 500 : 180, 0.008)
        if (e.item === 'lightning') this.cameras.main.flash(120, 255, 255, 200)
    }

    /** Pops a big pixel sprite over a spot, then fades it out. */
    private burst(x: number, y: number, key: string, scale: number, spin = false) {
        const img = this.add.image(x, y, key).setDepth(90).setScale(scale / 3)
        this.tweens.add({
            targets: img,
            scale,
            angle: spin ? 720 : 0,
            alpha: { from: 1, to: 0 },
            duration: 900,
            ease: 'Cubic.easeOut',
            onComplete: () => img.destroy(),
        })
    }

    private log(line: string) {
        this.feed = [line, ...this.feed].slice(0, 7)
        this.feedText.setText(this.feed.join('\n'))
    }

    private showToast(message: string) {
        this.tweens.killTweensOf(this.toast)
        this.toast.setText(message).setAlpha(1)
        this.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 400 })
    }

    private onEnd(msg: EndMsg) {
        this.ended = true
        const title = { win: 'YOU WIN!', lose: 'YOU LOSE', draw: 'DRAW' }[msg.result]
        const color = { win: '#c8f56b', lose: '#ff7b6b', draw: '#ffffff' }[msg.result]
        const sub = msg.reason === 'opponent_left' ? 'Your opponent left the farm.' : `$${msg.yourMoney}  vs  $${msg.opponentMoney}`

        this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7).setDepth(200).setInteractive()
        const objs = [
            text(this, 640, 250, title, 56, color).setOrigin(0.5).setStroke('#000000', 10),
            text(this, 640, 340, sub, 20, '#ffe066').setOrigin(0.5),
        ]
        const b = button(this, 640, 450, 340, 64, 'Back to menu', '#c8f56b', () => this.scene.start('menu'))
        for (const o of [...objs, ...b.items]) o.setDepth(201)
    }

    private onDisconnect() {
        if (this.ended) return
        this.ended = true
        this.showToast('Disconnected from server')
        this.time.delayedCall(1500, () => this.scene.start('menu'))
    }
}
