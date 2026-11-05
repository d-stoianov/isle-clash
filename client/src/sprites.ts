import Phaser from 'phaser'
import type { CropId, ItemId } from '@gogrow/shared'

/**
 * Hand-made 12x12 pixel art, defined as character grids so the game ships
 * without binary assets. Each character maps to a colour in PALETTE ('.' is
 * transparent). Replace with real spritesheets whenever we have an artist.
 */

const PALETTE: Record<string, string> = {
    g: '#2f6b2a', G: '#5fb33a', W: '#ffffff',
    p: '#8a1f45', P: '#e0457b',
    o: '#b8501a', O: '#f08a24',
    y: '#c99a12', Y: '#ffd43b',
    m: '#1f5a24', M: '#4fa83a',
    b: '#5a3a1a', k: '#2a2a35', K: '#cfe8f0', V: '#7cf05a',
    h: '#7a5230', f: '#f2d27a', r: '#e6c35c', R: '#c8423a',
    s: '#e8901a', S: '#ffd43b', c: '#a8e4ff', t: '#8a8f99', T: '#c9ced6',
}

const SPRITES: Record<CropId | ItemId | 'sprout', string[]> = {
    sprout: [
        '............', '............', '............', '............',
        '...gg..gg...', '..gGGggGGg..', '...gGGGGg...', '.....GG.....',
        '.....GG.....', '.....GG.....', '....bGGb....', '...bbbbbb...',
    ],
    radish: [
        '...g....g...', '..gGg..gGg..', '..gGGggGGg..', '...gGGGGg...',
        '.....GG.....', '...pppppp...', '..pPPPPPPp..', '..pPWPPPPp..',
        '..pPPPPPPp..', '...pPPPPp...', '....pPPp....', '.....pp.....',
    ],
    carrot: [
        '....g.g.g...', '....gGgGg...', '.....gGg....', '....oooo....',
        '...oOOOOo...', '...oOWOOo...', '...oOOOOo...', '....oOOo....',
        '....oOOo....', '.....oOo....', '.....oo.....', '......o.....',
    ],
    corn: [
        '.....yy.....', '....yYYy....', '....yYWy....', '...gyYYyg...',
        '...gyYYyg...', '..gGyYYyGg..', '..gGyYYyGg..', '..gGGyyGGg..',
        '...gGGGGg...', '....gGGg....', '.....gg.....', '.....gg.....',
    ],
    pumpkin: [
        '.....bg.....', '.....b......', '..oooooooo..', '.oOOoOOoOOo.',
        'oOOOoOOoOOOo', 'oOWOoOOoOOOo', 'oOOOoOOoOOOo', 'oOOOoOOoOOOo',
        'oOOOoOOoOOOo', '.oOOoOOoOOo.', '..oooooooo..', '............',
    ],
    melon: [
        '............', '...mmmmmm...', '..mMMmMMmm..', '.mMmMMmMMmm.',
        'mMMmMWmMMmMm', 'mMmMMmMMmMMm', 'mMmMMmMMmMMm', 'mMMmMMmMMmMm',
        '.mMmMMmMMmm.', '..mMMmMMmm..', '...mmmmmm...', '............',
    ],
    fertilizer: [
        '....kkkk....', '.....kk.....', '.....kk.....', '....kKKk....',
        '...kKKKKk...', '..kKVVVVKk..', '..kVVWVVVk..', '.kVVVVVVVVk.',
        '.kVVVVVVVVk.', '.kVVVVVVVVk.', '..kkkkkkkk..', '............',
    ],
    scarecrow: [
        '....hhhh....', '...hhhhhh...', '..hhhhhhhh..', '....ffff....',
        '....fkfk....', '....ffff....', 'rrrrRRRRrrrr', '....RRRR....',
        '....RRRR....', '....bbbb....', '.....bb.....', '.....bb.....',
    ],
    lightning: [
        '............', '.....YYYY...', '....YYYY....', '...YYYY.....',
        '..YYYY......', '.YYYYYYYY...', '....YYYY....', '...YYYY.....',
        '..YYY.......', '.YY.........', 'Y...........', '............',
    ],
    drought: [
        '............', '..s..s..s...', '...sssss....', '..sSSSSSs...',
        'ssSSWSSSSss.', '..sSSSSSs...', '..sSSSSSs...', '...sssss....',
        '..s..s..s...', '............', '............', '............',
    ],
    freeze: [
        '.....c......', '...c.c.c....', '....ccc.....', '.c..cWc..c..',
        '..c.ccc.c...', 'ccccccccccc.', '..c.ccc.c...', '.c..ccc..c..',
        '....ccc.....', '...c.c.c....', '.....c......', '............',
    ],
    tornado: [
        'tttttttttttt', '.TTTTTTTTTT.', '..tttttttt..', '...TTTTTTT..',
        '...tttttt...', '....TTTTT...', '....tttt....', '.....TTT....',
        '.....tt.....', '......T.....', '......t.....', '............',
    ],
}

export type SpriteKey = keyof typeof SPRITES
export const SPRITE_SIZE = 12

export function registerSprites(scene: Phaser.Scene) {
    for (const [key, rows] of Object.entries(SPRITES)) {
        if (scene.textures.exists(key)) continue
        const tex = scene.textures.createCanvas(key, SPRITE_SIZE, SPRITE_SIZE)!
        const ctx = tex.getContext()
        rows.forEach((row, y) => {
            for (let x = 0; x < SPRITE_SIZE; x++) {
                const color = PALETTE[row[x] ?? '.']
                if (!color) continue
                ctx.fillStyle = color
                ctx.fillRect(x, y, 1, 1)
            }
        })
        tex.refresh()
    }
}
