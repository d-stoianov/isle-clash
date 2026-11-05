import Phaser from 'phaser'
import {
    FIELD_SIZE,
    PLOT_COUNT,
    plotCenter,
    RIPE_WINDOW_MS,
    SHOP,
    TILE,
    type PlayerState,
} from '@gogrow/shared'
import { CROP_RIPE_COL, cropFrame } from './scenes/BootScene.ts'
import { text } from './ui.ts'

/** World pixels -> screen pixels. */
export const SCALE = 3
export const FIELD_PX = FIELD_SIZE * SCALE

interface PlotView {
    soil: Phaser.GameObjects.Image
    crop: Phaser.GameObjects.Image
    bar: Phaser.GameObjects.Graphics
    hover: Phaser.GameObjects.Graphics
}

/**
 * One player's farm: grass, shop building, fences, decorations and the crop
 * plots. Owns the world -> screen transform for everything drawn on it.
 */
export class Farm {
    readonly ox: number
    readonly oy: number
    private plots: PlotView[] = []
    private overlay: Phaser.GameObjects.Graphics
    private badges: Phaser.GameObjects.Text
    private hovered: number | null = null
    /** Outline colour for hovered plots, or null to disable hover. */
    hoverColor: number | null = null

    constructor(scene: Phaser.Scene, ox: number, oy: number, onPlotClick: (i: number) => void) {
        this.ox = ox
        this.oy = oy
        const S = SCALE

        // ground
        scene.add.rectangle(ox, oy, FIELD_PX, FIELD_PX, 0x79bf56).setOrigin(0).setDepth(-10)
        const tufts = scene.add.graphics().setDepth(-9)
        const rng = new Phaser.Math.RandomDataGenerator(['gogrow'])
        for (let i = 0; i < 70; i++) {
            const x = rng.between(2, FIELD_SIZE - 4)
            const y = rng.between(2, FIELD_SIZE - 4)
            tufts.fillStyle(rng.pick([0x5ea845, 0x3d993d, 0x8fd06a]), 1)
            tufts.fillRect(ox + x * S, oy + y * S, S, S * 2).fillRect(ox + (x + 1) * S, oy + (y + 1) * S, S, S)
        }

        // shop building
        this.place(scene.add.image(0, 0, 'house', 'shop'), SHOP.x, SHOP.y, 0, 0, SHOP.y + 98)
        const sign = text(scene, this.sx(SHOP.door.x), this.sy(SHOP.y + 62), 'SHOP', 10, '#ffe066')
        sign.setOrigin(0.5, 1).setStroke('#000000', 5).setDepth(4000)

        // decorations
        this.place(scene.add.image(0, 0, 'tree', 'big'), 182, 58, 0.5, 1)
        this.place(scene.add.image(0, 0, 'tree', 'mid'), 150, 46, 0.5, 1)
        this.place(scene.add.image(0, 0, 'rocks', 'rock'), 22, 150, 0.5, 1)
        this.place(scene.add.image(0, 0, 'rocks', 'pebbles'), 186, 112, 0.5, 1)
        const chicken = this.place(scene.add.sprite(0, 0, 'chicken').play('chicken-idle'), 172, 150, 0.5, 1)
        scene.tweens.add({
            targets: chicken,
            x: this.sx(196),
            duration: 4000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            onYoyo: () => chicken.setFlipX(true),
            onRepeat: () => chicken.setFlipX(false),
        })

        // fences along the sides and bottom
        for (let x = 0; x < FIELD_SIZE; x += TILE) {
            this.place(scene.add.image(0, 0, 'fences', 'fence-h'), x, FIELD_SIZE - TILE, 0, 0)
        }
        for (let y = 64; y < FIELD_SIZE - TILE; y += TILE) {
            this.place(scene.add.image(0, 0, 'fences', 'fence-v'), 0, y, 0, 0)
            this.place(scene.add.image(0, 0, 'fences', 'fence-v'), FIELD_SIZE - TILE, y, 0, 0)
        }

        // plots
        for (let i = 0; i < PLOT_COUNT; i++) {
            const c = plotCenter(i)
            const view: PlotView = {
                soil: this.place(scene.add.image(0, 0, 'soil'), c.x, c.y, 0.5, 0.5, -1),
                crop: this.place(scene.add.image(0, 0, 'crops', 0), c.x, c.y + 7, 0.5, 1).setVisible(false),
                bar: scene.add.graphics().setDepth(3000),
                hover: scene.add.graphics().setDepth(2),
            }
            const zone = scene.add
                .zone(this.sx(c.x), this.sy(c.y), TILE * S, TILE * S)
                .setInteractive({ useHandCursor: true })
            zone.on('pointerover', () => ((this.hovered = i), this.drawHover()))
            zone.on('pointerout', () => ((this.hovered = null), this.drawHover()))
            zone.on('pointerdown', () => onPlotClick(i))
            this.plots.push(view)
        }

        this.overlay = scene.add.graphics().setDepth(4500)
        this.badges = text(scene, ox + FIELD_PX / 2, oy + FIELD_PX - 26, '', 12)
            .setOrigin(0.5)
            .setStroke('#000000', 5)
            .setDepth(4600)
    }

    sx(x: number) {
        return this.ox + x * SCALE
    }

    sy(y: number) {
        return this.oy + y * SCALE
    }

    plotScreen(i: number) {
        const c = plotCenter(i)
        return { x: this.sx(c.x), y: this.sy(c.y) }
    }

    get center() {
        return { x: this.ox + FIELD_PX / 2, y: this.oy + FIELD_PX / 2 }
    }

    /** Positions a world-space object; depth defaults to its bottom edge for y-sorting. */
    private place<T extends Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>(
        obj: T,
        x: number,
        y: number,
        originX: number,
        originY: number,
        depth?: number,
    ): T {
        obj.setOrigin(originX, originY).setScale(SCALE).setPosition(this.sx(x), this.sy(y))
        obj.setDepth(depth ?? obj.y + (1 - originY) * obj.displayHeight)
        return obj
    }

    update(state: PlayerState) {
        state.plots.forEach((plot, i) => {
            const view = this.plots[i]!
            const c = plotCenter(i)
            view.soil.setTexture(plot.crop ? 'soil-planted' : 'soil')
            const bar = view.bar.clear()
            if (!plot.crop) {
                view.crop.setVisible(false)
                return
            }
            const ripeCol = CROP_RIPE_COL[plot.crop]
            const ripe = plot.progress >= 1
            const col = ripe ? ripeCol : Math.min(ripeCol - 1, Math.floor(plot.progress * ripeCol))
            view.crop.setVisible(true).setFrame(cropFrame(plot.crop, col))

            const bx = this.sx(c.x - 7)
            const by = this.sy(c.y + 9)
            const bw = 14 * SCALE
            bar.fillStyle(0x111111, 1).fillRect(bx, by, bw, 9)
            if (ripe) {
                const frac = Math.max(0, plot.witherInMs / RIPE_WINDOW_MS)
                bar.fillStyle(frac > 0.35 ? 0xffd84a : 0xe5533d, 1).fillRect(bx + 3, by + 3, (bw - 6) * frac, 3)
            } else {
                bar.fillStyle(0x8ee35b, 1).fillRect(bx + 3, by + 3, Math.max(3, (bw - 6) * plot.progress), 3)
            }
        })

        const e = state.effects
        const o = this.overlay.clear()
        if (e.droughtMs > 0) o.fillStyle(0xff9a2e, 0.22).fillRect(this.ox, this.oy, FIELD_PX, FIELD_PX)
        if (e.frozenMs > 0) o.fillStyle(0x9fdcff, 0.4).fillRect(this.ox, this.oy, FIELD_PX, FIELD_PX)
        const badges: string[] = []
        if (e.scarecrowMs > 0) badges.push(`SHIELD ${secs(e.scarecrowMs)}`)
        if (e.droughtMs > 0) badges.push(`DROUGHT ${secs(e.droughtMs)}`)
        if (e.frozenMs > 0) badges.push(`FROZEN ${secs(e.frozenMs)}`)
        this.badges.setText(badges.join('  '))
        this.badges.setColor(e.frozenMs > 0 ? '#9fdcff' : e.droughtMs > 0 ? '#ffb36b' : '#c8f56b')
    }

    /** Highlight a plot (e.g. the one in reach). */
    setFocus(i: number | null) {
        this.focus = i
        this.drawHover()
    }
    private focus: number | null = null

    private drawHover() {
        this.plots.forEach((v, i) => {
            v.hover.clear()
            const color = i === this.hovered && this.hoverColor !== null ? this.hoverColor : i === this.focus ? 0xffffff : null
            if (color === null) return
            const c = plotCenter(i)
            const x = this.sx(c.x - 8)
            const y = this.sy(c.y - 8)
            const s = TILE * SCALE
            v.hover.fillStyle(color, 1)
            v.hover.fillRect(x, y, s, 3).fillRect(x, y + s - 3, s, 3).fillRect(x, y, 3, s).fillRect(x + s - 3, y, 3, s)
        })
    }
}

function secs(ms: number) {
    return `${Math.ceil(ms / 1000)}s`
}
