import Phaser from 'phaser'
import type { ClientMessage, ServerMessage } from '@isle-clash/shared'

const SERVER_URL: string =
    import.meta.env.VITE_SERVER_URL ??
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8080`

/**
 * Thin WebSocket wrapper. Emits each server message under its `t` field,
 * e.g. `net.on('state', (msg) => ...)`, plus `open` / `close`.
 */
class Net extends Phaser.Events.EventEmitter {
    private ws: WebSocket | null = null
    private queue: ClientMessage[] = []

    connect() {
        if (this.ws && this.ws.readyState <= WebSocket.OPEN) return
        const ws = new WebSocket(SERVER_URL)
        this.ws = ws
        ws.onopen = () => {
            for (const msg of this.queue) ws.send(JSON.stringify(msg))
            this.queue = []
            this.emit('open')
        }
        ws.onclose = () => {
            this.ws = null
            this.emit('close')
        }
        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data) as ServerMessage
            this.emit(msg.t, msg)
        }
    }

    send(msg: ClientMessage) {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
        else {
            this.queue.push(msg)
            this.connect()
        }
    }
}

export const net = new Net()
