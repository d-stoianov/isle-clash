import Phaser from 'phaser'
import type { Facing, LoadKind } from '@gogrow/shared'
import type { Team } from './scenes/BootScene.ts'
import { label } from './ui.ts'

/** Feet sit at y=135 of the 192px unit frames; anchor there so depth-sorting by y works. */
const FEET_ORIGIN = 135 / 192

export type PawnAction = 'axe' | 'pickaxe' | 'knife'

/** A pawn (worker) or warrior on screen: sprite, ground shadow, optional name tag and prompt. */
export class Unit {
    readonly sprite: Phaser.GameObjects.Sprite
    private shadow: Phaser.GameObjects.Image
    private tag: Phaser.GameObjects.Text | null
    private prompt: Phaser.GameObjects.Text
    private current = ''
    private actingUntil = 0
    private scene: Phaser.Scene
    readonly team: Team
    readonly kind: 'pawn' | 'warrior'

    constructor(scene: Phaser.Scene, team: Team, kind: 'pawn' | 'warrior', name: string | null) {
        this.scene = scene
        this.team = team
        this.kind = kind
        this.shadow = scene.add.image(0, 0, 'shadow').setScale(0.45, 0.22).setAlpha(0.35)
        this.sprite = scene.add.sprite(0, 0, `${team}-${kind}-idle`).setOrigin(0.5, FEET_ORIGIN)
        this.tag = name
            ? label(scene, 0, 0, name, 18, team === 'blue' ? '#bfe8ff' : '#ffc4b5').setOrigin(0.5, 1)
            : null
        this.prompt = label(scene, 0, 0, '', 16, '#ffe066').setOrigin(0.5, 1)
        this.play(`${team}-${kind}-idle`)
    }

    get x() {
        return this.sprite.x
    }

    get y() {
        return this.sprite.y
    }

    setPosition(x: number, y: number) {
        this.sprite.setPosition(x, y).setDepth(y)
        this.shadow.setPosition(x, y - 2).setDepth(y - 1)
        this.tag?.setPosition(x, y - 74).setDepth(9500)
        this.prompt.setPosition(x, y - (this.tag ? 98 : 74)).setDepth(9500)
    }

    setVisible(v: boolean) {
        for (const o of [this.sprite, this.shadow, this.tag, this.prompt]) o?.setVisible(v)
    }

    /** Idle/run animation for the current carry state, unless a one-shot action is playing. */
    pose(facing: Facing, moving: boolean, carrying: LoadKind | null = null) {
        this.sprite.setFlipX(facing === 'left')
        if (this.scene.time.now < this.actingUntil) return
        const base = this.kind === 'pawn' ? `${this.team}-pawn-${moving ? 'run' : 'idle'}` : `${this.team}-warrior-${moving ? 'run' : 'idle'}`
        this.play(carrying ? `${base}-${carrying}` : base)
    }

    /** Swing a tool (pawn) or attack (warrior) once. */
    act(action: PawnAction | 'attack', facing?: Facing) {
        if (facing) this.sprite.setFlipX(facing === 'left')
        const key = action === 'attack' ? `${this.team}-warrior-attack` : `${this.team}-pawn-interact-${action}`
        this.current = ''
        this.sprite.play(key)
        this.actingUntil = this.scene.time.now + 280
    }

    get busy() {
        return this.scene.time.now < this.actingUntil
    }

    setPrompt(msg: string) {
        this.prompt.setText(msg)
    }

    /** Stunned look: grey tint and a wobble. */
    setStunned(stunned: boolean) {
        if (stunned) this.sprite.setTint(0x9a9aa8)
        else this.sprite.clearTint()
        this.sprite.setAngle(stunned ? Math.sin(this.scene.time.now / 60) * 8 : 0)
    }

    flash() {
        this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
        this.scene.time.delayedCall(90, () => this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY))
    }

    destroy() {
        for (const o of [this.sprite, this.shadow, this.tag, this.prompt]) o?.destroy()
    }

    private play(key: string) {
        if (key === this.current) return
        this.current = key
        this.sprite.play(key, true)
    }
}
