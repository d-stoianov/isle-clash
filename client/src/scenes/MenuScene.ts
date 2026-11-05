import Phaser from 'phaser'
import { CROP_IDS } from '@gogrow/shared'
import { net } from '../net.ts'
import { button, FONT, text } from '../ui.ts'
import { registerSprites } from '../sprites.ts'

const NAME_KEY = 'gogrow:name'

export class MenuScene extends Phaser.Scene {
    private status!: Phaser.GameObjects.Text
    private nameInput!: HTMLInputElement
    private inviteLink = ''

    constructor() {
        super('menu')
    }

    create() {
        registerSprites(this)
        const cx = this.scale.width / 2
        const roomCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null

        text(this, cx, 120, 'GoGrow!', 72, '#c8f56b').setOrigin(0.5).setStroke('#0b130c', 12)
        text(this, cx, 200, 'Out-farm your rival in 2 minutes.', 16, '#d9e7c9').setOrigin(0.5)
        text(this, cx, 228, 'Sabotage encouraged.', 16, '#ffb36b').setOrigin(0.5)
        const row = [...CROP_IDS, 'lightning', 'drought', 'freeze', 'tornado']
        row.forEach((key, i) => {
            this.add.image(cx + (i - (row.length - 1) / 2) * 60, 285, key).setScale(4)
        })

        const saved = safeGet(NAME_KEY) ?? `Farmer${Math.floor(Math.random() * 900 + 100)}`
        const dom = this.add.dom(cx, 360, 'input', [
            'width: 320px', 'padding: 14px 16px', `font: 16px ${FONT}`, 'text-align: center',
            'border: 4px solid #111', 'background: #f4f9ec', 'outline: none', 'box-shadow: 0 6px 0 rgba(0,0,0,.4)',
        ].join(';'))
        this.nameInput = dom.node as HTMLInputElement
        this.nameInput.value = saved
        this.nameInput.maxLength = 16
        this.nameInput.placeholder = 'Your name'

        this.status = text(this, cx, 560, '', 14, '#ffffff', { align: 'center', lineSpacing: 10 }).setOrigin(0.5)

        const join = button(this, cx, 460, 380, 64, `Join room ${roomCode}`, '#e8a33d', () => this.send('join', roomCode!))
        const create = button(this, cx - 200, 460, 360, 64, 'Create room', '#e8a33d', () => this.send('create'))
        const bot = button(this, cx + 200, 460, 360, 64, 'Practice vs bot', '#6aa84f', () => this.send('bot'))
        const copy = button(this, cx - 130, 640, 240, 52, 'Copy link', '#c8f56b', () => this.copyLink(copy))
        const cancel = button(this, cx + 130, 640, 240, 52, 'Cancel', '#d9776b', () => {
            net.send({ t: 'cancel' })
            history.replaceState(null, '', location.pathname)
            this.scene.restart()
        })
        join.setVisible(!!roomCode)
        create.setVisible(!roomCode)
        bot.setVisible(!roomCode)
        copy.setVisible(false)
        cancel.setVisible(!!roomCode)
        if (roomCode) this.status.setText('A friend invited you to a duel!')

        const onRoom = (msg: { code: string }) => {
            this.inviteLink = `${location.origin}${location.pathname}?room=${msg.code}`
            this.status.setText(`Room ${msg.code} is open.\nSend this link to a friend:\n\n${this.inviteLink}`)
            create.setVisible(false)
            bot.setVisible(false)
            copy.setVisible(true)
            cancel.setVisible(true)
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
                btn.setLabel('Copied!')
                this.time.delayedCall(1500, () => btn.setLabel('Copy link'))
            },
            () => btn.setLabel('Copy failed'),
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
