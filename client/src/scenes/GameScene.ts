import Phaser from 'phaser'
import {
    atShop,
    BOUNDS,
    CROP_IDS,
    CROPS,
    distance,
    isCrop,
    ITEMS,
    ITEM_IDS,
    PLAYER_SPEED,
    plotInReach,
    SHOP_COLLIDER,
    SPAWN,
    TICK_RATE,
    type AvatarState,
    type CropId,
    type Facing,
    type GameEvent,
    type ItemId,
    type ServerMessage,
} from '@gogrow/shared'
import { net } from '../net.ts'
import { Farm, FIELD_PX } from '../Farm.ts'
import { Avatar } from '../Avatar.ts'
import { ITEM_KEYS, SEED_KEYS, ShopMenu } from '../ShopMenu.ts'
import { CROP_PRODUCE_COL, cropFrame } from './BootScene.ts'
import { button, floatText, pixelPanel, text } from '../ui.ts'

type StateMsg = Extract<ServerMessage, { t: 'state' }>
type EndMsg = Extract<ServerMessage, { t: 'end' }>
interface Snapshot extends AvatarState {
    at: number
}

const HALF = 640
const FIELD_Y = 88
/** Remote avatars are drawn this far in the past so there are always two snapshots to blend. */
const INTERP_DELAY_MS = 100
const SEND_INTERVAL_MS = 1000 / TICK_RATE
/** If our predicted position drifts this far from the server's, snap to the server. */
const RECONCILE_PX = 20

export class GameScene extends Phaser.Scene {
    private myFarm!: Farm
    private oppFarm!: Farm
    private me!: Avatar
    private opp!: Avatar
    private shop!: ShopMenu
    private state: StateMsg | null = null
    private pos = { ...SPAWN }
    private facing: Facing = 'down'
    private moving = false
    private lastSent = 0
    private sentMoving = false
    private oppSnaps: Snapshot[] = []
    private selectedSeed: CropId = 'leek'
    private aiming: ItemId | null = null
    private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>
    private timerText!: Phaser.GameObjects.Text
    private myMoney!: Phaser.GameObjects.Text
    private oppMoney!: Phaser.GameObjects.Text
    private mySeeds: { icon: Phaser.GameObjects.Image; count: Phaser.GameObjects.Text; frame: Phaser.GameObjects.Graphics }[] = []
    private oppSeeds: Phaser.GameObjects.Text[] = []
    private hint!: Phaser.GameObjects.Text
    private feed: string[] = []
    private feedText!: Phaser.GameObjects.Text
    private toast!: Phaser.GameObjects.Text
    private opponentName = 'Opponent'
    private ended = false

    constructor() {
        super('game')
    }

    create(data: { myName: string; opponentName: string }) {
        this.ended = false
        this.feed = []
        this.state = null
        this.pos = { ...SPAWN }
        this.facing = 'down'
        this.moving = false
        this.oppSnaps = []
        this.aiming = null
        this.selectedSeed = 'leek'
        this.mySeeds = []
        this.oppSeeds = []
        this.opponentName = data.opponentName

        this.add.rectangle(0, 0, 1280, 720, 0x1d2b1f).setOrigin(0).setDepth(-20)
        this.add.rectangle(HALF, 360, 8, 720, 0x0e150d).setDepth(-19)

        this.myFarm = new Farm(this, 8, FIELD_Y, (i) => this.clickMyPlot(i))
        this.oppFarm = new Farm(this, HALF + 8, FIELD_Y, (i) => this.clickOppPlot(i))
        this.me = new Avatar(this, data.myName, '#c8f56b', 3)
        this.opp = new Avatar(this, data.opponentName, '#ffb36b', 3)
        this.me.setPosition(this.myFarm.sx(SPAWN.x), this.myFarm.sy(SPAWN.y))
        this.opp.setPosition(this.oppFarm.sx(SPAWN.x), this.oppFarm.sy(SPAWN.y))

        this.buildHud(data.myName, data.opponentName)
        this.shop = new ShopMenu(this, 8 + FIELD_PX / 2, FIELD_Y + FIELD_PX / 2, (id) => this.buy(id))
        this.bindKeys()

        const handlers: [string, (msg: never) => void][] = [
            ['state', (m: StateMsg) => this.onState(m)],
            ['events', (m: { events: GameEvent[] }) => m.events.forEach((e) => this.onEvent(e))],
            ['end', (m: EndMsg) => this.onEnd(m)],
            ['error', (m: { message: string }) => this.showToast(m.message)],
            ['close', () => this.onDisconnect()],
        ]
        for (const [name, fn] of handlers) net.on(name, fn)
        this.events.once('shutdown', () => {
            for (const [name, fn] of handlers) net.off(name, fn)
        })
    }

    // ---------- HUD ----------

    private buildHud(myName: string, oppName: string) {
        text(this, 20, 14, myName, 14, '#c8f56b')
        text(this, HALF + 96, 14, oppName, 14, '#ffb36b')
        this.myMoney = text(this, HALF - 100, 14, '$0', 16, '#ffe066').setOrigin(1, 0)
        this.oppMoney = text(this, 1280 - 20, 14, '$0', 16, '#ffe066').setOrigin(1, 0)

        const timerBg = this.add.graphics().setDepth(9000)
        pixelPanel(timerBg, HALF - 74, 6, 148, 50, 0x1d2b1f)
        this.timerText = text(this, HALF, 32, '3:00', 22).setOrigin(0.5).setDepth(9001)

        CROP_IDS.forEach((id, i) => {
            const x = 20 + i * 76
            const frame = this.add.graphics()
            const icon = this.add.image(x + 16, 72, 'crops', cropFrame(id, CROP_PRODUCE_COL)).setOrigin(0.5, 1).setScale(2)
            const count = text(this, x + 36, 50, '0', 12)
            text(this, x - 2, 38, String(i + 1), 7, '#8fa786')
            this.add.zone(x + 26, 56, 70, 34).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.selectSeed(id))
            this.mySeeds.push({ icon, count, frame })

            const ox = HALF + 96 + i * 76
            this.add.image(ox + 16, 72, 'crops', cropFrame(id, CROP_PRODUCE_COL)).setOrigin(0.5, 1).setScale(2)
            this.oppSeeds.push(text(this, ox + 36, 50, '0', 12))
        })

        this.hint = text(this, 8 + FIELD_PX / 2, FIELD_Y + FIELD_PX - 8, '', 9, '#ffffff')
            .setOrigin(0.5, 1)
            .setStroke('#000000', 4)
            .setDepth(4700)
        this.feedText = text(this, 1280 - 18, FIELD_Y + 10, '', 9, '#ffffff', { align: 'right', lineSpacing: 6 })
            .setOrigin(1, 0)
            .setStroke('#000000', 4)
            .setDepth(9000)
        this.toast = text(this, 8 + FIELD_PX / 2, FIELD_Y + 40, '', 14, '#ff7b6b')
            .setOrigin(0.5)
            .setStroke('#000000', 6)
            .setDepth(9500)
            .setAlpha(0)
        this.refreshSeedBar()
    }

    private refreshSeedBar() {
        const seeds = this.state?.you.seeds
        CROP_IDS.forEach((id, i) => {
            const slot = this.mySeeds[i]!
            const n = seeds?.[id] ?? 0
            slot.count.setText(String(n))
            slot.icon.setAlpha(n > 0 ? 1 : 0.35)
            slot.frame.clear()
            if (id === this.selectedSeed) {
                const x = 20 + i * 76 - 6
                slot.frame.lineStyle(3, 0xc8f56b, 1).strokeRect(x, 34, 72, 44)
            }
            this.oppSeeds[i]!.setText(String(this.state?.opponent.seeds[id] ?? 0))
        })
    }

    private selectSeed(id: CropId) {
        this.selectedSeed = id
        this.refreshSeedBar()
    }

    // ---------- input ----------

    private bindKeys() {
        const kb = this.input.keyboard!
        const K = Phaser.Input.Keyboard.KeyCodes
        this.keys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D }) as typeof this.keys
        kb.addCapture([K.SPACE, K.UP, K.DOWN, K.LEFT, K.RIGHT])

        SEED_KEYS.forEach((k, i) =>
            kb.on(`keydown-${k}`, () => {
                const id = CROP_IDS[i]!
                if (this.shop.isOpen) this.buy(id)
                else this.selectSeed(id)
            }),
        )
        ITEM_KEYS.forEach((k, i) =>
            kb.on(`keydown-${k}`, () => {
                if (this.shop.isOpen) this.buy(ITEM_IDS[i]!)
            }),
        )
        kb.on('keydown-E', () => this.toggleShop())
        kb.on('keydown-SPACE', () => this.interact())
        kb.on('keydown-ENTER', () => this.interact())
        kb.on('keydown-ESC', () => {
            if (this.shop.isOpen) this.shop.close()
            this.setAiming(null)
        })
        this.input.mouse?.disableContextMenu()
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
            if (p.rightButtonDown()) this.setAiming(null)
        })
    }

    private get frozen() {
        return (this.state?.you.effects.frozenMs ?? 0) > 0
    }

    private toggleShop() {
        if (this.ended || this.frozen) return
        if (this.shop.isOpen) return this.shop.close()
        if (!atShop(this.pos)) return this.showToast('Walk to the shop door first')
        this.setAiming(null)
        this.shop.open()
        if (this.state) this.shop.update(this.state.you)
    }

    private buy(id: CropId | ItemId) {
        if (this.ended) return
        if (!isCrop(id) && ITEMS[id].targeted) {
            this.shop.close()
            this.setAiming(id)
            return
        }
        net.send({ t: 'buy', id })
        if (isCrop(id)) this.selectSeed(id)
    }

    private setAiming(id: ItemId | null) {
        this.aiming = id
        this.oppFarm.hoverColor = id ? 0xffe14a : null
    }

    /** Space: plant or harvest the plot you're standing on, or open the shop at its door. */
    private interact() {
        if (this.ended || this.shop.isOpen || this.frozen) return
        const plot = plotInReach(this.pos)
        if (plot !== null) return this.actOnPlot(plot)
        if (atShop(this.pos)) this.toggleShop()
    }

    private actOnPlot(i: number) {
        const p = this.state?.you.plots[i]
        if (!p) return
        if (p.crop) {
            if (p.progress >= 1) net.send({ t: 'harvest', plot: i })
            else this.showToast('Not ripe yet')
            return
        }
        const crop = this.plantableSeed()
        if (!crop) return this.showToast('No seeds! Buy some at the shop')
        net.send({ t: 'plant', plot: i, crop })
    }

    /** The selected seed if we have one, otherwise any seed we're carrying. */
    private plantableSeed(): CropId | undefined {
        const seeds = this.state?.you.seeds
        if (!seeds) return undefined
        return seeds[this.selectedSeed] > 0 ? this.selectedSeed : CROP_IDS.find((id) => seeds[id] > 0)
    }

    private clickMyPlot(i: number) {
        if (this.ended || this.shop.isOpen || this.frozen) return
        if (plotInReach(this.pos) !== i) return this.showToast('Walk closer to that plot')
        this.actOnPlot(i)
    }

    private clickOppPlot(i: number) {
        if (this.ended || !this.aiming) return
        net.send({ t: 'buy', id: this.aiming, plot: i })
        this.setAiming(null)
    }

    // ---------- frame loop ----------

    override update(_time: number, deltaMs: number) {
        this.moveSelf(deltaMs / 1000)
        this.renderOpponent()
        this.updatePrompts()
    }

    private moveSelf(dt: number) {
        const k = this.keys
        let dx = 0
        let dy = 0
        const canMove = !this.ended && !this.shop.isOpen && !this.aiming && !this.frozen
        if (canMove) {
            if (k.left.isDown || k.a.isDown) dx -= 1
            if (k.right.isDown || k.d.isDown) dx += 1
            if (k.up.isDown || k.w.isDown) dy -= 1
            if (k.down.isDown || k.s.isDown) dy += 1
        }
        this.moving = dx !== 0 || dy !== 0
        if (this.moving) {
            const len = Math.hypot(dx, dy)
            const step = PLAYER_SPEED * dt
            this.pos = collide(this.pos, { x: this.pos.x + (dx / len) * step, y: this.pos.y + (dy / len) * step })
            this.facing = Math.abs(dx) >= Math.abs(dy) && dx !== 0 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
        }
        this.me.apply({ facing: this.facing, moving: this.moving })
        this.me.setPosition(this.myFarm.sx(this.pos.x), this.myFarm.sy(this.pos.y))

        // Stream position at the tick rate while moving, plus once when stopping.
        const now = performance.now()
        if ((this.moving && now - this.lastSent >= SEND_INTERVAL_MS) || this.moving !== this.sentMoving) {
            net.send({ t: 'move', x: this.pos.x, y: this.pos.y, facing: this.facing, moving: this.moving })
            this.lastSent = now
            this.sentMoving = this.moving
        }
    }

    private renderOpponent() {
        const snaps = this.oppSnaps
        if (!snaps.length) return
        const renderAt = performance.now() - INTERP_DELAY_MS
        while (snaps.length > 2 && snaps[1]!.at <= renderAt) snaps.shift()
        const [a, b] = snaps
        let x = a!.x
        let y = a!.y
        let latest: Snapshot = a!
        if (b && renderAt > a!.at) {
            const t = Math.min(1, (renderAt - a!.at) / (b.at - a!.at || 1))
            x = a!.x + (b.x - a!.x) * t
            y = a!.y + (b.y - a!.y) * t
            latest = t >= 0.5 ? b : a!
        }
        this.opp.apply(latest)
        this.opp.setPosition(this.oppFarm.sx(x), this.oppFarm.sy(y))
    }

    private updatePrompts() {
        if (this.ended) return
        let prompt = ''
        const plot = this.shop.isOpen ? null : plotInReach(this.pos)
        this.myFarm.setFocus(plot)
        if (this.aiming) {
            prompt = ''
            this.hint.setText(`${ITEMS[this.aiming].name}: click an enemy crop. ESC to cancel`)
        } else if (this.frozen) {
            prompt = 'FROZEN!'
            this.hint.setText('')
        } else {
            if (plot !== null) {
                const p = this.state?.you.plots[plot]
                if (p?.crop) prompt = p.progress >= 1 ? '[SPACE] Harvest' : ''
                else {
                    const crop = this.plantableSeed()
                    prompt = crop ? `[SPACE] Plant ${CROPS[crop].name}` : 'No seeds - visit the shop'
                }
            } else if (atShop(this.pos) && !this.shop.isOpen) {
                prompt = '[E] Shop'
            }
            this.hint.setText('WASD move  SPACE plant/harvest  E shop  1-4 seed')
        }
        this.me.setPrompt(prompt)
    }

    // ---------- server messages ----------

    private onState(msg: StateMsg) {
        this.state = msg
        this.myFarm.update(msg.you)
        this.oppFarm.update(msg.opponent)
        this.myMoney.setText(`$${msg.you.money}`)
        this.oppMoney.setText(`$${msg.opponent.money}`)
        const s = Math.ceil(msg.timeLeftMs / 1000)
        this.timerText.setText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
        this.timerText.setColor(s <= 10 ? '#ff6b5b' : '#ffffff')
        if (this.shop.isOpen) this.shop.update(msg.you)
        this.refreshSeedBar()
        this.me.setTint(msg.you.effects.frozenMs > 0 ? 0x9fdcff : null)
        this.opp.setTint(msg.opponent.effects.frozenMs > 0 ? 0x9fdcff : null)

        // Our own avatar is predicted locally; only correct it when the server disagrees a lot.
        if (distance(this.pos, msg.you.avatar) > RECONCILE_PX) this.pos = { x: msg.you.avatar.x, y: msg.you.avatar.y }

        this.oppSnaps.push({ ...msg.opponent.avatar, at: performance.now() })
        if (this.oppSnaps.length > 20) this.oppSnaps.shift()
    }

    private onEvent(e: GameEvent) {
        const mine = e.by === 'you'
        const ownFarm = mine ? this.myFarm : this.oppFarm
        const enemyFarm = mine ? this.oppFarm : this.myFarm

        if (e.kind === 'harvest') {
            const { x, y } = ownFarm.plotScreen(e.plot)
            floatText(this, x, y - 40, `+$${e.amount}`, '#ffe066')
            return
        }
        if (e.kind === 'wither') {
            const { x, y } = ownFarm.plotScreen(e.plot)
            floatText(this, x, y - 40, 'withered', '#d0a080', 12)
            return
        }

        const item = ITEMS[e.item]
        this.log(`${mine ? 'You' : this.opponentName}: ${item.name}${e.blocked ? ' (blocked)' : ''}`)
        if (item.kind === 'buff') {
            const { x, y } = ownFarm.center
            this.burst(x, y, e.item, 8)
            floatText(this, x, y + 50, `${item.name}!`, '#9cff8a', 18)
            return
        }
        const { x, y } = e.plot !== undefined ? enemyFarm.plotScreen(e.plot) : enemyFarm.center
        if (e.blocked) {
            this.burst(x, y, 'scarecrow', 8)
            floatText(this, x, y + 50, 'Blocked!', '#9fd8ff', 18)
            return
        }
        this.burst(x, y, e.item, e.plot !== undefined ? 6 : 12, e.item === 'tornado')
        if (!mine && (e.item === 'tornado' || e.item === 'lightning')) this.cameras.main.shake(e.item === 'tornado' ? 500 : 180, 0.008)
        if (e.item === 'lightning') this.cameras.main.flash(120, 255, 255, 200)
    }

    /** Pops a big pixel sprite over a spot, then fades it out. */
    private burst(x: number, y: number, key: string, scale: number, spin = false) {
        const img = this.add.image(x, y, key).setDepth(7000).setScale(scale / 3)
        this.tweens.add({
            targets: img,
            scale,
            angle: spin ? 720 : 0,
            alpha: { from: 1, to: 0 },
            duration: 900,
            ease: 'Cubic.easeOut',
            onComplete: () => img.destroy(),
        })
    }

    private log(line: string) {
        this.feed = [line, ...this.feed].slice(0, 4)
        this.feedText.setText(this.feed.join('\n'))
    }

    private showToast(message: string) {
        this.tweens.killTweensOf(this.toast)
        this.toast.setText(message).setAlpha(1)
        this.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 400 })
    }

    private onEnd(msg: EndMsg) {
        this.ended = true
        this.shop.close()
        this.setAiming(null)
        this.me.setPrompt('')
        const title = { win: 'YOU WIN!', lose: 'YOU LOSE', draw: 'DRAW' }[msg.result]
        const color = { win: '#c8f56b', lose: '#ff7b6b', draw: '#ffffff' }[msg.result]
        const sub = msg.reason === 'opponent_left' ? 'Your opponent left the farm.' : `$${msg.yourMoney}  vs  $${msg.opponentMoney}`

        this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7).setDepth(10000).setInteractive()
        const objs = [
            text(this, 640, 250, title, 56, color).setOrigin(0.5).setStroke('#000000', 10),
            text(this, 640, 340, sub, 20, '#ffe066').setOrigin(0.5),
        ]
        const b = button(this, 640, 450, 340, 64, 'Back to menu', '#c8f56b', () => this.scene.start('menu'))
        for (const o of [...objs, ...b.items]) o.setDepth(10001)
    }

    private onDisconnect() {
        if (this.ended) return
        this.ended = true
        this.showToast('Disconnected from server')
        this.time.delayedCall(1500, () => this.scene.start('menu'))
    }
}

/** Clamp to the field and slide along the shop building instead of walking through it. */
function collide(from: { x: number; y: number }, to: { x: number; y: number }) {
    const blocked = (x: number, y: number) =>
        x > SHOP_COLLIDER.minX && x < SHOP_COLLIDER.maxX && y > SHOP_COLLIDER.minY && y < SHOP_COLLIDER.maxY
    let x = Phaser.Math.Clamp(to.x, BOUNDS.minX, BOUNDS.maxX)
    let y = Phaser.Math.Clamp(to.y, BOUNDS.minY, BOUNDS.maxY)
    if (blocked(x, from.y)) x = from.x
    if (blocked(x, y)) y = from.y
    return { x, y }
}
