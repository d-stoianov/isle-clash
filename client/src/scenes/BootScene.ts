import Phaser from 'phaser'
import type { CropId } from '@gogrow/shared'
import { registerSprites } from '../sprites.ts'
import { text } from '../ui.ts'

/** Spritesheet row for each crop in assets/crops.png (16x32 frames, 14 per row). */
export const CROP_ROW: Record<CropId, number> = { strawberry: 0, leek: 1, potato: 2, onion: 3 }
/** Column of the fully-grown frame; earlier columns are growth stages. */
export const CROP_RIPE_COL: Record<CropId, number> = { strawberry: 5, leek: 5, potato: 6, onion: 5 }
export const CROP_PACKET_COL = 7
export const CROP_PRODUCE_COL = 8
const CROP_SHEET_COLS = 14

export function cropFrame(crop: CropId, col: number) {
    return CROP_ROW[crop] * CROP_SHEET_COLS + col
}

/** Character sheet rows: 0 = down, 1 = up, 2 = side (faces right; flip for left). */
const DIRS = ['down', 'up', 'side'] as const

export class BootScene extends Phaser.Scene {
    constructor() {
        super('boot')
    }

    preload() {
        text(this, 640, 360, 'Loading...', 16).setOrigin(0.5)
        this.load.setPath('assets')
        this.load.spritesheet('char-idle', 'char-idle.png', { frameWidth: 32, frameHeight: 32 })
        this.load.spritesheet('char-walk', 'char-walk.png', { frameWidth: 32, frameHeight: 32 })
        this.load.spritesheet('crops', 'crops.png', { frameWidth: 16, frameHeight: 32 })
        this.load.spritesheet('chicken', 'chicken.png', { frameWidth: 16, frameHeight: 16 })
        this.load.image('house', 'house.png')
        this.load.image('fences', 'fences.png')
        this.load.image('tree', 'tree.png')
        this.load.image('rocks', 'rocks.png')
    }

    create() {
        // Hand-cut frames from the multi-object sheets.
        this.textures.get('house').add('shop', 0, 140, 0, 84, 100)
        this.textures.get('fences').add('fence-h', 0, 16, 32, 16, 16)
        this.textures.get('fences').add('fence-v', 0, 0, 16, 16, 16)
        this.textures.get('tree').add('big', 0, 96, 0, 32, 48)
        this.textures.get('tree').add('mid', 0, 64, 0, 32, 48)
        this.textures.get('rocks').add('rock', 0, 0, 0, 16, 16)
        this.textures.get('rocks').add('pebbles', 0, 48, 0, 32, 16)

        DIRS.forEach((dir, row) => {
            this.anims.create({
                key: `idle-${dir}`,
                frames: this.anims.generateFrameNumbers('char-idle', { start: row * 4, end: row * 4 + 3 }),
                frameRate: 5,
                repeat: -1,
            })
            this.anims.create({
                key: `walk-${dir}`,
                frames: this.anims.generateFrameNumbers('char-walk', { start: row * 6, end: row * 6 + 5 }),
                frameRate: 10,
                repeat: -1,
            })
        })
        this.anims.create({
            key: 'chicken-idle',
            frames: this.anims.generateFrameNumbers('chicken', { start: 0, end: 3 }),
            frameRate: 4,
            repeat: -1,
        })

        registerSprites(this)
        this.scene.start('menu')
    }
}
