import { createServer } from 'node:http'
import { randomInt } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '@isle-clash/shared'
import { Match, type Participant } from './match.ts'
import { Bot } from './bot.ts'

const PORT = Number(process.env.PORT ?? 8080)
// No look-alike characters (0/O, 1/I) so codes are easy to read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5

class Connection implements Participant {
    name = 'Farmer'
    match: Match | null = null
    /** code of the room this connection is hosting and waiting in */
    hosting: string | null = null
    readonly ws: WebSocket
    constructor(ws: WebSocket) {
        this.ws = ws
    }
    send(msg: ServerMessage) {
        if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg))
    }
}

/** Open rooms waiting for a second player, by code. */
const rooms = new Map<string, Connection>()

function newCode() {
    let code: string
    do {
        code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
    } while (rooms.has(code))
    return code
}

function closeRoom(conn: Connection) {
    if (conn.hosting) rooms.delete(conn.hosting)
    conn.hosting = null
}

function startMatch(a: Connection, b: Participant) {
    const match = new Match(a, b)
    a.match = match
    if (b instanceof Connection) b.match = match
    if (b instanceof Bot) b.attach(match)
    match.onFinish = () => {
        a.match = null
        if (b instanceof Connection) b.match = null
    }
    match.start()
}

function cleanName(name: unknown) {
    return String(name ?? '').trim().slice(0, 16) || 'Farmer'
}

function onMessage(conn: Connection, msg: ClientMessage) {
    switch (msg.t) {
        case 'create':
            if (conn.match) return
            closeRoom(conn)
            conn.name = cleanName(msg.name)
            conn.hosting = newCode()
            rooms.set(conn.hosting, conn)
            return conn.send({ t: 'room', code: conn.hosting })
        case 'join': {
            if (conn.match) return
            const code = String(msg.code ?? '').toUpperCase()
            const host = rooms.get(code)
            if (!host || host === conn || host.ws.readyState !== host.ws.OPEN) {
                return conn.send({ t: 'error', message: 'Room not found — ask your friend for a new link' })
            }
            closeRoom(host)
            closeRoom(conn)
            conn.name = cleanName(msg.name)
            return startMatch(host, conn)
        }
        case 'bot':
            if (conn.match) return
            closeRoom(conn)
            conn.name = cleanName(msg.name)
            return startMatch(conn, new Bot())
        case 'cancel':
            return closeRoom(conn)
        default:
            conn.match?.handle(conn, msg)
    }
}

const http = createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'text/plain' }).end('ok')
        return
    }
    res.writeHead(404).end()
})

const wss = new WebSocketServer({ server: http })

wss.on('connection', (ws) => {
    const conn = new Connection(ws)
    ws.on('message', (data) => {
        let msg: ClientMessage
        try {
            msg = JSON.parse(data.toString())
            if (!msg || typeof msg !== 'object') throw new Error()
        } catch {
            return conn.send({ t: 'error', message: 'Malformed message' })
        }
        onMessage(conn, msg)
    })
    ws.on('close', () => {
        closeRoom(conn)
        conn.match?.leave(conn)
    })
})

http.listen(PORT, () => console.log(`Isle Clash server listening on :${PORT}`))
