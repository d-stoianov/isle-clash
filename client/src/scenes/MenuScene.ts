import Phaser from 'phaser'
import { net } from '../net.ts'
import { button, FONT, label, ribbon, text, tiledPanel } from '../ui.ts'
import type { Team } from './BootScene.ts'

const NAME_KEY = 'gogrow:name'
const W = 1600
const H = 900

export class MenuScene extends Phaser.Scene {
    private status!: Phaser.GameObjects.Text
    private nameInput!: HTMLInputElement
    private inviteLink = ''

    constructor() {
        super('menu')
    }

    create() {
        const cx = W / 2
        const roomCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null

        this.add.tileSprite(0, 0, W, H, 'water').setOrigin(0).setDepth(-100)
        this.decorIsland(70, 560, 'blue', 1)
        this.decorIsland(W - 70 - 6 * 64, 560, 'red', -1)
        for (const [key, y, delay, dur] of [['cloud1', 110, 0, 60000], ['cloud3', 380, 15000, 70000], ['cloud5', 760, 30000, 65000]] as const) {
            const cloud = this.add.image(-400, y, key).setAlpha(0.5).setDepth(-50)
            this.tweens.add({ targets: cloud, x: W + 400, duration: dur, delay, repeat: -1 })
        }

        const title = label(this, cx, 120, 'GoGrow!', 120, '#ffe066').setOrigin(0.5)
        this.tweens.add({ targets: title, y: 128, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        ribbon(this, 'blue', cx, 228, 620, 'Gather. Sabotage. Win in 3 minutes.', 26)

        tiledPanel(this, 'banner', cx, 520, 640, 520)
        text(this, cx, 362, 'YOUR NAME', 22, '#6b4a2a').setOrigin(0.5)

        const saved = safeGet(NAME_KEY) ?? `Farmer${Math.floor(Math.random() * 900 + 100)}`
        const dom = this.add.dom(cx, 412, 'input', [
            'width: 360px', 'padding: 12px 18px', `font: 28px ${FONT}`, 'text-align: center', 'color: #2b1d14',
            'border: 4px solid #2b1d14', 'border-radius: 12px', 'background: #fbf1d6', 'outline: none',
            'box-shadow: inset 0 -6px 0 rgba(0,0,0,.12)',
        ].join(';'))
        this.nameInput = dom.node as HTMLInputElement
        this.nameInput.value = saved
        this.nameInput.maxLength = 16
        this.nameInput.placeholder = 'Your name'

        this.status = text(this, cx, 690, '', 22, '#5a3a1a', { align: 'center', wordWrap: { width: 540 } }).setOrigin(0.5)

        const join = button(this, cx, 510, 420, 96, `Join room ${roomCode}`, 'blue', () => this.send('join', roomCode!))
        const create = button(this, cx, 510, 420, 96, 'Create room', 'blue', () => this.send('create'))
        const bot = button(this, cx, 610, 420, 96, 'Practice vs bot', 'red', () => this.send('bot'))
        const copy = button(this, cx - 115, 610, 220, 90, 'Copy link', 'blue', () => this.copyLink(copy))
        const cancel = button(this, cx + 115, 610, 220, 90, 'Cancel', 'red', () => {
            net.send({ t: 'cancel' })
            history.replaceState(null, '', location.pathname)
            this.scene.restart()
        })
        join.setVisible(!!roomCode)
        create.setVisible(!roomCode)
        bot.setVisible(!roomCode)
        copy.setVisible(false)
        cancel.setVisible(!!roomCode)
        if (roomCode) this.status.setText('A rival challenged you to a 1v1!')

        const onRoom = (msg: { code: string }) => {
            this.inviteLink = `${location.origin}${location.pathname}?room=${msg.code}`
            this.status.setText(`Send this link to your rival:\n${this.inviteLink}`)
            create.setVisible(false)
            bot.setVisible(false)
            copy.setVisible(true)
            cancel.setVisible(true)
            this.copyLink(copy)
        }
        const onStart = (msg: { opponentName: string }) => {
            history.replaceState(null, '', location.pathname)
            this.scene.start('game', { opponentName: msg.opponentName, myName: this.name() })
        }
        const onError = (msg: { message: string }) => this.status.setText(msg.message)
        const onClose = () => this.status.setText('Could not reach the server')

        // Dev shortcut: /?practice jumps straight into a bot match.
        if (import.meta.env.DEV && new URLSearchParams(location.search).has('practice')) this.send('bot')

        net.on('room', onRoom)
        net.on('start', onStart)
        net.on('error', onError)
        net.on('close', onClose)
        this.events.once('shutdown', () => {
            net.off('room', onRoom)
            net.off('start', onStart)
            net.off('error', onError)
            net.off('close', onClose)
        })
    }

    /** A little floating island with a castle, a tree, a sheep and a worker hauling gold. */
    private decorIsland(x: number, y: number, team: Team, dir: 1 | -1) {
        const cols = 6
        const rows = 4
        const tileCol = (c: number) => 5 + (c === 0 ? 0 : c === cols - 1 ? 2 : 1)
        for (let r = 0; r <= rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (c > 0 && c < cols - 1 && r > 0 && r < rows) continue
                this.add.sprite(x + c * 64 + 32, y + r * 64 + 32, 'foam').play({ key: 'foam', startFrame: (c + r) % 16 }).setDepth(-90)
            }
        }
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const tr = r === 0 ? 0 : r === rows - 1 ? 2 : 1
                this.add.image(x + c * 64, y + r * 64, 'tilemap', `t${tileCol(c)}_${tr}`).setOrigin(0).setDepth(-80)
            }
        }
        for (let c = 0; c < cols; c++) this.add.image(x + c * 64, y + rows * 64, 'tilemap', `t${tileCol(c)}_5`).setOrigin(0).setDepth(-80)

        const mid = x + (cols * 64) / 2
        this.add.image(mid + dir * 30, y + 120, `${team}-castle`).setOrigin(0.5, 0.97).setScale(0.75).setDepth(y + 120)
        this.add.sprite(mid - dir * 140, y + 150, 'tree1').play({ key: 'tree1', startFrame: 2 }).setOrigin(0.5, 0.94).setScale(0.7).setDepth(y + 150)
        this.add.sprite(mid + dir * 100, y + 230, 'sheep-grass').play('sheep-grass').setOrigin(0.5, 0.66).setDepth(y + 230).setFlipX(dir < 0)
        const pawn = this.add.sprite(mid - 120, y + 205, `${team}-pawn-run-gold`).play(`${team}-pawn-run-gold`).setOrigin(0.5, 0.7).setDepth(y + 205)
        this.tweens.add({
            targets: pawn,
            x: mid + 40,
            duration: 1600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            onYoyo: () => pawn.setFlipX(true),
            onRepeat: () => pawn.setFlipX(false),
        })
    }

    private name() {
        return this.nameInput.value.trim() || 'Farmer'
    }

    private send(kind: 'create' | 'bot' | 'join', code = '') {
        const name = this.name()
        safeSet(NAME_KEY, name)
        this.status.setText('Connecting...')
        if (kind === 'join') net.send({ t: 'join', name, code })
        else net.send({ t: kind, name })
    }

    private copyLink(btn: ReturnType<typeof button>) {
        navigator.clipboard?.writeText(this.inviteLink).then(
            () => {
                btn.setText('Copied!')
                this.time.delayedCall(1500, () => btn.setText('Copy link'))
            },
            () => btn.setText('Copy link'),
        )
    }
}

function safeGet(key: string) {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function safeSet(key: string, value: string) {
    try {
        localStorage.setItem(key, value)
    } catch {
        /* storage unavailable */
    }
}
