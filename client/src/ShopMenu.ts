import Phaser from 'phaser'
import { CROP_IDS, CROPS, ITEM_IDS, ITEMS, type CropId, type ItemId, type PlayerState } from '@gogrow/shared'
import { CROP_PACKET_COL, cropFrame } from './scenes/BootScene.ts'
import { pixelPanel, text } from './ui.ts'

export const SEED_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'] as const
/** While the shop is open, 5-0 buy tools (1-4 buy seeds). */
export const ITEM_KEYS = ['FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'ZERO'] as const

interface Card {
    id: CropId | ItemId
    bg: Phaser.GameObjects.Graphics
    x: number
    y: number
    w: number
    h: number
    cost: number
    parts: (Phaser.GameObjects.Text | Phaser.GameObjects.Image)[]
    cooldown: Phaser.GameObjects.Text
}

const W = 580
const H = 440

/** The shop popup shown over your own field while standing at the shop door. */
export class ShopMenu {
    private container: Phaser.GameObjects.Container
    private cards: Card[] = []
    private money: Phaser.GameObjects.Text
    private desc: Phaser.GameObjects.Text
    private scene: Phaser.Scene
    isOpen = false

    constructor(scene: Phaser.Scene, cx: number, cy: number, onBuy: (id: CropId | ItemId) => void) {
        this.scene = scene
        const left = -W / 2
        const top = -H / 2
        this.container = scene.add.container(cx, cy).setDepth(8000).setVisible(false)

        const blocker = scene.add.rectangle(0, 0, W, H, 0, 0).setInteractive()
        const bg = scene.add.graphics()
        pixelPanel(bg, left, top, W, H, 0xc9945a, 6)
        bg.fillStyle(0xe8c48c, 1).fillRect(left + 14, top + 56, W - 28, H - 70)
        this.container.add([blocker, bg])
        this.container.add(text(scene, left + 24, top + 22, 'SHOP', 20, '#3b2412'))
        this.money = text(scene, -left - 24, top + 22, '', 16, '#3b2412').setOrigin(1, 0)
        this.container.add(this.money)

        this.container.add(text(scene, left + 26, top + 68, 'SEEDS', 10, '#6b4a2a'))
        const seedW = 124
        CROP_IDS.forEach((id, i) => {
            const c = CROPS[id]
            const icon = scene.add.image(0, 0, 'crops', cropFrame(id, CROP_PACKET_COL)).setOrigin(0.5, 1).setScale(3)
            this.card(id, left + 26 + i * (seedW + 10), top + 86, seedW, 140, c.cost, String(i + 1), icon, [
                [c.name, c.name.length > 8 ? 8 : 10],
                [`$${c.cost}`, 12],
                [`sells $${c.sellPrice}`, 8],
                [`grows ${c.growMs / 1000}s`, 8],
            ], onBuy)
        })

        this.container.add(text(scene, left + 26, top + 234, 'TOOLS & SABOTAGE', 10, '#6b4a2a'))
        const itemW = 82
        ITEM_IDS.forEach((id, i) => {
            const it = ITEMS[id]
            const icon = scene.add.image(0, 0, id).setOrigin(0.5, 1).setScale(3)
            const card = this.card(id, left + 26 + i * (itemW + 9), top + 252, itemW, 112, it.cost, String((i + 5) % 10), icon, [
                [it.name, it.name.length > 8 ? 7 : 8],
                [`$${it.cost}`, 11],
            ], onBuy)
            const zone = this.zoneFor(card)
            zone.on('pointerover', () => this.desc.setText(`${it.name}: ${it.description}`))
            zone.on('pointerout', () => this.desc.setText(''))
        })

        this.desc = text(scene, 0, top + 382, '', 9, '#3b2412').setOrigin(0.5, 0)
        this.container.add(this.desc)
        this.container.add(text(scene, 0, top + 408, 'Click or press 1-0 to buy.  E or ESC to close', 8, '#6b4a2a').setOrigin(0.5, 0))
    }

    private zones = new Map<Card, Phaser.GameObjects.Zone>()
    private zoneFor(card: Card) {
        return this.zones.get(card)!
    }

    private card(
        id: CropId | ItemId,
        x: number,
        y: number,
        w: number,
        h: number,
        cost: number,
        key: string,
        icon: Phaser.GameObjects.Image,
        lines: [string, number][],
        onBuy: (id: CropId | ItemId) => void,
    ) {
        const bg = this.scene.add.graphics()
        icon.setPosition(x + w / 2, y + (h > 120 ? 58 : 46))
        const parts: Card['parts'] = [icon]
        let ty = icon.y + 6
        for (const [str, size] of lines) {
            parts.push(text(this.scene, x + w / 2, ty, str, size, '#1d1d1d').setOrigin(0.5, 0))
            ty += size + 7
        }
        const keyLabel = text(this.scene, x + 8, y + 8, key, 8, '#6b5a3a')
        const cooldown = text(this.scene, x + w / 2, y + h / 2, '', 20).setOrigin(0.5).setStroke('#000000', 6)
        const zone = this.scene.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true })
        zone.on('pointerdown', () => onBuy(id))
        this.container.add([bg, ...parts, keyLabel, cooldown, zone])
        const card: Card = { id, bg, x, y, w, h, cost, parts, cooldown }
        this.zones.set(card, zone)
        this.cards.push(card)
        return card
    }

    open() {
        this.isOpen = true
        this.container.setVisible(true)
        this.desc.setText('')
    }

    close() {
        this.isOpen = false
        this.container.setVisible(false)
    }

    update(me: PlayerState) {
        this.money.setText(`$${me.money}`)
        for (const card of this.cards) {
            const affordable = me.money >= card.cost
            const isItem = Object.hasOwn(ITEMS, card.id)
            const cd = isItem ? me.cooldowns[card.id as ItemId] : 0
            const total = isItem ? ITEMS[card.id as ItemId].cooldownMs : 1
            const { bg, x, y, w, h } = card
            bg.clear()
            pixelPanel(bg, x, y, w, h, affordable ? 0xf3e7c4 : 0x9e957f, 4)
            if (cd > 0) bg.fillStyle(0x000000, 0.55).fillRect(x + 4, y + 4, w - 8, (h - 8) * (cd / total))
            card.parts.forEach((p) => p.setAlpha(affordable ? 1 : 0.5))
            card.cooldown.setText(cd > 0 ? String(Math.ceil(cd / 1000)) : '')
        }
    }
}
