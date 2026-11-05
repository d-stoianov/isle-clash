import Phaser from 'phaser'
import { SHOP, type PlayerState, type ShopId } from '@gogrow/shared'
import { label, panel, ribbon, text, tiledPanel, INK } from './ui.ts'

/** Shop layout: rows of item ids. Keys 1-7 follow this order. */
const ROWS: { title: string; ids: ShopId[] }[] = [
    { title: 'UPGRADES', ids: ['axe', 'pickaxe', 'boots'] },
    { title: 'SABOTAGE', ids: ['keg', 'raider', 'fire'] },
    { title: 'DEFENSE', ids: ['tower'] },
]
export const SHOP_ORDER: ShopId[] = ROWS.flatMap((r) => r.ids)

const W = 680
const H = 660
const CARD_W = 196
const CARD_H = 132

interface Card {
    id: ShopId
    bg: Phaser.GameObjects.NineSlice
    parts: (Phaser.GameObjects.Text | Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[]
    status: Phaser.GameObjects.Text
    shade: Phaser.GameObjects.Graphics
    x: number
    y: number
}

/** Icon for each shop item, built from pack art. */
function icon(scene: Phaser.Scene, id: ShopId, x: number, y: number) {
    switch (id) {
        case 'axe':
            return scene.add.image(x, y, 'tool-axe').setScale(1.3)
        case 'pickaxe':
            return scene.add.image(x, y, 'tool-pickaxe').setScale(1.3)
        case 'boots':
            return scene.add.image(x, y, 'icon-speed').setScale(0.95)
        case 'keg':
            return scene.add.sprite(x, y, 'explosion', 2).setScale(0.75)
        case 'raider':
            return scene.add.sprite(x, y + 6, 'red-warrior-idle', 0).setScale(0.6)
        case 'fire':
            return scene.add.sprite(x, y + 30, 'fire1').play('fire1').setScale(1.9).setOrigin(0.5, 0.9)
        case 'tower':
            return scene.add.image(x, y + 4, 'blue-tower').setScale(0.3)
    }
}

/** The castle shop popup, shown over your own island while standing at the gate. */
export class ShopMenu {
    private container: Phaser.GameObjects.Container
    private cards: Card[] = []
    private gold: Phaser.GameObjects.Text
    private desc: Phaser.GameObjects.Text
    isOpen = false

    constructor(scene: Phaser.Scene, cx: number, cy: number, onBuy: (id: ShopId) => void, onClose: () => void) {
        this.container = scene.add.container(cx, cy).setDepth(20000).setVisible(false)
        const blocker = scene.add.rectangle(0, 0, W, H, 0, 0).setInteractive()
        const bg = tiledPanel(scene, 'woodtable', 0, 0, W, H)
        const title = ribbon(scene, 'yellow', 0, -H / 2 + 26, 380, 'CASTLE SHOP', 30)
        this.gold = label(scene, W / 2 - 60, -H / 2 + 62, '', 26, '#ffe066').setOrigin(1, 0.5)
        const coin = scene.add.image(W / 2 - 38, -H / 2 + 62, 'icon-coin').setScale(0.6)
        this.container.add([blocker, bg, title.bg, title.text, this.gold, coin])

        let key = 1
        ROWS.forEach((row, r) => {
            const y = -H / 2 + 100 + r * (CARD_H + 34)
            this.container.add(label(scene, -W / 2 + 46, y, row.title, 18, '#f3e2b8').setOrigin(0, 0))
            row.ids.forEach((id, c) => {
                const x = -W / 2 + 46 + c * (CARD_W + 10)
                this.addCard(scene, id, x, y + 24, key++, onBuy)
            })
        })

        this.desc = text(scene, 120, H / 2 - 148, '', 17, '#f3e2b8', { wordWrap: { width: 260 }, align: 'left' }).setOrigin(0, 0)
        this.container.add(this.desc)
        const hint = label(scene, 0, H / 2 - 40, 'Click or press 1-7 to buy  •  E / ESC to close', 16, '#f3e2b8').setOrigin(0.5)
        const close = panel(scene, 'btn-red', W / 2 - 34, -H / 2 + 30, 64, 64).setInteractive({ useHandCursor: true })
        const x = label(scene, W / 2 - 34, -H / 2 + 26, 'X', 24).setOrigin(0.5)
        close.on('pointerup', onClose)
        this.container.add([hint, close, x])
    }

    private addCard(scene: Phaser.Scene, id: ShopId, x: number, y: number, key: number, onBuy: (id: ShopId) => void) {
        const item = SHOP[id]
        const bg = panel(scene, 'paper', x + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H)
        const ic = icon(scene, id, x + 44, y + 58)
        const name = text(scene, x + 82, y + 22, item.name, 18, INK, { wordWrap: { width: 108 } })
        const cost = text(scene, x + 108, y + 86, String(item.cost), 22, '#8a5a12')
        const coin = scene.add.image(x + 94, y + 99, 'icon-coin').setScale(0.4)
        const keyHint = text(scene, x + 14, y + 10, String(key), 14, '#8a7350')
        const shade = scene.add.graphics()
        const status = label(scene, x + CARD_W / 2, y + CARD_H / 2, '', 22, '#ffffff').setOrigin(0.5)
        const zone = scene.add.zone(x + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H).setInteractive({ useHandCursor: true })
        zone.on('pointerup', () => onBuy(id))
        zone.on('pointerover', () => {
            this.desc.setText(item.description)
            scene.tweens.add({ targets: ic, scale: ic.scale * 1.15, duration: 100, yoyo: true })
        })
        zone.on('pointerout', () => this.desc.setText(''))
        this.container.add([bg, ic, name, cost, coin, keyHint, shade, status, zone])
        this.cards.push({ id, bg, parts: [ic, name, cost, coin], status, shade, x, y })
    }

    open(me: PlayerState) {
        this.isOpen = true
        this.desc.setText('')
        this.container.setVisible(true).setScale(0.9).setAlpha(0)
        this.container.scene.tweens.add({ targets: this.container, scale: 1, alpha: 1, duration: 140, ease: 'Back.easeOut' })
        this.update(me)
    }

    close() {
        this.isOpen = false
        this.container.setVisible(false)
    }

    update(me: PlayerState) {
        this.gold.setText(String(me.gold))
        for (const card of this.cards) {
            const item = SHOP[card.id]
            const owned = item.kind === 'upgrade' && me.upgrades[card.id as keyof typeof me.upgrades]
            const cd = me.cooldowns[card.id]
            const affordable = me.gold >= item.cost
            const usable = !owned && cd === 0 && affordable
            card.parts.forEach((p) => p.setAlpha(usable ? 1 : 0.45))
            card.shade.clear()
            if (cd > 0) {
                card.shade.fillStyle(0x000000, 0.35).fillRoundedRect(card.x + 10, card.y + 10, CARD_W - 20, (CARD_H - 20) * (cd / item.cooldownMs), 8)
            }
            card.status.setText(owned ? 'OWNED' : cd > 0 ? `${Math.ceil(cd / 1000)}s` : '')
        }
    }
}
