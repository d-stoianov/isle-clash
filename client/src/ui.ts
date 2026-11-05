import Phaser from 'phaser'
import { SLICES } from './scenes/BootScene.ts'

export const FONT = '"Lilita One", sans-serif'
export const INK = '#2b1d14'

export function text(
    scene: Phaser.Scene,
    x: number,
    y: number,
    str: string,
    size: number,
    color = '#ffffff',
    style: Phaser.Types.GameObjects.Text.TextStyle = {},
) {
    return scene.add
        .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, ...style })
        .setResolution(2)
}

/** Text with the chunky dark outline used everywhere in the HUD. */
export function label(scene: Phaser.Scene, x: number, y: number, str: string, size: number, color = '#ffffff') {
    return text(scene, x, y, str, size, color)
        .setStroke(INK, Math.max(4, Math.round(size / 6)))
        .setShadow(0, Math.max(2, Math.round(size / 14)), INK, 0, true, true)
}

/** A stretchable 9-slice panel from the Tiny Swords UI kit (woodtable, paper, banner...). */
export function panel(scene: Phaser.Scene, key: string, x: number, y: number, w: number, h: number) {
    const s = SLICES[key]!
    // '__BASE' = the whole texture; the named piece frames are only for tiledPanel.
    return scene.add.nineslice(x, y, key, '__BASE', w, h, s.l, s.r, s.t, s.b)
}

/**
 * Like `panel`, but edges and centre are tiled rather than stretched, so big
 * wooden/paper panels keep their texture. Returns a container sized w x h.
 */
export function tiledPanel(scene: Phaser.Scene, key: string, x: number, y: number, w: number, h: number) {
    const s = SLICES[key]!
    const midW = w - s.l - s.r
    const midH = h - s.t - s.b
    const left = -w / 2
    const top = -h / 2
    const parts: Phaser.GameObjects.GameObject[] = []
    const xs = [left, left + s.l, left + w - s.r]
    const ys = [top, top + s.t, top + h - s.b]
    const ws = [s.l, midW, s.r]
    const hs = [s.t, midH, s.b]
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const frame = `p${r}${c}`
            parts.push(
                r === 1 || c === 1
                    ? scene.add.tileSprite(xs[c]!, ys[r]!, ws[c]!, hs[r]!, key, frame).setOrigin(0)
                    : scene.add.image(xs[c]!, ys[r]!, key, frame).setOrigin(0),
            )
        }
    }
    return scene.add.container(x, y, parts).setSize(w, h)
}

/** A coloured ribbon banner with centred text. */
export function ribbon(scene: Phaser.Scene, color: 'blue' | 'red' | 'yellow' | 'purple' | 'black', x: number, y: number, w: number, str: string, size = 28) {
    const bg = panel(scene, `ribbon-${color}`, x, y, w, SLICES[`ribbon-${color}`]!.h)
    const t = label(scene, x, y - 6, str, size).setOrigin(0.5)
    return { bg, text: t }
}

/** A big Tiny Swords button with pressed state. */
export function button(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    str: string,
    color: 'blue' | 'red',
    onClick: () => void,
) {
    const bg = panel(scene, `btn-${color}`, x, y, w, h)
    const t = label(scene, x, y - 4, str, 28).setOrigin(0.5)
    const zone = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true })
    const press = (down: boolean) => {
        bg.setTexture(down ? `btn-${color}-pressed` : `btn-${color}`, '__BASE')
        t.setY(down ? y : y - 4)
    }
    zone.on('pointerdown', () => press(true))
    zone.on('pointerout', () => press(false))
    zone.on('pointerover', () => scene.tweens.add({ targets: [bg, t], scale: 1.04, duration: 90, yoyo: true }))
    zone.on('pointerup', () => {
        press(false)
        onClick()
    })
    const items = [bg, t, zone]
    return {
        items,
        setVisible(v: boolean) {
            items.forEach((o) => o.setVisible(v))
            if (v) zone.setInteractive({ useHandCursor: true })
            else zone.disableInteractive()
            return this
        },
        setText: (s: string) => t.setText(s),
        setDepth(d: number) {
            items.forEach((o) => o.setDepth(d))
            return this
        },
    }
}

/** Floating text that drifts up and fades. */
export function floatText(scene: Phaser.Scene, x: number, y: number, msg: string, color = '#ffffff', size = 30) {
    const t = label(scene, x, y, msg, size, color).setOrigin(0.5).setDepth(9000)
    scene.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => t.destroy() })
}

/** Plays a one-shot animation at a point and removes it when done. */
export function fx(scene: Phaser.Scene, key: string, x: number, y: number, scale = 1, depth = 8000) {
    const s = scene.add.sprite(x, y, key).setScale(scale).setDepth(depth).play(key)
    s.once('animationcomplete', () => s.destroy())
    return s
}
