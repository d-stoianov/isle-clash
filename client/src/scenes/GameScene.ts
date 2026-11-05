import Phaser from 'phaser'
import {
    ARENA_W,
    atGate,
    BRIDGE_Y,
    distance,
    ISLAND_W,
    SOLDIER_TYPES,
    STRAIT,
    KEG_RADIUS,
    LOADS,
    nearestTarget,
    RESOURCE_SPOTS,
    SHOP,
    SPAWN,
    speedFor,
    SWING_COOLDOWN_MS,
    TICK_RATE,
    UPGRADE_IDS,
    walk,
    type Facing,
    type GameEvent,
    type PlayerState,
    type RaiderState,
    type ServerMessage,
    type SheepState,
    type ShopId,
    type Side,
    type SoldierState,
    type UnitState,
} from '@isle-clash/shared'
import { net } from '../net.ts'
import { Island } from '../Island.ts'
import { Unit, type PawnAction } from '../Unit.ts'
import { SHOP_KEYS, ShopMenu } from '../ShopMenu.ts'
import { button, floatText, fx, label, ribbon, text, tiledPanel } from '../ui.ts'

type StateMsg = Extract<ServerMessage, { t: 'state' }>
type EndMsg = Extract<ServerMessage, { t: 'end' }>

const W = 1600
const H = 900
const HALF = 800
const ISLAND_X = 24
const OPP_X = W - ISLAND_X - ISLAND_W
const ISLAND_Y = 172
/** Remote things are drawn this far in the past so there are always two snapshots to blend. */
const INTERP_DELAY_MS = 100
const SEND_INTERVAL_MS = 1000 / TICK_RATE
/** If our predicted position drifts this far from the server's, snap to the server. */
const RECONCILE_PX = 48
/** Train soldiers at the castle gate without opening the shop. */
const TRAIN_KEYS = ['Z', 'X', 'C', 'V'] as const

interface Hud {
    gold: Phaser.GameObjects.Text
    coin: Phaser.GameObjects.Image
    carry: Phaser.GameObjects.Image
    upgrades: Phaser.GameObjects.Image[]
    army: Phaser.GameObjects.Text
    shown: number
}

export class GameScene extends Phaser.Scene {
    private myIsland!: Island
    private oppIsland!: Island
    private me!: Unit
    private opp!: Unit
    private shop!: ShopMenu
    private snaps: { at: number; msg: StateMsg }[] = []
    private pos = { ...SPAWN }
    private facing: Facing = 'right'
    private moving = false
    private lastSent = 0
    private sentMoving = false
    private lastSwing = 0
    private aiming: ShopId | null = null
    private aimRing!: Phaser.GameObjects.Graphics
    private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>
    private timerText!: Phaser.GameObjects.Text
    private huds!: Record<Side, Hud>
    private hint!: Phaser.GameObjects.Text
    private logText!: Phaser.GameObjects.Text
    private toast!: Phaser.GameObjects.Text
    private opponentName = 'Rival'
    private ended = false
    private seat: 0 | 1 = 0
    private soldiers = new Map<number, Unit>()
    private bridge!: Phaser.GameObjects.Image
    private bridgeStatus: 'none' | 'building' | 'up' = 'none'

    constructor() {
        super('game')
    }

    private get latest(): StateMsg | null {
        return this.snaps.at(-1)?.msg ?? null
    }

    create(data: { myName: string; opponentName: string; seat: 0 | 1 }) {
        this.ended = false
        this.seat = data.seat
        this.soldiers = new Map()
        this.bridgeStatus = 'none'
        this.snaps = []
        this.pos = { ...SPAWN }
        this.facing = 'right'
        this.moving = false
        this.aiming = null
        this.opponentName = data.opponentName

        this.add.tileSprite(0, 0, W, H, 'water').setOrigin(0).setDepth(-100)
        this.myIsland = new Island(this, ISLAND_X, ISLAND_Y, 'blue', 'red')
        this.oppIsland = new Island(this, OPP_X, ISLAND_Y, 'red', 'blue', true)
        this.bridge = this.add
            .image(ISLAND_X + ISLAND_W + STRAIT / 2, ISLAND_Y + BRIDGE_Y, 'bridge')
            .setDepth(-70)
            .setVisible(false)
        this.me = new Unit(this, 'blue', 'pawn', data.myName)
        this.opp = new Unit(this, 'red', 'pawn', data.opponentName)
        this.me.setPosition(this.myIsland.sx(SPAWN.x), this.myIsland.sy(SPAWN.y))
        this.opp.setPosition(this.oppIsland.sx(SPAWN.x), this.oppIsland.sy(SPAWN.y))
        this.spawnClouds()

        this.buildHud(data.myName, data.opponentName)
        this.shop = new ShopMenu(this, ISLAND_X + 352, 470, (id) => this.buy(id), () => this.shop.close())
        this.aimRing = this.add.graphics().setDepth(9600)
        this.bindKeys()

        const go = label(this, W / 2, H / 2, 'GO!', 120, '#ffe066').setOrigin(0.5).setDepth(30000).setScale(0.3)
        this.tweens.add({ targets: go, scale: 1.2, duration: 350, ease: 'Back.easeOut' })
        this.tweens.add({ targets: go, alpha: 0, delay: 700, duration: 300, onComplete: () => go.destroy() })

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

    // ---------- scenery & HUD ----------

    private spawnClouds() {
        for (const [key, y, delay] of [['cloud1', 120, 0], ['cloud3', 520, 9000], ['cloud5', 820, 18000]] as const) {
            const cloud = this.add.image(-400, y, key).setAlpha(0.35).setDepth(8500).setScale(0.9)
            this.tweens.add({ targets: cloud, x: W + 400, duration: 42000, delay, repeat: -1 })
        }
    }

    private buildHud(myName: string, oppName: string) {
        this.huds = {
            you: this.buildPlayerHud(0, myName, 'blue', 1),
            opponent: this.buildPlayerHud(HALF, oppName, 'red', -1),
        }
        tiledPanel(this, 'woodtable', W / 2, 62, 210, 112).setDepth(10000)
        this.timerText = label(this, W / 2, 58, '3:00', 44).setOrigin(0.5).setDepth(10001)

        this.hint = label(this, ISLAND_X + 352, H - 34, '', 17, '#f3f7ff').setOrigin(0.5).setDepth(10000)
        this.logText = label(this, OPP_X + 352, H - 34, '', 17, '#ffe7c2').setOrigin(0.5).setDepth(10000)
        this.toast = label(this, ISLAND_X + 352, ISLAND_Y + 40, '', 26, '#ffd0c4').setOrigin(0.5).setDepth(25000).setAlpha(0)
    }

    /** Portrait, name ribbon, gold, carried load and owned upgrades. `dir` mirrors the right side. */
    private buildPlayerHud(x0: number, name: string, team: 'blue' | 'red', dir: 1 | -1): Hud {
        const edge = dir === 1 ? x0 : x0 + HALF
        const at = (dx: number) => edge + dir * dx
        const d = 10000
        const r = ribbon(this, team, at(300), 46, 330, name, 26)
        r.bg.setDepth(d)
        r.text.setDepth(d + 1)
        this.add.image(at(76), 70, `avatar-${team}`).setScale(0.48).setDepth(d + 2)
        const coin = this.add.image(at(168), 120, 'icon-coin').setScale(0.7).setDepth(d)
        const gold = label(this, at(194), 120, '0', 36, '#ffe066').setOrigin(dir === 1 ? 0 : 1, 0.5).setDepth(d)
        const carry = this.add.image(at(330), 120, 'res-wood').setScale(0.6).setDepth(d).setVisible(false)
        const upgrades = UPGRADE_IDS.map((id, i) =>
            this.add
                .image(at(400 + i * 44), 120, id === 'axe' ? 'tool-axe' : id === 'pickaxe' ? 'tool-pickaxe' : 'icon-speed')
                .setScale(id === 'boots' ? 0.55 : 0.85)
                .setDepth(d)
                .setAlpha(0.2),
        )
        const army = label(this, at(160), 154, '', 18, '#ffffff').setOrigin(dir === 1 ? 0 : 1, 0.5).setDepth(d)
        return { gold, coin, carry, upgrades, army, shown: -1 }
    }

    private updateHud(side: Side, p: PlayerState) {
        const hud = this.huds[side]
        if (p.gold !== hud.shown) {
            const first = hud.shown < 0
            hud.shown = p.gold
            hud.gold.setText(String(p.gold))
            if (!first) this.tweens.add({ targets: hud.gold, scale: 1.25, duration: 90, yoyo: true })
        }
        hud.carry.setVisible(!!p.carrying)
        if (p.carrying) hud.carry.setTexture(`res-${p.carrying}`).setScale(p.carrying === 'gold' ? 0.9 : 0.75)
        UPGRADE_IDS.forEach((id, i) => hud.upgrades[i]!.setAlpha(p.upgrades[id] ? 1 : 0.2))
    }

    private updateArmyHud(msg: StateMsg) {
        for (const side of ['you', 'opponent'] as Side[]) {
            const count = msg.soldiers.filter((s) => s.mine === (side === 'you')).length
            const order = msg[side].order
            this.huds[side].army
                .setText(count || order === 'charge' ? `${count} soldiers · ${order === 'charge' ? 'CHARGE' : 'DEFEND'}` : '')
                .setColor(order === 'charge' ? '#ffb199' : '#bfe8ff')
        }
    }

    // ---------- input ----------

    private bindKeys() {
        const kb = this.input.keyboard!
        const K = Phaser.Input.Keyboard.KeyCodes
        this.keys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D }) as typeof this.keys
        kb.addCapture([K.SPACE, K.UP, K.DOWN, K.LEFT, K.RIGHT])
        kb.on('keydown-SPACE', () => this.swing())
        kb.on('keydown-E', () => this.toggleShop())
        kb.on('keydown-ESC', () => {
            this.shop.close()
            this.aiming = null
        })
        for (const [key, id] of Object.entries(SHOP_KEYS)) {
            kb.on(`keydown-${key}`, () => {
                if (this.shop.isOpen) this.buy(id)
            })
        }
        TRAIN_KEYS.forEach((k, i) =>
            kb.on(`keydown-${k}`, () => {
                if (this.shop.isOpen || this.ended) return
                if (!atGate(this.pos)) return this.showToast('Train soldiers at your castle gate')
                this.buy(SOLDIER_TYPES[i]!)
            }),
        )
        kb.on('keydown-Q', () => {
            const me = this.latest?.you
            if (!me || this.ended) return
            net.send({ t: 'order', order: me.order === 'charge' ? 'defend' : 'charge' })
        })
        this.input.mouse?.disableContextMenu()
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
            if (p.rightButtonDown()) {
                this.aiming = null
                return
            }
            if (!this.aiming) return
            const spot = this.oppIsland.toWorld(p.worldX, p.worldY)
            if (!spot) return this.showToast('Click on the enemy island')
            net.send({ t: 'buy', id: this.aiming, x: spot.x, y: spot.y })
            this.aiming = null
        })
    }

    private get stunned() {
        return (this.latest?.you.effects.stunMs ?? 0) > 0
    }

    private toggleShop() {
        const me = this.latest?.you
        if (this.ended || !me || this.stunned) return
        if (this.shop.isOpen) return this.shop.close()
        if (!atGate(this.pos)) return this.showToast('Walk to your castle gate to shop')
        if (me.effects.fireMs > 0) return this.showToast('Your castle is on fire!')
        this.aiming = null
        this.shop.open(me, this.bridgeStatus !== 'none')
    }

    private buy(id: ShopId) {
        if (this.ended) return
        if (SHOP[id].targeted) {
            this.shop.close()
            this.aiming = id
            return
        }
        net.send({ t: 'buy', id })
    }

    private swing() {
        const me = this.latest?.you
        if (this.ended || !me || this.shop.isOpen || this.aiming || this.stunned) return
        if (me.carrying) return this.showToast('Hands full! Deliver it to your castle')
        const now = this.time.now
        if (now - this.lastSwing < SWING_COOLDOWN_MS) return
        const target = nearestTarget(me, this.pos)
        if (!target) return
        this.lastSwing = now
        this.facing = target.x < this.pos.x ? 'left' : 'right'
        this.me.act(toolFor(target.type === 'sheep' ? 'sheep' : RESOURCE_SPOTS[target.index]!.kind), this.facing)
        net.send({ t: 'swing' })
    }

    // ---------- frame loop ----------

    override update(_time: number, deltaMs: number) {
        this.moveSelf(deltaMs / 1000)
        this.renderRemote()
        this.updatePrompts()
    }

    private moveSelf(dt: number) {
        const me = this.latest?.you
        const k = this.keys
        let dx = 0
        let dy = 0
        const canMove = !this.ended && !this.shop.isOpen && !this.aiming && !this.stunned && !this.me.busy
        if (canMove) {
            if (k.left.isDown || k.a.isDown) dx -= 1
            if (k.right.isDown || k.d.isDown) dx += 1
            if (k.up.isDown || k.w.isDown) dy -= 1
            if (k.down.isDown || k.s.isDown) dy += 1
        }
        this.moving = dx !== 0 || dy !== 0
        if (this.moving) {
            const len = Math.hypot(dx, dy)
            const step = speedFor(me?.upgrades.boots ?? false) * dt
            const next = walk(this.pos, { x: this.pos.x + (dx / len) * step, y: this.pos.y + (dy / len) * step })
            this.moving = distance(next, this.pos) > 0.01
            this.pos = next
            if (dx !== 0) this.facing = dx > 0 ? 'right' : 'left'
        }
        this.me.pose(this.facing, this.moving, me?.carrying ?? null)
        this.me.setStunned(this.stunned)
        this.me.setPosition(this.myIsland.sx(this.pos.x), this.myIsland.sy(this.pos.y))

        // Stream position at the tick rate while moving, plus once when stopping.
        const now = performance.now()
        if ((this.moving && now - this.lastSent >= SEND_INTERVAL_MS) || this.moving !== this.sentMoving) {
            net.send({ t: 'move', x: this.pos.x, y: this.pos.y, facing: this.facing, moving: this.moving })
            this.lastSent = now
            this.sentMoving = this.moving
        }
    }

    /** Blend the two snapshots around (now - delay) for everything we don't control. */
    private renderRemote() {
        const snaps = this.snaps
        if (!snaps.length) return
        const renderAt = performance.now() - INTERP_DELAY_MS
        while (snaps.length > 2 && snaps[1]!.at <= renderAt) snaps.shift()
        const a = snaps[0]!
        const b = snaps[1] ?? a
        const t = b === a ? 1 : Phaser.Math.Clamp((renderAt - a.at) / (b.at - a.at), 0, 1)

        const oa = a.msg.opponent
        const ob = b.msg.opponent
        const pawn = lerpUnit(oa.pawn, ob.pawn, t)
        this.opp.pose(this.oppIsland.face(pawn.facing), pawn.moving, ob.carrying)
        this.opp.setStunned(ob.effects.stunMs > 0)
        this.opp.setPosition(this.oppIsland.sx(pawn.x), this.oppIsland.sy(pawn.y))

        this.myIsland.renderUnits(lerpSheep(a.msg.you.sheep, b.msg.you.sheep, t), lerpRaider(a.msg.you.raider, b.msg.you.raider, t))
        this.oppIsland.renderUnits(lerpSheep(oa.sheep, ob.sheep, t), lerpRaider(oa.raider, ob.raider, t))
        this.renderSoldiers(a.msg.soldiers, b.msg.soldiers, t)
    }

    // ---------- army ----------

    /** Arena coordinates -> screen. Seat 1 sees the arena mirrored so its island is on the left. */
    private ax(x: number) {
        return ISLAND_X + (this.seat === 0 ? x : ARENA_W - x)
    }

    private ay(y: number) {
        return ISLAND_Y + y
    }

    private arenaFacing(f: Facing): Facing {
        return this.seat === 0 ? f : f === 'left' ? 'right' : 'left'
    }

    private renderSoldiers(a: SoldierState[], b: SoldierState[], t: number) {
        const prev = new Map(a.map((s) => [s.id, s]))
        const alive = new Set<number>()
        for (const s of b) {
            alive.add(s.id)
            let unit = this.soldiers.get(s.id)
            if (!unit) {
                unit = new Unit(this, s.mine ? 'blue' : 'red', s.type, null)
                this.soldiers.set(s.id, unit)
            }
            const p = prev.get(s.id)
            const x = p ? p.x + (s.x - p.x) * t : s.x
            const y = p ? p.y + (s.y - p.y) * t : s.y
            unit.setPosition(this.ax(x), this.ay(y))
            unit.setHealth(s.hp, s.maxHp)
            const facing = this.arenaFacing(s.facing)
            if (s.action === 'attack' && !unit.busy) unit.act('attack', facing)
            else unit.pose(facing, s.action === 'run')
        }
        for (const [id, unit] of this.soldiers) {
            if (alive.has(id)) continue
            unit.destroy()
            this.soldiers.delete(id)
        }
    }

    private renderBridge(status: 'none' | 'building' | 'up', progress: number) {
        this.bridgeStatus = status
        this.bridge.setVisible(status !== 'none')
        const w = this.bridge.width
        // Planks appear from our side while it's being built.
        const shown = status === 'building' ? Math.max(8, w * progress) : w
        this.bridge.setCrop(0, 0, shown, this.bridge.height)
        if (status === 'building' && Math.random() < 0.15) {
            fx(this, 'dust', this.bridge.x - w / 2 + shown, this.bridge.y + Phaser.Math.Between(-20, 20), 0.8, 9000)
        }
    }

    private updatePrompts() {
        const me = this.latest?.you
        if (!me || this.ended) {
            this.me.setPrompt('')
            this.myIsland.setFocus(null)
            return
        }
        const target = me.carrying || this.shop.isOpen ? null : nearestTarget(me, this.pos)
        this.myIsland.setFocus(target)
        let prompt = ''
        if (this.stunned) prompt = 'STUNNED!'
        else if (me.carrying) prompt = atGate(this.pos) && me.effects.fireMs > 0 ? 'Castle on fire!' : `Bring ${LOADS[me.carrying].name} home!`
        else if (target) prompt = `SPACE  ${target.type === 'sheep' ? 'Catch' : RESOURCE_SPOTS[target.index]!.kind === 'tree' ? 'Chop' : 'Mine'}`
        else if (atGate(this.pos) && !this.shop.isOpen) prompt = 'E Shop  ·  Z X C V Train'
        this.me.setPrompt(prompt)

        const g = this.aimRing.clear()
        if (this.aiming) {
            const p = this.input.activePointer
            if (this.oppIsland.toWorld(p.worldX, p.worldY)) {
                g.fillStyle(0xff3b2e, 0.18).fillCircle(p.worldX, p.worldY, KEG_RADIUS)
                g.lineStyle(4, 0xff3b2e, 1).strokeCircle(p.worldX, p.worldY, KEG_RADIUS)
            }
            this.hint.setText(`${SHOP[this.aiming].name}: click their island or the bridge  •  ESC to cancel`)
        } else {
            this.hint.setText('WASD move  •  SPACE gather  •  E shop  •  ZXCV train  •  Q charge / defend')
        }
    }

    // ---------- server messages ----------

    private onState(msg: StateMsg) {
        this.snaps.push({ at: performance.now(), msg })
        if (this.snaps.length > 30) this.snaps.shift()
        this.myIsland.update(msg.you)
        this.oppIsland.update(msg.opponent)
        this.updateHud('you', msg.you)
        this.updateHud('opponent', msg.opponent)
        this.updateArmyHud(msg)
        this.renderBridge(msg.bridge.status, msg.bridge.progress)
        if (this.shop.isOpen) {
            if (msg.you.effects.fireMs > 0 || msg.you.effects.stunMs > 0) this.shop.close()
            else this.shop.update(msg.you, msg.bridge.status !== 'none')
        }

        const s = Math.ceil(msg.timeLeftMs / 1000)
        this.timerText.setText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
        this.timerText.setColor(s <= 10 ? '#ff6b5b' : '#ffffff')

        // Our worker is predicted locally; only correct it when the server disagrees a lot.
        if (distance(this.pos, msg.you.pawn) > RECONCILE_PX) this.pos = { x: msg.you.pawn.x, y: msg.you.pawn.y }
    }

    private onEvent(e: GameEvent) {
        const mine = 'island' in e ? e.island === 'you' : false
        const island = mine ? this.myIsland : this.oppIsland
        const pawn = mine ? this.me : this.opp
        switch (e.kind) {
            case 'swing': {
                if (e.target === 'sheep') island.hitSheep(e.index)
                else island.hitResource(e.index)
                if (!mine) {
                    const tx = e.target === 'sheep' ? this.latest?.opponent.sheep[e.index]?.x : RESOURCE_SPOTS[e.index]!.x
                    const facing: Facing = tx !== undefined && island.sx(tx) < pawn.x ? 'left' : 'right'
                    pawn.act(toolFor(e.target), facing)
                }
                return
            }
            case 'gather':
                this.popIcon(`res-${e.load}`, pawn.x, pawn.y - 70)
                return
            case 'deposit':
                floatText(this, island.gate.x, island.gate.y - 60, `+${e.amount}`, '#ffe066', 36)
                this.flyCoins(island.gate, this.huds[e.island].coin, Math.ceil(e.amount / 10))
                return
            case 'buy': {
                const item = SHOP[e.item]
                const byMe = item.kind === 'attack' ? !mine : mine
                this.pushLog(`${byMe ? 'You' : this.opponentName}: ${item.name}`)
                if (item.kind === 'attack' && mine) this.showToast(`Incoming ${item.name}!`, '#ff9b8a')
                if (item.kind === 'upgrade') fx(this, 'dust', pawn.x, pawn.y, 1.5)
                if (e.item === 'fire') this.cameras.main.shake(150, mine ? 0.004 : 0.002)
                return
            }
            case 'explode':
                island.explode(e.x, e.y)
                this.cameras.main.shake(mine ? 380 : 200, mine ? 0.012 : 0.005)
                return
            case 'smack':
                pawn.flash()
                this.cameras.main.shake(160, mine ? 0.008 : 0.003)
                floatText(this, pawn.x, pawn.y - 90, 'BONK!', '#ffffff', 30)
                return
            case 'drop':
                this.dropIcon(`res-${e.load}`, pawn.x, pawn.y - 60)
                return
            case 'shot':
                island.shoot(e.x, e.y, mine ? 'blue' : 'red')
                this.pushLog(`${mine ? 'Your' : `${this.opponentName}'s`} tower shot a raider`)
                return
            case 'arrow':
                return this.arrow(this.ax(e.x1), this.ay(e.y1) - 40, this.ax(e.x2), this.ay(e.y2) - 30, e.mine ? 'blue' : 'red')
            case 'hit': {
                const x = this.ax(e.x) + Phaser.Math.Between(-10, 10)
                floatText(this, x, this.ay(e.y) - 90, `-${e.amount}`, '#ff8a7a', 20)
                return
            }
            case 'heal':
                fx(this, `${e.mine ? 'blue' : 'red'}-monk-heal-effect`, this.ax(e.x), this.ay(e.y) - 40, 0.8, 9200)
                floatText(this, this.ax(e.x), this.ay(e.y) - 90, `+${e.amount}`, '#9cff8a', 20)
                return
            case 'die':
                fx(this, 'dust', this.ax(e.x), this.ay(e.y) - 20, 1.6, 9000)
                fx(this, 'explosion2', this.ax(e.x), this.ay(e.y) - 30, 0.5, 9001)
                return
            case 'spawn':
                fx(this, 'dust', this.ax(e.x), this.ay(e.y), 1.3, 9000)
                return
            case 'plunder': {
                const gate = island.gate
                floatText(this, gate.x, gate.y - 110, `-${e.amount}`, '#ff6b5b', 30)
                this.flyCoins(gate, this.huds[mine ? 'opponent' : 'you'].coin, 2)
                if (mine) this.cameras.main.shake(90, 0.003)
                return
            }
            case 'bridge':
                if (e.status === 'building') this.showToast('A bridge is being built!', '#ffe7a8')
                if (e.status === 'up') {
                    this.showToast('The bridge is up! Armies can cross', '#ffe7a8')
                    this.cameras.main.shake(200, 0.004)
                }
                if (e.status === 'destroyed') {
                    this.showToast('The bridge was blown up!', '#ff9b8a')
                    for (let i = 0; i < 4; i++) {
                        fx(this, 'splash', this.bridge.x - 70 + i * 46, this.bridge.y + 20, 0.8, 9000)
                    }
                }
                return
            case 'charge':
                if (e.order === 'charge') {
                    this.banner(mine ? 'CHARGE!' : `${this.opponentName} CHARGES!`, mine ? '#bfe8ff' : '#ff9b8a')
                } else this.pushLog(`${mine ? 'You' : this.opponentName}: defend`)
                return
        }
    }

    // ---------- juice ----------

    private arrow(x1: number, y1: number, x2: number, y2: number, team: 'blue' | 'red') {
        const a = this.add.image(x1, y1, `${team}-arrow`).setDepth(9300)
        a.setRotation(Phaser.Math.Angle.Between(x1, y1, x2, y2))
        const lift = Math.min(80, Math.abs(x2 - x1) / 4)
        this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 260,
            onUpdate: (tw) => {
                const k = tw.getValue() ?? 0
                const x = x1 + (x2 - x1) * k
                const y = y1 + (y2 - y1) * k - Math.sin(k * Math.PI) * lift
                a.setRotation(Phaser.Math.Angle.Between(a.x, a.y, x, y))
                a.setPosition(x, y)
            },
            onComplete: () => a.destroy(),
        })
    }

    private banner(msg: string, color: string) {
        const t = label(this, W / 2, H / 2 - 80, msg, 72, color).setOrigin(0.5).setDepth(30000).setScale(0.4)
        this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' })
        this.tweens.add({ targets: t, alpha: 0, y: t.y - 40, delay: 700, duration: 350, onComplete: () => t.destroy() })
    }

    private popIcon(key: string, x: number, y: number) {
        const img = this.add.image(x, y, key).setDepth(9500).setScale(0.2)
        this.tweens.add({ targets: img, scale: 0.8, y: y - 30, duration: 300, ease: 'Back.easeOut' })
        this.tweens.add({ targets: img, alpha: 0, delay: 500, duration: 250, onComplete: () => img.destroy() })
    }

    private dropIcon(key: string, x: number, y: number) {
        const img = this.add.image(x, y, key).setDepth(9500).setScale(0.7)
        this.tweens.add({ targets: img, x: x + 50, y: y + 60, angle: 200, alpha: 0, duration: 650, ease: 'Quad.easeIn', onComplete: () => img.destroy() })
        floatText(this, x, y - 20, 'dropped!', '#ffb36b', 22)
    }

    private flyCoins(from: { x: number; y: number }, to: Phaser.GameObjects.Image, count: number) {
        for (let i = 0; i < Math.min(count, 6); i++) {
            const coin = this.add.image(from.x + Phaser.Math.Between(-20, 20), from.y - 30, 'icon-coin').setScale(0.5).setDepth(26000)
            this.tweens.add({ targets: coin, x: to.x, y: to.y, scale: 0.35, delay: i * 60, duration: 520, ease: 'Cubic.easeIn', onComplete: () => coin.destroy() })
        }
    }

    private pushLog(line: string) {
        this.logText.setText(line).setScale(1.15)
        this.tweens.add({ targets: this.logText, scale: 1, duration: 200 })
    }

    private showToast(message: string, color = '#ffd0c4') {
        this.tweens.killTweensOf(this.toast)
        this.toast.setText(message).setColor(color).setAlpha(1)
        this.tweens.add({ targets: this.toast, alpha: 0, delay: 1100, duration: 400 })
    }

    private onEnd(msg: EndMsg) {
        this.ended = true
        this.shop.close()
        this.aiming = null
        const title = { win: 'VICTORY!', lose: 'DEFEAT', draw: 'DRAW' }[msg.result]
        const color = msg.result === 'win' ? 'blue' : msg.result === 'lose' ? 'red' : 'yellow'
        const sub = msg.reason === 'opponent_left' ? 'Your rival fled the field.' : `${msg.yourGold}  vs  ${msg.opponentGold} gold`

        const d = 40000
        this.add.rectangle(W / 2, H / 2, W, H, 0x0b1a24, 0.6).setDepth(d).setInteractive()
        tiledPanel(this, 'banner', W / 2, H / 2 + 20, 620, 420).setDepth(d)
        const r = ribbon(this, color, W / 2, H / 2 - 170, 520, title, 52)
        r.bg.setDepth(d + 1)
        r.text.setDepth(d + 2)
        this.add.image(W / 2, H / 2 - 30, msg.result === 'lose' ? 'avatar-red' : 'avatar-blue').setScale(0.6).setDepth(d + 1)
        text(this, W / 2, H / 2 + 80, sub, 34, '#5a3a1a').setOrigin(0.5).setDepth(d + 1)
        button(this, W / 2, H / 2 + 170, 320, 90, 'Back to menu', 'blue', () => this.scene.start('menu')).setDepth(d + 2)
    }

    private onDisconnect() {
        if (this.ended) return
        this.ended = true
        this.showToast('Disconnected from server')
        this.time.delayedCall(1500, () => this.scene.start('menu'))
    }
}

function toolFor(target: 'tree' | 'gold' | 'sheep'): PawnAction {
    return target === 'tree' ? 'axe' : target === 'gold' ? 'pickaxe' : 'knife'
}

function lerpUnit<T extends UnitState>(a: T, b: T, t: number): T {
    return { ...b, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function lerpSheep(a: SheepState[], b: SheepState[], t: number) {
    return b.map((s, i) => {
        const prev = a[i]
        // Don't slide a respawned sheep across the meadow.
        return prev && prev.alive && s.alive ? lerpUnit(prev, s, t) : s
    })
}

function lerpRaider(a: RaiderState | null, b: RaiderState | null, t: number) {
    return a && b ? lerpUnit(a, b, t) : b
}
