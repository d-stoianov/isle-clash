import Phaser from 'phaser'
import type { AvatarState, Facing } from '@gogrow/shared'
import { text } from './ui.ts'

/** The farmer: animated sprite + floating nickname. Positions are screen pixels. */
export class Avatar {
    readonly sprite: Phaser.GameObjects.Sprite
    private label: Phaser.GameObjects.Text
    private prompt: Phaser.GameObjects.Text
    private state = ''

    constructor(scene: Phaser.Scene, name: string, color: string, scale: number) {
        // Feet sit at y=26 of the 32px frame, so anchor there for depth sorting.
        this.sprite = scene.add.sprite(0, 0, 'char-idle', 0).setOrigin(0.5, 26 / 32).setScale(scale)
        this.label = text(scene, 0, 0, name, 10, color).setOrigin(0.5, 1).setStroke('#000000', 4).setDepth(5000)
        this.prompt = text(scene, 0, 0, '', 9, '#ffe066').setOrigin(0.5, 1).setStroke('#000000', 4).setDepth(5000)
        this.play('down', false)
    }

    setPosition(x: number, y: number) {
        this.sprite.setPosition(x, y).setDepth(y)
        this.label.setPosition(x, y - 66)
        this.prompt.setPosition(x, y - 82)
    }

    play(facing: Facing, moving: boolean) {
        const key = `${moving ? 'walk' : 'idle'}-${facing === 'left' || facing === 'right' ? 'side' : facing}`
        const state = `${key}:${facing}`
        if (state === this.state) return
        this.state = state
        this.sprite.setFlipX(facing === 'left')
        this.sprite.play(key, true)
    }

    apply(a: Pick<AvatarState, 'facing' | 'moving'>) {
        this.play(a.facing, a.moving)
    }

    setPrompt(msg: string) {
        this.prompt.setText(msg)
    }

    setTint(color: number | null) {
        if (color === null) this.sprite.clearTint()
        else this.sprite.setTint(color)
    }
}
