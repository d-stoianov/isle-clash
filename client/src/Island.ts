import Phaser from 'phaser'
import {
    CASTLE,
    ISLAND_COLS,
    ISLAND_H,
    ISLAND_ROWS,
    ISLAND_W,
    KEG_RADIUS,
    RESOURCE_SPOTS,
    TILE,
    TOWER_SPOT,
    type PlayerState,
    type RaiderState,
    type SheepState,
} from '@gogrow/shared'
import type { Team } from './scenes/BootScene.ts'
import { Unit } from './Unit.ts'
import { fx, label } from './ui.ts'

interface ResourceView {
    sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image
    rubble: Phaser.GameObjects.Image
    bar: Phaser.GameObjects.Graphics
    standing: boolean
}

interface KegView {
    ring: Phaser.GameObjects.Graphics
    fuse: Phaser.GameObjects.Sprite
    count: Phaser.GameObjects.Text
}

/**
 * One player's floating island: terrain, castle, trees, gold, sheep, plus the
 * sabotage visuals that land on it (kegs, fire, raider) and its archer tower.
 * All positions passed in are island world coordinates (1:1 pixels).
 */
export class Island {
    readonly ox: number
    readonly oy: number
    private scene: Phaser.Scene
    private resources: ResourceView[] = []
    private sheep: Phaser.GameObjects.Sprite[] = []
    private sheepShadows: Phaser.GameObjects.Image[] = []
    private sheepAlive: boolean[] = []
    private fires: Phaser.GameObjects.Sprite[] = []
    private tower: Phaser.GameObjects.Image
    private archer: Phaser.GameObjects.Sprite
    private towerUp = false
    private kegs = new Map<number, KegView>()
    private focusRing: Phaser.GameObjects.Graphics
    readonly raider: Unit
    private raiderVisible = false
    private castle: Phaser.GameObjects.Image

    constructor(scene: Phaser.Scene, ox: number, oy: number, team: Team, enemy: Team) {
        this.scene = scene
        this.ox = ox
        this.oy = oy
        this.buildTerrain()

        // decorations first so they sort under everything nearby
        const deco: [string, number, number][] = [
            ['bush1', 40, 120], ['bush2', 668, 120], ['bush3', 30, 545], ['bush1', 670, 548], ['bush2', 260, 300], ['bush3', 455, 470],
        ]
        for (const [key, x, y] of deco) this.at(scene.add.sprite(0, 0, key).play({ key, startFrame: Phaser.Math.Between(0, 7) }), x, y, 0.5, 0.62).setScale(0.8)
        this.at(scene.add.image(0, 0, 'rock1'), 150, 140, 0.5, 0.7)
        this.at(scene.add.image(0, 0, 'rock2'), 560, 560, 0.5, 0.7)

        this.castle = this.at(scene.add.image(0, 0, `${team}-castle`), CASTLE.x, CASTLE.y, 0.5, 249 / 256)

        RESOURCE_SPOTS.forEach((spot, i) => {
            const isTree = spot.kind === 'tree'
            const key = i % 2 ? 'tree2' : 'tree1'
            const sprite = isTree
                ? this.at(scene.add.sprite(0, 0, key).play({ key, startFrame: (i * 3) % 8 }), spot.x, spot.y, 0.5, 241 / 256)
                : this.at(scene.add.image(0, 0, 'gold'), spot.x, spot.y, 0.5, 86 / 128)
            const rubble = isTree
                ? this.at(scene.add.image(0, 0, i % 2 ? 'stump2' : 'stump1'), spot.x, spot.y, 0.5, 240 / 256)
                : this.at(scene.add.image(0, 0, 'gold-small'), spot.x, spot.y, 0.5, 79 / 128)
            rubble.setVisible(false)
            if (!isTree) scene.add.image(this.sx(spot.x), this.sy(spot.y) - 2, 'shadow').setScale(0.55, 0.25).setAlpha(0.3).setDepth(this.sy(spot.y) - 2)
            this.resources.push({ sprite, rubble, bar: scene.add.graphics().setDepth(9400), standing: true })
        })

        this.tower = this.at(scene.add.image(0, 0, `${team}-tower`), TOWER_SPOT.x, TOWER_SPOT.y, 0.5, 230 / 256).setVisible(false)
        this.archer = scene.add
            .sprite(this.sx(TOWER_SPOT.x), this.sy(TOWER_SPOT.y) - 150, `${team}-archer-shoot`, 0)
            .setOrigin(0.5, 135 / 192)
            .setScale(0.8)
            .setDepth(this.sy(TOWER_SPOT.y) + 1)
            .setVisible(false)

        for (const [dx, dy, key] of [[-90, -40, 'fire3'], [0, -120, 'fire2'], [95, -50, 'fire3'], [-40, -170, 'fire1'], [60, -150, 'fire2']] as const) {
            this.fires.push(
                scene.add
                    .sprite(this.sx(CASTLE.x + dx), this.sy(CASTLE.y + dy), key)
                    .play(key)
                    .setScale(1.6)
                    .setOrigin(0.5, 1)
                    .setDepth(this.sy(CASTLE.y) + 5)
                    .setVisible(false),
            )
        }

        this.focusRing = scene.add.graphics().setDepth(this.oy - 5)
        this.raider = new Unit(scene, enemy, 'warrior', null)
        this.raider.setVisible(false)
    }

    sx(x: number) {
        return this.ox + x
    }

    sy(y: number) {
        return this.oy + y
    }

    /** Screen point -> island world point, or null when outside the island. */
    toWorld(x: number, y: number) {
        const wx = x - this.ox
        const wy = y - this.oy
        if (wx < 0 || wy < 0 || wx > ISLAND_W || wy > ISLAND_H) return null
        return { x: wx, y: wy }
    }

    get center() {
        return { x: this.sx(ISLAND_W / 2), y: this.sy(ISLAND_H / 2) }
    }

    get gate() {
        return { x: this.sx(CASTLE.gate.x), y: this.sy(CASTLE.gate.y) }
    }

    /** Places a world-space object and depth-sorts it by its base. */
    private at<T extends Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>(obj: T, x: number, y: number, ox: number, oy: number): T {
        obj.setOrigin(ox, oy).setPosition(this.sx(x), this.sy(y)).setDepth(this.sy(y))
        return obj
    }

    private buildTerrain() {
        const s = this.scene
        const cols = ISLAND_COLS
        const rows = ISLAND_ROWS
        // animated surf around the edge (under the ground)
        for (let r = 0; r <= rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (c > 0 && c < cols - 1 && r > 0 && r < rows) continue
                s.add
                    .sprite(this.ox + c * TILE + 32, this.oy + r * TILE + 32, 'foam')
                    .play({ key: 'foam', startFrame: (c * 5 + r * 3) % 16 })
                    .setDepth(-90)
            }
        }
        // grass (elevated set: cols 5-7, rows 0-2) and the cliff face below it (row 5)
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const tc = 5 + (c === 0 ? 0 : c === cols - 1 ? 2 : 1)
                const tr = r === 0 ? 0 : r === rows - 1 ? 2 : 1
                s.add.image(this.ox + c * TILE, this.oy + r * TILE, 'tilemap', `t${tc}_${tr}`).setOrigin(0).setDepth(-80)
            }
        }
        for (let c = 0; c < cols; c++) {
            const tc = 5 + (c === 0 ? 0 : c === cols - 1 ? 2 : 1)
            s.add.image(this.ox + c * TILE, this.oy + rows * TILE, 'tilemap', `t${tc}_5`).setOrigin(0).setDepth(-80)
        }
        // a few rocks bobbing in the water
        const wr: [string, number, number][] = [['water-rock1', -30, 120], ['water-rock2', ISLAND_W + 28, 330], ['water-rock3', 140, ISLAND_H + 110]]
        for (const [key, x, y] of wr) s.add.sprite(this.sx(x), this.sy(y), key).play({ key, startFrame: Phaser.Math.Between(0, 15) }).setDepth(-85)
    }

    // ---------- per-snapshot updates ----------

    update(state: PlayerState) {
        state.resources.forEach((r, i) => {
            const view = this.resources[i]!
            const standing = r.regrowMs === 0
            if (standing !== view.standing) {
                view.standing = standing
                view.sprite.setVisible(standing)
                view.rubble.setVisible(!standing)
                if (standing) {
                    view.sprite.setScale(0.2)
                    this.scene.tweens.add({ targets: view.sprite, scale: 1, duration: 450, ease: 'Back.easeOut' })
                    fx(this.scene, 'dust', view.sprite.x, view.sprite.y - 10, 1.2, view.sprite.depth + 1)
                }
            }
            // health pips while damaged
            const bar = view.bar.clear()
            if (standing && r.hp < r.maxHp) {
                const spot = RESOURCE_SPOTS[i]!
                const w = 12 * r.maxHp + 6
                const x = this.sx(spot.x) - w / 2
                const y = this.sy(spot.y) - (spot.kind === 'tree' ? 200 : 80)
                bar.fillStyle(0x2b1d14, 0.9).fillRoundedRect(x, y, w, 16, 6)
                for (let k = 0; k < r.maxHp; k++) {
                    bar.fillStyle(k < r.hp ? 0x8ee35b : 0x553a2a, 1).fillRoundedRect(x + 4 + k * 12, y + 4, 9, 8, 3)
                }
            }
        })

        // fire on the castle
        const burning = state.effects.fireMs > 0
        this.fires.forEach((f) => f.setVisible(burning))
        this.castle.setTint(burning ? 0xffb090 : 0xffffff)

        // archer tower
        const towerUp = state.effects.towerMs > 0
        if (towerUp !== this.towerUp) {
            this.towerUp = towerUp
            this.tower.setVisible(towerUp)
            this.archer.setVisible(towerUp)
            if (towerUp) {
                this.tower.setScale(1, 0.1)
                this.scene.tweens.add({ targets: this.tower, scaleY: 1, duration: 500, ease: 'Back.easeOut' })
                fx(this.scene, 'dust', this.tower.x, this.tower.y, 2, this.tower.depth + 1)
            }
        }

        // kegs
        const live = new Set(state.kegs.map((k) => k.id))
        for (const [id, view] of this.kegs) {
            if (live.has(id)) continue
            view.ring.destroy()
            view.fuse.destroy()
            view.count.destroy()
            this.kegs.delete(id)
        }
        for (const keg of state.kegs) {
            let view = this.kegs.get(keg.id)
            const x = this.sx(keg.x)
            const y = this.sy(keg.y)
            if (!view) {
                view = {
                    ring: this.scene.add.graphics().setDepth(this.oy - 4),
                    fuse: this.scene.add.sprite(x, y, 'fire1').play('fire1').setScale(1.4).setOrigin(0.5, 0.9).setDepth(y),
                    count: label(this.scene, x, y - 60, '', 30, '#ff6b5b').setOrigin(0.5).setDepth(9400),
                }
                this.kegs.set(keg.id, view)
            }
            const pulse = 0.35 + 0.25 * Math.sin(this.scene.time.now / 70)
            view.ring
                .clear()
                .fillStyle(0xff3b2e, pulse * 0.5)
                .fillCircle(x, y, KEG_RADIUS)
                .lineStyle(4, 0xff3b2e, 0.9)
                .strokeCircle(x, y, KEG_RADIUS)
            view.count.setText((keg.fuseMs / 1000).toFixed(1))
        }
    }

    /** Called every frame with interpolated positions of the island's moving things. */
    renderUnits(sheep: SheepState[], raider: RaiderState | null) {
        sheep.forEach((s, i) => {
            let sprite = this.sheep[i]
            if (!sprite) {
                this.sheepShadows[i] = this.scene.add.image(0, 0, 'shadow').setScale(0.4, 0.18).setAlpha(0.3)
                sprite = this.scene.add.sprite(0, 0, 'sheep-idle').setOrigin(0.5, 84 / 128)
                this.sheep[i] = sprite
                this.sheepAlive[i] = false
            }
            const shadow = this.sheepShadows[i]!
            if (s.alive !== this.sheepAlive[i]) {
                this.sheepAlive[i] = s.alive
                if (s.alive) fx(this.scene, 'dust', this.sx(s.x), this.sy(s.y), 1.2)
            }
            sprite.setVisible(s.alive)
            shadow.setVisible(s.alive)
            if (!s.alive) return
            const x = this.sx(s.x)
            const y = this.sy(s.y)
            sprite.setPosition(x, y).setDepth(y).setFlipX(s.facing === 'left')
            shadow.setPosition(x, y - 2).setDepth(y - 1)
            const key = s.moving ? 'sheep-move' : i % 2 ? 'sheep-grass' : 'sheep-idle'
            if (sprite.anims.currentAnim?.key !== key) sprite.play(key)
        })

        if (raider) {
            if (!this.raiderVisible) {
                this.raiderVisible = true
                this.raider.setVisible(true)
                fx(this.scene, 'splash', this.sx(raider.x), this.sy(raider.y), 0.9)
            }
            this.raider.setPosition(this.sx(raider.x), this.sy(raider.y))
            if (raider.attacking && !this.raider.busy) this.raider.act('attack', raider.facing)
            else this.raider.pose(raider.facing, raider.moving)
        } else if (this.raiderVisible) {
            this.raiderVisible = false
            fx(this.scene, 'dust', this.raider.x, this.raider.y - 20, 1.6)
            this.raider.setVisible(false)
        }
    }

    /** Ground ring under whatever the local worker would hit next. */
    setFocus(target: { x: number; y: number } | null) {
        const g = this.focusRing.clear()
        if (!target) return
        const pulse = 1 + 0.08 * Math.sin(this.scene.time.now / 120)
        g.lineStyle(4, 0xffffff, 0.85).strokeEllipse(this.sx(target.x), this.sy(target.y), 70 * pulse, 30 * pulse)
    }

    // ---------- one-off effects ----------

    hitResource(index: number) {
        const view = this.resources[index]
        if (!view) return
        const sprite = view.sprite
        const baseX = this.sx(RESOURCE_SPOTS[index]!.x)
        this.scene.tweens.add({ targets: sprite, x: baseX + 6, duration: 40, yoyo: true, repeat: 2, onComplete: () => sprite.setX(baseX) })
        if (RESOURCE_SPOTS[index]!.kind === 'gold') {
            const shine = fx(this.scene, 'gold-shine', sprite.x, sprite.y, 1, sprite.depth + 1)
            shine.setOrigin(0.5, 86 / 128)
        } else {
            fx(this.scene, 'dust', sprite.x + Phaser.Math.Between(-20, 20), sprite.y - 30, 0.8, sprite.depth + 1)
        }
    }

    hitSheep(index: number) {
        const sprite = this.sheep[index]
        if (!sprite) return
        sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
        this.scene.time.delayedCall(80, () => sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY))
    }

    explode(x: number, y: number) {
        const sx = this.sx(x)
        const sy = this.sy(y)
        fx(this.scene, 'explosion', sx, sy - 30, 1.8, 9300)
        this.scene.time.delayedCall(120, () => fx(this.scene, 'explosion2', sx + 30, sy - 10, 1.2, 9301))
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2
            fx(this.scene, 'dust', sx + Math.cos(a) * 60, sy + Math.sin(a) * 40, 1.4, sy)
        }
    }

    /** Archer on the tower shoots the raider down. */
    shoot(x: number, y: number, team: Team) {
        this.archer.play(`${team}-archer-shoot`)
        const arrow = this.scene.add.image(this.archer.x, this.archer.y - 30, `${team}-arrow`).setDepth(9300)
        const tx = this.sx(x)
        const ty = this.sy(y) - 30
        arrow.setRotation(Phaser.Math.Angle.Between(arrow.x, arrow.y, tx, ty))
        this.scene.tweens.add({
            targets: arrow,
            x: tx,
            y: ty,
            duration: 260,
            onComplete: () => {
                arrow.destroy()
                fx(this.scene, 'explosion2', tx, ty, 0.7, 9301)
            },
        })
    }
}
