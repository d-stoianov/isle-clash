import Phaser from 'phaser'
import type { Facing, LoadKind } from '@isle-clash/shared'
import type { Team } from './scenes/BootScene.ts'
import { label } from './ui.ts'

export type UnitKind = 'pawn' | 'warrior' | 'archer' | 'lancer' | 'monk'
export type PawnAction = 'axe' | 'pickaxe' | 'knife'

/** Where each kind's feet are in its frame (origin y), and how big to draw it. */
const BODY: Record<UnitKind, { originY: number; scale: number; height: number }> = {
    pawn: { originY: 135 / 192, scale: 1, height: 72 },
    warrior: { originY: 137 / 192, scale: 1, height: 90 },
    archer: { originY: 136 / 192, scale: 1, height: 90 },
    monk: { originY: 134 / 192, scale: 1, height: 70 },
    lancer: { originY: 198 / 320, scale: 0.8, height: 120 },
}

/** Any character on screen: sprite, ground shadow, optional name tag, prompt and health bar. */
export class Unit {
    readonly sprite: Phaser.GameObjects.Sprite
    readonly team: Team
    readonly kind: UnitKind
    private shadow: Phaser.GameObjects.Image
    private tag: Phaser.GameObjects.Text | null
    private prompt: Phaser.GameObjects.Text
    private bar: Phaser.GameObjects.Graphics | null = null
    private current = ''
    private actingUntil = 0
    private scene: Phaser.Scene

    constructor(scene: Phaser.Scene, team: Team, kind: UnitKind, name: string | null) {
        this.scene = scene
        this.team = team
        this.kind = kind
        const body = BODY[kind]
        this.shadow = scene.add.image(0, 0, 'shadow').setScale(0.45, 0.22).setAlpha(0.35)
        this.sprite = scene.add.sprite(0, 0, `${team}-${kind}-idle`).setOrigin(0.5, body.originY).setScale(body.scale)
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
        const h = BODY[this.kind].height
        this.sprite.setPosition(x, y).setDepth(y)
        this.shadow.setPosition(x, y - 2).setDepth(y - 1)
        this.tag?.setPosition(x, y - h - 2).setDepth(9500)
        this.prompt.setPosition(x, y - h - (this.tag ? 24 : 2)).setDepth(9500)
        this.bar?.setPosition(x, y - h - 4).setDepth(9400)
    }

    setVisible(v: boolean) {
        for (const o of [this.sprite, this.shadow, this.tag, this.prompt, this.bar]) o?.setVisible(v)
    }

    /** Idle/run animation (with carried load for workers), unless a one-shot action is playing. */
    pose(facing: Facing, moving: boolean, carrying: LoadKind | null = null) {
        this.sprite.setFlipX(facing === 'left')
        if (this.scene.time.now < this.actingUntil) return
        const base = `${this.team}-${this.kind}-${moving ? 'run' : 'idle'}`
        this.play(carrying ? `${base}-${carrying}` : base)
    }

    /** Swing a tool (worker) or attack/heal (soldiers) once. */
    act(action: PawnAction | 'attack', facing?: Facing) {
        if (facing) this.sprite.setFlipX(facing === 'left')
        const key =
            this.kind === 'pawn' ? `${this.team}-pawn-interact-${action}` : `${this.team}-${this.kind}-attack`
        this.current = ''
        this.sprite.play(key)
        this.actingUntil = this.scene.time.now + (this.kind === 'monk' ? 420 : 300)
    }

    get busy() {
        return this.scene.time.now < this.actingUntil
    }

    setPrompt(msg: string) {
        this.prompt.setText(msg)
    }

    /** Small team-coloured health bar over the head, shown once damaged. */
    setHealth(hp: number, max: number) {
        if (!this.bar) this.bar = this.scene.add.graphics()
        const w = 44
        const frac = Math.max(0, hp / max)
        this.bar
            .clear()
            .fillStyle(0x2b1d14, 0.9)
            .fillRoundedRect(-w / 2 - 2, -2, w + 4, 9, 4)
            .fillStyle(frac > 0.35 ? (this.team === 'blue' ? 0x5fd3ff : 0xff6b5b) : 0xffc04a, 1)
            .fillRoundedRect(-w / 2, 0, w * frac, 5, 2)
        this.bar.setVisible(hp < max)
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
        for (const o of [this.sprite, this.shadow, this.tag, this.prompt, this.bar]) o?.destroy()
    }

    private play(key: string) {
        if (key === this.current) return
        this.current = key
        this.sprite.play(key, true)
    }
}
