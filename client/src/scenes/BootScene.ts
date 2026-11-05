import Phaser from 'phaser'
import { text } from '../ui.ts'

/** Team colours. You are always blue on your own screen; your rival is red. */
export type Team = 'blue' | 'red'
export const TEAMS: Team[] = ['blue', 'red']

const PAWN_SHEETS = {
    idle: 8,
    run: 6,
    'idle-wood': 8,
    'run-wood': 6,
    'idle-gold': 8,
    'run-gold': 6,
    'idle-meat': 8,
    'run-meat': 6,
    'interact-axe': 6,
    'interact-pickaxe': 6,
    'interact-knife': 4,
} as const

/** Spritesheets: key -> [file, frameWidth, frameHeight, frames, fps, repeat]. */
const SHEETS: Record<string, [string, number, number, number, number, number]> = {
    foam: ['terrain/foam.png', 192, 192, 16, 10, -1],
    tree1: ['terrain/tree1.png', 192, 256, 8, 8, -1],
    tree2: ['terrain/tree2.png', 192, 256, 8, 8, -1],
    'gold-shine': ['terrain/gold-highlight.png', 128, 128, 6, 12, 0],
    'sheep-idle': ['terrain/sheep-idle.png', 128, 128, 6, 8, -1],
    'sheep-move': ['terrain/sheep-move.png', 128, 128, 4, 10, -1],
    'sheep-grass': ['terrain/sheep-grass.png', 128, 128, 12, 8, -1],
    bush1: ['terrain/bush1.png', 128, 128, 8, 8, -1],
    bush2: ['terrain/bush2.png', 128, 128, 8, 8, -1],
    bush3: ['terrain/bush3.png', 128, 128, 8, 8, -1],
    'water-rock1': ['terrain/water-rock1.png', 64, 64, 16, 8, -1],
    'water-rock2': ['terrain/water-rock2.png', 64, 64, 16, 8, -1],
    'water-rock3': ['terrain/water-rock3.png', 64, 64, 16, 8, -1],
    dust: ['fx/dust.png', 64, 64, 8, 18, 0],
    explosion: ['fx/explosion.png', 192, 192, 8, 16, 0],
    explosion2: ['fx/explosion2.png', 192, 192, 10, 16, 0],
    fire1: ['fx/fire1.png', 64, 64, 8, 12, -1],
    fire2: ['fx/fire2.png', 64, 64, 10, 12, -1],
    fire3: ['fx/fire3.png', 64, 64, 12, 12, -1],
    splash: ['fx/splash.png', 192, 192, 9, 14, 0],
}

const IMAGES: Record<string, string> = {
    tilemap: 'terrain/tilemap.png',
    water: 'terrain/water.png',
    shadow: 'terrain/shadow.png',
    stump1: 'terrain/stump1.png',
    stump2: 'terrain/stump2.png',
    gold: 'terrain/gold.png',
    'gold-small': 'terrain/gold-small.png',
    rock1: 'terrain/rock1.png',
    rock2: 'terrain/rock2.png',
    cloud1: 'terrain/cloud01.png',
    cloud3: 'terrain/cloud03.png',
    cloud5: 'terrain/cloud05.png',
    'res-wood': 'ui/wood.png',
    'res-meat': 'ui/meat.png',
    'res-gold': 'ui/gold.png',
    'icon-coin': 'ui/icon03.png',
    'icon-speed': 'ui/icon07.png',
    'icon-shield': 'ui/icon06.png',
    'tool-hammer': 'ui/tool1.png',
    'tool-axe': 'ui/tool2.png',
    'tool-knife': 'ui/tool3.png',
    'tool-pickaxe': 'ui/tool4.png',
    'avatar-blue': 'ui/avatar05.png',
    'avatar-red': 'ui/avatar09.png',
}

/** UI sheets laid out as spaced 3x3 (or 3x1) pieces; compacted into 9-slice textures at boot. */
const NINE_SLICES: Record<string, string> = {
    woodtable: 'ui/woodtable.png',
    paper: 'ui/paper.png',
    'paper-special': 'ui/paper-special.png',
    banner: 'ui/banner.png',
    'btn-blue': 'ui/big-blue-button-regular.png',
    'btn-blue-pressed': 'ui/big-blue-button-pressed.png',
    'btn-red': 'ui/big-red-button-regular.png',
    'btn-red-pressed': 'ui/big-red-button-pressed.png',
    'bar-base': 'ui/bar-base.png',
    'sbar-base': 'ui/sbar-base.png',
}
/** Ribbon sheet: one colour per row band. */
const RIBBON_COLORS = ['blue', 'red', 'yellow', 'purple', 'black'] as const

/** Insets for each compacted 9-slice texture, filled in at boot. */
export const SLICES: Record<string, { l: number; r: number; t: number; b: number; w: number; h: number }> = {}

export class BootScene extends Phaser.Scene {
    constructor() {
        super('boot')
    }

    preload() {
        text(this, 800, 450, 'Loading...', 32).setOrigin(0.5)
        this.load.setPath('assets')
        for (const team of TEAMS) {
            for (const [name] of Object.entries(PAWN_SHEETS)) {
                this.load.spritesheet(`${team}-pawn-${name}`, `units/${team}-pawn-${name}.png`, { frameWidth: 192, frameHeight: 192 })
            }
            for (const name of ['warrior-idle', 'warrior-run', 'warrior-attack1', 'archer-idle', 'archer-run', 'archer-shoot', 'monk-idle', 'monk-run', 'monk-heal', 'monk-heal-effect']) {
                this.load.spritesheet(`${team}-${name}`, `units/${team}-${name}.png`, { frameWidth: 192, frameHeight: 192 })
            }
            for (const name of ['lancer-idle', 'lancer-run', 'lancer-right-attack']) {
                this.load.spritesheet(`${team}-${name}`, `units/${team}-${name}.png`, { frameWidth: 320, frameHeight: 320 })
            }
            this.load.image(`${team}-arrow`, `units/${team}-arrow.png`)
            this.load.image(`${team}-castle`, `buildings/${team}-castle.png`)
            this.load.image(`${team}-tower`, `buildings/${team}-tower.png`)
        }
        for (const [key, [file, w, h]] of Object.entries(SHEETS)) {
            this.load.spritesheet(key, file, { frameWidth: w, frameHeight: h })
        }
        for (const [key, file] of Object.entries(IMAGES)) this.load.image(key, file)
        for (const [key, file] of Object.entries(NINE_SLICES)) this.load.image(`raw-${key}`, file)
        this.load.image('raw-ribbons', 'ui/ribbons.png')
    }

    create() {
        for (const team of TEAMS) {
            for (const [name, frames] of Object.entries(PAWN_SHEETS)) {
                const interact = name.startsWith('interact')
                this.anim(`${team}-pawn-${name}`, `${team}-pawn-${name}`, frames, interact ? 22 : name.startsWith('run') ? 12 : 9, interact ? 0 : -1)
            }
            this.anim(`${team}-warrior-idle`, `${team}-warrior-idle`, 8, 9, -1)
            this.anim(`${team}-warrior-run`, `${team}-warrior-run`, 6, 12, -1)
            this.anim(`${team}-warrior-attack`, `${team}-warrior-attack1`, 4, 12, 0)
            this.anim(`${team}-archer-shoot`, `${team}-archer-shoot`, 8, 20, 0)
            this.anim(`${team}-archer-attack`, `${team}-archer-shoot`, 8, 20, 0)
            this.anim(`${team}-archer-idle`, `${team}-archer-idle`, 6, 9, -1)
            this.anim(`${team}-archer-run`, `${team}-archer-run`, 4, 10, -1)
            this.anim(`${team}-lancer-idle`, `${team}-lancer-idle`, 12, 10, -1)
            this.anim(`${team}-lancer-run`, `${team}-lancer-run`, 6, 12, -1)
            this.anim(`${team}-lancer-attack`, `${team}-lancer-right-attack`, 3, 10, 0)
            this.anim(`${team}-monk-idle`, `${team}-monk-idle`, 6, 9, -1)
            this.anim(`${team}-monk-run`, `${team}-monk-run`, 4, 10, -1)
            this.anim(`${team}-monk-attack`, `${team}-monk-heal`, 11, 26, 0)
            this.anim(`${team}-monk-heal-effect`, `${team}-monk-heal-effect`, 11, 22, 0)
        }
        for (const [key, [, , , frames, fps, repeat]] of Object.entries(SHEETS)) this.anim(key, key, frames, fps, repeat)

        // Terrain tiles: 64px cells of the tilemap.
        const tm = this.textures.get('tilemap')
        for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) tm.add(`t${c}_${r}`, 0, c * 64, r * 64, 64, 64)

        for (const key of Object.keys(NINE_SLICES)) this.compactNineSlice(key, `raw-${key}`)
        const ribbonSrc = this.textures.get('raw-ribbons').getSourceImage() as HTMLImageElement
        RIBBON_COLORS.forEach((color, i) => {
            const band = document.createElement('canvas')
            band.width = ribbonSrc.width
            band.height = 128
            band.getContext('2d')!.drawImage(ribbonSrc, 0, i * 128, ribbonSrc.width, 128, 0, 0, ribbonSrc.width, 128)
            this.textures.addCanvas(`raw-ribbon-${color}`, band)
            this.compactNineSlice(`ribbon-${color}`, `raw-ribbon-${color}`)
        })

        this.makeBridgeTexture()
        this.input.setDefaultCursor('url(assets/ui/cursor.png) 8 4, auto')
        this.scene.start('menu')
    }

    /** The pack has no bridge, so draw a plank bridge in its palette. */
    private makeBridgeTexture() {
        const w = 200
        const h = 84
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const g = c.getContext('2d')!
        const ink = '#2b1d14'
        // planks
        for (let x = 4, i = 0; x < w - 4; x += 12, i++) {
            g.fillStyle = ink
            g.fillRect(x, 12, 12, h - 24)
            g.fillStyle = i % 2 ? '#b97a3e' : '#a86b34'
            g.fillRect(x + 1, 14, 10, h - 28)
            g.fillStyle = 'rgba(255,255,255,0.18)'
            g.fillRect(x + 1, 14, 10, 3)
            g.fillStyle = 'rgba(0,0,0,0.18)'
            g.fillRect(x + 1, h - 20, 10, 6)
        }
        // rails and posts
        for (const y of [6, h - 14]) {
            g.fillStyle = ink
            g.fillRect(0, y - 1, w, 8)
            g.fillStyle = '#7a4a24'
            g.fillRect(0, y, w, 5)
            g.fillStyle = 'rgba(255,255,255,0.2)'
            g.fillRect(0, y, w, 1)
        }
        for (const x of [0, w / 2 - 6, w - 12]) {
            for (const y of [0, h - 20]) {
                g.fillStyle = ink
                g.fillRect(x, y, 12, 20)
                g.fillStyle = '#8c5a2e'
                g.fillRect(x + 2, y + 2, 8, 16)
            }
        }
        this.textures.addCanvas('bridge', c)
    }

    private anim(key: string, sheet: string, frames: number, frameRate: number, repeat: number) {
        if (this.anims.exists(key)) return
        this.anims.create({ key, frames: this.anims.generateFrameNumbers(sheet, { start: 0, end: frames - 1 }), frameRate, repeat })
    }

    /**
     * The UI kit spaces its 9-slice pieces out on a 64px grid with transparent gaps.
     * Find the opaque runs on each axis and pack the pieces into a tight texture.
     */
    private compactNineSlice(key: string, rawKey: string) {
        const src = this.textures.get(rawKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement
        const probe = document.createElement('canvas')
        probe.width = src.width
        probe.height = src.height
        const pctx = probe.getContext('2d', { willReadFrequently: true })!
        pctx.drawImage(src, 0, 0)
        const data = pctx.getImageData(0, 0, src.width, src.height).data
        const alpha = (x: number, y: number) => data[(y * src.width + x) * 4 + 3]!
        const runs = (len: number, opaque: (i: number) => boolean) => {
            const out: [number, number][] = []
            let start = -1
            for (let i = 0; i <= len; i++) {
                const on = i < len && opaque(i)
                if (on && start < 0) start = i
                if (!on && start >= 0) {
                    out.push([start, i])
                    start = -1
                }
            }
            return out
        }
        const cols = runs(src.width, (x) => {
            for (let y = 0; y < src.height; y++) if (alpha(x, y) > 0) return true
            return false
        })
        const rows = runs(src.height, (y) => {
            for (let x = 0; x < src.width; x++) if (alpha(x, y) > 0) return true
            return false
        })
        const w = cols.reduce((n, [a, b]) => n + b - a, 0)
        const h = rows.reduce((n, [a, b]) => n + b - a, 0)
        const out = document.createElement('canvas')
        out.width = w
        out.height = h
        const ctx = out.getContext('2d')!
        let dy = 0
        for (const [y0, y1] of rows) {
            let dx = 0
            for (const [x0, x1] of cols) {
                ctx.drawImage(src, x0, y0, x1 - x0, y1 - y0, dx, dy, x1 - x0, y1 - y0)
                dx += x1 - x0
            }
            dy += y1 - y0
        }
        const tex = this.textures.addCanvas(key, out)!
        // Named frames for each piece (p<row><col>) so panels can tile edges instead of stretching.
        let fy = 0
        rows.forEach(([y0, y1], r) => {
            let fx = 0
            cols.forEach(([x0, x1], c) => {
                tex.add(`p${r}${c}`, 0, fx, fy, x1 - x0, y1 - y0)
                fx += x1 - x0
            })
            fy += y1 - y0
        })
        const first = (r: [number, number][]) => (r.length > 1 ? r[0]![1] - r[0]![0] : 0)
        const last = (r: [number, number][]) => (r.length > 1 ? r.at(-1)![1] - r.at(-1)![0] : 0)
        SLICES[key] = { l: first(cols), r: last(cols), t: first(rows), b: last(rows), w, h }
    }
}
