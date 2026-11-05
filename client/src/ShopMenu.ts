import Phaser from 'phaser'
import { SHOP, type PlayerState, type ShopId } from '@isle-clash/shared'
import { label, panel, ribbon, text, tiledPanel, INK } from './ui.ts'

/** Shop layout: rows of item ids, each with the key that buys it while the shop is open. */
const ROWS: { title: string; items: [ShopId, string][] }[] = [
    { title: 'UPGRADES', items: [['axe', '1'], ['pickaxe', '2'], ['boots', '3']] },
    { title: 'BARRACKS', items: [['warrior', 'Z'], ['archer', 'X'], ['lancer', 'C'], ['monk', 'V']] },
    { title: 'SABOTAGE', items: [['keg', '4'], ['raider', '5'], ['fire', '6']] },
    { title: 'BUILD', items: [['tower', '7'], ['bridge', '8']] },
]

const KEY_NAMES: Record<string, string> = { '1': 'ONE', '2': 'TWO', '3': 'THREE', '4': 'FOUR', '5': 'FIVE', '6': 'SIX', '7': 'SEVEN', '8': 'EIGHT' }
/** Phaser key name -> item, for number keys while the shop is open (Z X C V are global). */
export const SHOP_KEYS: Record<string, ShopId> = Object.fromEntries(
    ROWS.flatMap((r) => r.items.filter(([, k]) => KEY_NAMES[k]).map(([id, k]) => [KEY_NAMES[k]!, id])),
)

const W = 700
const H = 760
const CARD_W = 150
const CARD_H = 116

interface Card {
    id: ShopId
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
            return scene.add.image(x, y, 'tool-axe').setScale(1.2)
        case 'pickaxe':
            return scene.add.image(x, y, 'tool-pickaxe').setScale(1.2)
        case 'boots':
            return scene.add.image(x, y, 'icon-speed').setScale(0.85)
        case 'warrior':
        case 'archer':
        case 'monk':
            return scene.add.sprite(x, y + 4, `blue-${id}-idle`).play(`blue-${id}-idle`).setScale(0.62)
        case 'lancer':
            return scene.add.sprite(x, y + 14, 'blue-lancer-idle').play('blue-lancer-idle').setScale(0.42)
        case 'keg':
            return scene.add.sprite(x, y, 'explosion', 2).setScale(0.65)
        case 'raider':
            return scene.add.sprite(x, y + 6, 'red-warrior-idle', 0).setScale(0.55)
        case 'fire':
            return scene.add.sprite(x, y + 34, 'fire2').play({ key: 'fire2', startFrame: 4 }).setScale(2.6).setOrigin(0.5, 0.95)
        case 'tower':
            return scene.add.image(x, y + 4, 'blue-tower').setScale(0.27)
        case 'bridge':
            return scene.add.image(x, y, 'bridge').setScale(0.42)
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
        this.gold = label(scene, W / 2 - 66, -H / 2 + 74, '', 26, '#ffe066').setOrigin(1, 0.5)
        const coin = scene.add.image(W / 2 - 44, -H / 2 + 74, 'icon-coin').setScale(0.6)
        this.container.add([blocker, bg, title.bg, title.text, this.gold, coin])

        ROWS.forEach((row, r) => {
            const y = -H / 2 + 96 + r * (CARD_H + 36)
            this.container.add(label(scene, -W / 2 + 44, y, row.title, 18, '#f3e2b8').setOrigin(0, 0))
            row.items.forEach(([id, key], c) => {
                this.addCard(scene, id, -W / 2 + 44 + c * (CARD_W + 4), y + 26, key, onBuy)
            })
        })

        this.desc = text(scene, 30, -H / 2 + 96 + 3 * (CARD_H + 36) + 40, '', 17, '#f3e2b8', {
            wordWrap: { width: 280 },
        })
        const hint = label(scene, 0, H / 2 - 36, 'Click or press the key to buy  •  E / ESC to close', 16, '#f3e2b8').setOrigin(0.5)
        const close = panel(scene, 'btn-red', W / 2 - 34, -H / 2 + 30, 64, 64).setInteractive({ useHandCursor: true })
        const x = label(scene, W / 2 - 34, -H / 2 + 26, 'X', 24).setOrigin(0.5)
        close.on('pointerup', onClose)
        this.container.add([this.desc, hint, close, x])
    }

    private addCard(scene: Phaser.Scene, id: ShopId, x: number, y: number, key: string, onBuy: (id: ShopId) => void) {
        const item = SHOP[id]
        const bg = panel(scene, 'paper', x + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H)
        const ic = icon(scene, id, x + 40, y + 56)
        const name = text(scene, x + 74, y + 18, item.name, 16, INK, { wordWrap: { width: 70 } })
        const cost = text(scene, x + 96, y + 78, String(item.cost), 20, '#8a5a12')
        const coin = scene.add.image(x + 84, y + 90, 'icon-coin').setScale(0.36)
        const keyHint = label(scene, x + 16, y + 14, key, 15, '#ffe066').setOrigin(0.5)
        const shade = scene.add.graphics()
        const status = label(scene, x + CARD_W / 2, y + CARD_H / 2, '', 22, '#ffffff').setOrigin(0.5)
        const zone = scene.add.zone(x + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H).setInteractive({ useHandCursor: true })
        zone.on('pointerup', () => onBuy(id))
        zone.on('pointerover', () => {
            this.desc.setText(`${item.name}: ${item.description}`)
            scene.tweens.add({ targets: ic, scale: ic.scale * 1.12, duration: 100, yoyo: true })
        })
        zone.on('pointerout', () => this.desc.setText(''))
        this.container.add([bg, ic, name, cost, coin, keyHint, shade, status, zone])
        this.cards.push({ id, parts: [ic, name, cost, coin], status, shade, x, y })
    }

    open(me: PlayerState, bridgeBuilt: boolean) {
        this.isOpen = true
        this.desc.setText('')
        this.container.setVisible(true).setScale(0.9).setAlpha(0)
        this.container.scene.tweens.add({ targets: this.container, scale: 1, alpha: 1, duration: 140, ease: 'Back.easeOut' })
        this.update(me, bridgeBuilt)
    }

    close() {
        this.isOpen = false
        this.container.setVisible(false)
    }

    update(me: PlayerState, bridgeBuilt: boolean) {
        this.gold.setText(String(me.gold))
        for (const card of this.cards) {
            const item = SHOP[card.id]
            const owned =
                (item.kind === 'upgrade' && me.upgrades[card.id as keyof typeof me.upgrades]) ||
                (card.id === 'bridge' && bridgeBuilt)
            const cd = me.cooldowns[card.id]
            const usable = !owned && cd === 0 && me.gold >= item.cost
            card.parts.forEach((p) => p.setAlpha(usable ? 1 : 0.45))
            card.shade.clear()
            if (cd > 0) {
                card.shade
                    .fillStyle(0x000000, 0.35)
                    .fillRoundedRect(card.x + 8, card.y + 8, CARD_W - 16, (CARD_H - 16) * (cd / item.cooldownMs), 8)
            }
            card.status.setText(owned ? (card.id === 'bridge' ? 'BUILT' : 'OWNED') : cd > 0 ? `${Math.ceil(cd / 1000)}s` : '')
        }
    }
}
