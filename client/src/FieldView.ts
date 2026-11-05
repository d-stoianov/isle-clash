import Phaser from 'phaser'
import { GRID_COLS, GRID_ROWS, RIPE_WINDOW_MS, type PlayerState } from '@gogrow/shared'
import { text } from './ui.ts'
import { SPRITE_SIZE } from './sprites.ts'

export const TILE = 100
export const GAP = 12
export const FIELD_W = GRID_COLS * TILE + (GRID_COLS - 1) * GAP
export const FIELD_H = GRID_ROWS * TILE + (GRID_ROWS - 1) * GAP

interface TileView {
    bg: Phaser.GameObjects.Graphics
    crop: Phaser.GameObjects.Image
    bar: Phaser.GameObjects.Graphics
    hovered: boolean
}

/** Renders one player's farm grid plus their status effects. */
export class FieldView {
    private tiles: TileView[] = []
    private overlay: Phaser.GameObjects.Graphics
    private badges: Phaser.GameObjects.Text
    private last: PlayerState | null = null
    /** Outline colour for the hovered tile, or null for no hover highlight. */
    hoverColor: number | null = null

    readonly x: number
    readonly y: number

    constructor(scene: Phaser.Scene, x: number, y: number, onTileClick: (index: number) => void) {
        this.x = x
        this.y = y
        const frame = scene.add.graphics()
        frame.fillStyle(0x111111, 1).fillRect(x - 16, y - 16, FIELD_W + 32, FIELD_H + 32)
        frame.fillStyle(0x4a7a30, 1).fillRect(x - 12, y - 12, FIELD_W + 24, FIELD_H + 24)

        for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
            const { cx, cy } = this.tileCenter(i)
            const view: TileView = {
                bg: scene.add.graphics(),
                crop: scene.add.image(cx, cy - 6, 'sprout').setVisible(false),
                bar: scene.add.graphics(),
                hovered: false,
            }
            const zone = scene.add.zone(cx, cy, TILE, TILE).setInteractive({ useHandCursor: true })
            zone.on('pointerover', () => ((view.hovered = true), this.drawTile(i)))
            zone.on('pointerout', () => ((view.hovered = false), this.drawTile(i)))
            zone.on('pointerdown', () => onTileClick(i))
            this.tiles.push(view)
            this.drawTile(i)
        }

        this.overlay = scene.add.graphics().setDepth(10)
        this.badges = text(scene, x + FIELD_W / 2, y + FIELD_H + 34, '', 12).setOrigin(0.5)
    }

    tileCenter(i: number) {
        const col = i % GRID_COLS
        const row = Math.floor(i / GRID_COLS)
        return { cx: this.x + col * (TILE + GAP) + TILE / 2, cy: this.y + row * (TILE + GAP) + TILE / 2 }
    }

    get center() {
        return { cx: this.x + FIELD_W / 2, cy: this.y + FIELD_H / 2 }
    }

    update(state: PlayerState) {
        this.last = state
        state.tiles.forEach((_, i) => this.drawTile(i))

        const e = state.effects
        const fx = this.x - 12
        const fy = this.y - 12
        this.overlay.clear()
        if (e.droughtMs > 0) this.overlay.fillStyle(0xff9a2e, 0.25).fillRect(fx, fy, FIELD_W + 24, FIELD_H + 24)
        if (e.frozenMs > 0) this.overlay.fillStyle(0x9fdcff, 0.5).fillRect(fx, fy, FIELD_W + 24, FIELD_H + 24)

        const badges: string[] = []
        if (e.scarecrowMs > 0) badges.push(`SHIELD ${secs(e.scarecrowMs)}`)
        if (e.droughtMs > 0) badges.push(`DROUGHT ${secs(e.droughtMs)}`)
        if (e.frozenMs > 0) badges.push(`FROZEN ${secs(e.frozenMs)}`)
        this.badges.setText(badges.join('  '))
        this.badges.setColor(e.frozenMs > 0 ? '#9fdcff' : e.droughtMs > 0 ? '#ffb36b' : '#c8f56b')
    }

    private drawTile(i: number) {
        const view = this.tiles[i]!
        const tile = this.last?.tiles[i]
        const { cx, cy } = this.tileCenter(i)
        const left = cx - TILE / 2
        const top = cy - TILE / 2
        const ripe = !!tile?.crop && tile.progress >= 1

        const g = view.bg.clear()
        g.fillStyle(0x3b2412, 1).fillRect(left, top, TILE, TILE)
        g.fillStyle(tile?.crop ? 0x6e4424 : 0x86562d, 1).fillRect(left + 4, top + 4, TILE - 8, TILE - 8)
        // pixel furrows
        g.fillStyle(0x5a3519, 1)
        for (let k = 1; k < 4; k++) g.fillRect(left + 12, top + k * 24, TILE - 24, 4)
        const outline = ripe ? 0xffd84a : view.hovered ? this.hoverColor : null
        if (outline !== null) {
            g.fillStyle(outline, 1)
            g.fillRect(left, top, TILE, 4).fillRect(left, top + TILE - 4, TILE, 4)
            g.fillRect(left, top, 4, TILE).fillRect(left + TILE - 4, top, 4, TILE)
        }

        const bar = view.bar.clear()
        if (!tile?.crop) {
            view.crop.setVisible(false)
            return
        }
        // Grow in whole-pixel scale steps (36px -> 72px) so sprites stay crisp.
        const size = Math.round(3 + 3 * tile.progress) * SPRITE_SIZE
        view.crop
            .setVisible(true)
            .setTexture(tile.progress < 0.35 ? 'sprout' : tile.crop)
            .setDisplaySize(size, size)

        const barX = left + 10
        const barY = top + TILE - 16
        const barW = TILE - 20
        bar.fillStyle(0x111111, 1).fillRect(barX, barY, barW, 8)
        if (ripe) {
            const frac = Math.max(0, tile.witherInMs / RIPE_WINDOW_MS)
            bar.fillStyle(frac > 0.35 ? 0xffd84a : 0xe5533d, 1).fillRect(barX + 2, barY + 2, (barW - 4) * frac, 4)
        } else {
            bar.fillStyle(0x8ee35b, 1).fillRect(barX + 2, barY + 2, Math.max(2, (barW - 4) * tile.progress), 4)
        }
    }
}

function secs(ms: number) {
    return `${Math.ceil(ms / 1000)}s`
}
