// Game balance lives here so client and server always agree.

export const MATCH_DURATION_MS = 120_000
export const STARTING_MONEY = 100
export const GRID_COLS = 4
export const GRID_ROWS = 3
export const TILE_COUNT = GRID_COLS * GRID_ROWS
export const TICK_RATE = 10
/** A ripe crop withers if it is not harvested within this window. */
export const RIPE_WINDOW_MS = 12_000

export type CropId = 'radish' | 'carrot' | 'corn' | 'pumpkin' | 'melon'

export interface CropDef {
    id: CropId
    name: string
    emoji: string
    cost: number
    growMs: number
    sellPrice: number
}

// The longer a crop grows, the better its profit per second — and the
// juicier a target it becomes for the opponent.
export const CROPS: Record<CropId, CropDef> = {
    radish: { id: 'radish', name: 'Radish', emoji: '🥬', cost: 10, growMs: 4_000, sellPrice: 20 },
    carrot: { id: 'carrot', name: 'Carrot', emoji: '🥕', cost: 25, growMs: 9_000, sellPrice: 60 },
    corn: { id: 'corn', name: 'Corn', emoji: '🌽', cost: 45, growMs: 16_000, sellPrice: 110 },
    pumpkin: { id: 'pumpkin', name: 'Pumpkin', emoji: '🎃', cost: 80, growMs: 26_000, sellPrice: 210 },
    melon: { id: 'melon', name: 'Melon', emoji: '🍉', cost: 150, growMs: 40_000, sellPrice: 420 },
}

export const CROP_IDS = Object.keys(CROPS) as CropId[]

export type ItemId = 'fertilizer' | 'scarecrow' | 'lightning' | 'drought' | 'freeze' | 'tornado'

export interface ItemDef {
    id: ItemId
    name: string
    emoji: string
    cost: number
    cooldownMs: number
    /** buffs affect yourself, debuffs affect the opponent */
    kind: 'buff' | 'debuff'
    /** true when the item needs an opponent tile to be picked */
    targeted: boolean
    description: string
}

export const DROUGHT_DURATION_MS = 15_000
export const DROUGHT_GROWTH_MULTIPLIER = 0.4
export const FREEZE_DURATION_MS = 4_000
export const SCARECROW_DURATION_MS = 30_000

export const ITEMS: Record<ItemId, ItemDef> = {
    fertilizer: {
        id: 'fertilizer',
        name: 'Fertilizer',
        emoji: '🧪',
        cost: 60,
        cooldownMs: 25_000,
        kind: 'buff',
        targeted: false,
        description: 'Instantly ripens all your crops',
    },
    scarecrow: {
        id: 'scarecrow',
        name: 'Scarecrow',
        emoji: '🛡️',
        cost: 35,
        cooldownMs: 15_000,
        kind: 'buff',
        targeted: false,
        description: 'Blocks the next debuff (30s)',
    },
    lightning: {
        id: 'lightning',
        name: 'Lightning',
        emoji: '⚡',
        cost: 30,
        cooldownMs: 6_000,
        kind: 'debuff',
        targeted: true,
        description: 'Destroys one enemy crop',
    },
    drought: {
        id: 'drought',
        name: 'Drought',
        emoji: '☀️',
        cost: 45,
        cooldownMs: 20_000,
        kind: 'debuff',
        targeted: false,
        description: 'Enemy crops grow 60% slower (15s)',
    },
    freeze: {
        id: 'freeze',
        name: 'Freeze',
        emoji: '❄️',
        cost: 50,
        cooldownMs: 20_000,
        kind: 'debuff',
        targeted: false,
        description: 'Enemy cannot act (4s)',
    },
    tornado: {
        id: 'tornado',
        name: 'Tornado',
        emoji: '🌪️',
        cost: 180,
        cooldownMs: 45_000,
        kind: 'debuff',
        targeted: false,
        description: 'Destroys ALL enemy crops',
    },
}

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[]
