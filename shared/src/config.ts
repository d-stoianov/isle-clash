// Game balance and world layout live here so client and server always agree.

export const MATCH_DURATION_MS = 180_000
export const STARTING_MONEY = 100
/** Server simulation + snapshot rate. Remote avatars are interpolated between snapshots. */
export const TICK_RATE = 20
/** A ripe crop withers if it is not harvested within this window. */
export const RIPE_WINDOW_MS = 12_000

// ---------- world ----------
// Each player owns a FIELD_SIZE x FIELD_SIZE farm, in world pixels (1 tile = 16px).
// The client draws it scaled up; the server uses the same units for range checks.

export const TILE = 16
export const FIELD_SIZE = 13 * TILE
export const PLAYER_SPEED = 80 // world px / second
export const SPAWN = { x: 112, y: 106 }
/** Walkable area for the avatar's feet. */
export const BOUNDS = { minX: 8, maxX: FIELD_SIZE - 8, minY: 14, maxY: FIELD_SIZE - 20 }
/** The shop building; its door is where players stand to shop. */
export const SHOP = { x: 6, y: 2, door: { x: 62, y: 106 } }
/** Rectangle the avatar's feet can't enter (the shop building). */
export const SHOP_COLLIDER = { minX: 8, maxX: 88, minY: 26, maxY: 98 }
export const SHOP_RANGE = 18
export const PLOT_RANGE = 16

export const PLOT_COLS = 4
export const PLOT_ROWS = 3
export const PLOT_COUNT = PLOT_COLS * PLOT_ROWS
const PLOT_PITCH = 26
const PLOT_ORIGIN = { x: 62, y: 124 }

/** Center of a plot in world pixels. */
export function plotCenter(i: number) {
    return {
        x: PLOT_ORIGIN.x + (i % PLOT_COLS) * PLOT_PITCH + TILE / 2,
        y: PLOT_ORIGIN.y + Math.floor(i / PLOT_COLS) * PLOT_PITCH + TILE / 2,
    }
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

/** The plot closest to a position, if it's within reach. */
export function plotInReach(pos: { x: number; y: number }, slack = 0): number | null {
    let best: number | null = null
    let bestDist = PLOT_RANGE + slack
    for (let i = 0; i < PLOT_COUNT; i++) {
        const d = distance(pos, plotCenter(i))
        if (d <= bestDist) {
            best = i
            bestDist = d
        }
    }
    return best
}

export function atShop(pos: { x: number; y: number }, slack = 0) {
    return distance(pos, SHOP.door) <= SHOP_RANGE + slack
}

// ---------- crops ----------

export type CropId = 'leek' | 'strawberry' | 'onion' | 'potato'

export interface CropDef {
    id: CropId
    name: string
    cost: number
    growMs: number
    sellPrice: number
}

// Tiers from fast (5s) to slow (25s). Slow crops pay far better per second,
// but they sit on the field longer as a juicy target for the opponent.
export const CROPS: Record<CropId, CropDef> = {
    leek: { id: 'leek', name: 'Leek', cost: 10, growMs: 5_000, sellPrice: 22 },
    strawberry: { id: 'strawberry', name: 'Strawberry', cost: 25, growMs: 11_000, sellPrice: 60 },
    onion: { id: 'onion', name: 'Onion', cost: 45, growMs: 17_000, sellPrice: 115 },
    potato: { id: 'potato', name: 'Potato', cost: 80, growMs: 25_000, sellPrice: 220 },
}

export const CROP_IDS = Object.keys(CROPS) as CropId[]

// ---------- shop items ----------

export type ItemId = 'fertilizer' | 'scarecrow' | 'lightning' | 'drought' | 'freeze' | 'tornado'

export interface ItemDef {
    id: ItemId
    name: string
    cost: number
    cooldownMs: number
    /** buffs affect yourself, debuffs affect the opponent */
    kind: 'buff' | 'debuff'
    /** true when the item needs an opponent plot to be picked */
    targeted: boolean
    description: string
}

export const DROUGHT_DURATION_MS = 15_000
export const DROUGHT_GROWTH_MULTIPLIER = 0.4
export const FREEZE_DURATION_MS = 3_000
export const SCARECROW_DURATION_MS = 30_000

export const ITEMS: Record<ItemId, ItemDef> = {
    fertilizer: {
        id: 'fertilizer',
        name: 'Fertilizer',
        cost: 70,
        cooldownMs: 25_000,
        kind: 'buff',
        targeted: false,
        description: 'Instantly ripens all your crops',
    },
    scarecrow: {
        id: 'scarecrow',
        name: 'Scarecrow',
        cost: 35,
        cooldownMs: 15_000,
        kind: 'buff',
        targeted: false,
        description: 'Blocks the next debuff (30s)',
    },
    lightning: {
        id: 'lightning',
        name: 'Lightning',
        cost: 35,
        cooldownMs: 6_000,
        kind: 'debuff',
        targeted: true,
        description: 'Destroys one enemy crop you pick',
    },
    drought: {
        id: 'drought',
        name: 'Drought',
        cost: 45,
        cooldownMs: 20_000,
        kind: 'debuff',
        targeted: false,
        description: 'Enemy crops grow 60% slower (15s)',
    },
    freeze: {
        id: 'freeze',
        name: 'Freeze',
        cost: 50,
        cooldownMs: 20_000,
        kind: 'debuff',
        targeted: false,
        description: 'Enemy cannot move or act (3s)',
    },
    tornado: {
        id: 'tornado',
        name: 'Tornado',
        cost: 200,
        cooldownMs: 45_000,
        kind: 'debuff',
        targeted: false,
        description: 'Destroys ALL enemy crops',
    },
}

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[]

export function isCrop(id: string): id is CropId {
    return Object.hasOwn(CROPS, id)
}

export function isItem(id: string): id is ItemId {
    return Object.hasOwn(ITEMS, id)
}
