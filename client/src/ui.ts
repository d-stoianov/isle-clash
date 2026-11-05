import Phaser from 'phaser'

export const FONT = '"Press Start 2P", monospace'

export function hex(color: string) {
    return Phaser.Display.Color.HexStringToColor(color).color
}

export function text(
    scene: Phaser.Scene,
    x: number,
    y: number,
    str: string,
    size: number,
    color = '#ffffff',
    style: Phaser.Types.GameObjects.Text.TextStyle = {},
) {
    return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, ...style })
}

/** Draws a chunky pixel-style panel: dark outline, fill, top highlight, bottom shade. */
export function pixelPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill: number, b = 4) {
    const shade = Phaser.Display.Color.IntegerToColor(fill).darken(25).color
    const light = Phaser.Display.Color.IntegerToColor(fill).lighten(15).color
    g.fillStyle(0x111111, 1).fillRect(x, y, w, h)
    g.fillStyle(fill, 1).fillRect(x + b, y + b, w - 2 * b, h - 2 * b)
    g.fillStyle(light, 1).fillRect(x + b, y + b, w - 2 * b, b)
    g.fillStyle(shade, 1).fillRect(x + b, y + h - 2 * b, w - 2 * b, b)
}

/** A pixel button with a press-down effect. */
export function button(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    color: string,
    onClick: () => void,
) {
    const bg = scene.add.graphics()
    const draw = (dy: number) => {
        bg.clear()
        bg.fillStyle(0x000000, 0.4).fillRect(x - w / 2, y - h / 2 + 6, w, h)
        pixelPanel(bg, x - w / 2, y - h / 2 + dy, w, h, hex(color))
    }
    draw(0)
    const label_ = text(scene, x, y, label, 14, '#1b1b1b').setOrigin(0.5)
    const zone = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true })
    zone.on('pointerdown', () => (draw(4), label_.setY(y + 4)))
    zone.on('pointerup', () => (draw(0), label_.setY(y), onClick()))
    zone.on('pointerout', () => (draw(0), label_.setY(y)))
    const items = [bg, label_, zone]
    return {
        items,
        setVisible(v: boolean) {
            items.forEach((o) => o.setVisible(v))
            if (v) zone.setInteractive()
            else zone.disableInteractive()
        },
        setLabel: (s: string) => label_.setText(s),
    }
}

/** Floating text that drifts up and fades. */
export function floatText(scene: Phaser.Scene, x: number, y: number, msg: string, color = '#ffffff', size = 16) {
    const t = text(scene, x, y, msg, size, color).setOrigin(0.5).setStroke('#000000', 6).setDepth(100)
    scene.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => t.destroy() })
}
