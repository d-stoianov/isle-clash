// Game balance and island layout. Client and server both import this, so they always agree.
// World units are pixels on one player's island at 1x (1 tile = 64px), origin at the
// top-left corner of the island's grass.

export const MATCH_DURATION_MS = 180_000
export const STARTING_GOLD = 30
/** Server simulation + snapshot rate. Remote units are interpolated between snapshots. */
export const TICK_RATE = 20

// ---------- island ----------

export const TILE = 64
export const ISLAND_COLS = 11
export const ISLAND_ROWS = 9
export const ISLAND_W = ISLAND_COLS * TILE
export const ISLAND_H = ISLAND_ROWS * TILE

/** Walkable area for a unit's feet. */
export const BOUNDS = { minX: 28, maxX: ISLAND_W - 28, minY: 30, maxY: ISLAND_H - 24 }
export const SPAWN = { x: 352, y: 262 }

/** The castle: bank (deliver loads here) and shop. Players stand near the gate. */
export const CASTLE = { x: 352, y: 208, gate: { x: 352, y: 228 } }
export const CASTLE_COLLIDER = { minX: 200, maxX: 504, minY: 40, maxY: 200 }
export const GATE_RANGE = 70
/** Where the defensive archer tower appears when bought. */
export const TOWER_SPOT = { x: 586, y: 150 }

export type ResourceKind = 'tree' | 'gold'
export type LoadKind = 'wood' | 'gold' | 'meat'

export interface ResourceSpot {
    kind: ResourceKind
    x: number
    y: number
}

export const RESOURCE_SPOTS: ResourceSpot[] = [
    { kind: 'tree', x: 84, y: 250 },
    { kind: 'tree', x: 92, y: 420 },
    { kind: 'tree', x: 620, y: 262 },
    { kind: 'tree', x: 612, y: 430 },
    { kind: 'tree', x: 352, y: 545 },
    { kind: 'gold', x: 200, y: 520 },
    { kind: 'gold', x: 505, y: 520 },
]

/** Sheep wander (and flee) inside this meadow. */
export const MEADOW = { minX: 190, maxX: 515, minY: 300, maxY: 450 }
export const SHEEP_COUNT = 3

export const REACH = 62
/** Solid radius around resources, used for client-side collision. */
export const RESOURCE_RADIUS: Record<ResourceKind, number> = { tree: 20, gold: 30 }

// ---------- units ----------

export const PAWN_SPEED = 210
export const BOOTS_SPEED = 265
export const SHEEP_SPEED = 70
export const SHEEP_FLEE_SPEED = 150
export const SHEEP_FLEE_RANGE = 120
/** Minimum time between two tool swings. Mashing faster does nothing. */
export const SWING_COOLDOWN_MS = 260

export const LOADS: Record<LoadKind, { value: number; name: string }> = {
    wood: { value: 10, name: 'Wood' },
    meat: { value: 22, name: 'Meat' },
    gold: { value: 40, name: 'Gold' },
}

/** Swings needed to finish each source, with and without the tool upgrade. */
export const SWINGS = {
    tree: { base: 3, upgraded: 2 },
    gold: { base: 6, upgraded: 3 },
    sheep: { base: 2, upgraded: 2 },
}

export const REGROW_MS = { tree: 12_000, gold: 20_000, sheep: 10_000 }

// ---------- shop ----------

export type UpgradeId = 'axe' | 'pickaxe' | 'boots'
export type AttackId = 'keg' | 'raider' | 'fire'
export type SoldierType = 'warrior' | 'archer' | 'lancer' | 'monk'
export type BuildId = 'tower' | 'bridge'
export type ShopId = UpgradeId | AttackId | SoldierType | BuildId

export interface ShopItem {
    id: ShopId
    name: string
    cost: number
    cooldownMs: number
    kind: 'upgrade' | 'attack' | 'army' | 'build'
    /** attack needs a spot on the enemy island to be picked */
    targeted: boolean
    description: string
}

export const KEG_FUSE_MS = 1_600
export const KEG_RADIUS = 105
export const KEG_STUN_MS = 2_000
export const RAIDER_SPEED = 175
export const RAIDER_LIFETIME_MS = 12_000
export const RAIDER_REACH = 48
export const RAIDER_WINDUP_MS = 380
export const RAIDER_STUN_MS = 1_500
export const FIRE_MS = 7_000
export const TOWER_MS = 45_000
/** How long a raider survives on an island guarded by a tower. */
export const TOWER_SHOT_DELAY_MS = 700

export const SHOP: Record<ShopId, ShopItem> = {
    axe: {
        id: 'axe',
        name: 'Sharp Axe',
        cost: 50,
        cooldownMs: 0,
        kind: 'upgrade',
        targeted: false,
        description: 'Trees fall in 2 swings instead of 3',
    },
    pickaxe: {
        id: 'pickaxe',
        name: 'Steel Pickaxe',
        cost: 80,
        cooldownMs: 0,
        kind: 'upgrade',
        targeted: false,
        description: 'Gold breaks in 3 swings instead of 6',
    },
    boots: {
        id: 'boots',
        name: 'Swift Boots',
        cost: 70,
        cooldownMs: 0,
        kind: 'upgrade',
        targeted: false,
        description: 'Run 25% faster',
    },
    keg: {
        id: 'keg',
        name: 'Powder Keg',
        cost: 60,
        cooldownMs: 8_000,
        kind: 'attack',
        targeted: true,
        description: 'Blows up a spot on their island: stuns, drops their load, wrecks trees and gold',
    },
    raider: {
        id: 'raider',
        name: 'Raider',
        cost: 90,
        cooldownMs: 20_000,
        kind: 'attack',
        targeted: false,
        description: 'A warrior lands on their island and hunts their worker for 12s',
    },
    fire: {
        id: 'fire',
        name: 'Torch',
        cost: 70,
        cooldownMs: 20_000,
        kind: 'attack',
        targeted: false,
        description: 'Sets their castle ablaze for 7s: no deliveries, no shopping',
    },
    warrior: {
        id: 'warrior',
        name: 'Warrior',
        cost: 60,
        cooldownMs: 1_500,
        kind: 'army',
        targeted: false,
        description: 'Tough sword & shield. Beats lancers',
    },
    archer: {
        id: 'archer',
        name: 'Archer',
        cost: 70,
        cooldownMs: 1_500,
        kind: 'army',
        targeted: false,
        description: 'Shoots from range. Beats warriors',
    },
    lancer: {
        id: 'lancer',
        name: 'Lancer',
        cost: 90,
        cooldownMs: 1_500,
        kind: 'army',
        targeted: false,
        description: 'Fast, hard-hitting charger. Beats archers',
    },
    monk: {
        id: 'monk',
        name: 'Monk',
        cost: 80,
        cooldownMs: 1_500,
        kind: 'army',
        targeted: false,
        description: 'Heals nearby allies. Never fights',
    },
    tower: {
        id: 'tower',
        name: 'Archer Tower',
        cost: 60,
        cooldownMs: 30_000,
        kind: 'build',
        targeted: false,
        description: 'Guards your island for 45s: shoots raiders and invaders',
    },
    bridge: {
        id: 'bridge',
        name: 'Bridge',
        cost: 150,
        cooldownMs: 0,
        kind: 'build',
        targeted: false,
        description: 'Bridges the strait so armies can cross. Both ways!',
    },
}

export const SHOP_IDS = Object.keys(SHOP) as ShopId[]
export const UPGRADE_IDS: UpgradeId[] = ['axe', 'pickaxe', 'boots']
export const SOLDIER_TYPES: SoldierType[] = ['warrior', 'archer', 'lancer', 'monk']

// ---------- army & bridge ----------
// Soldiers live in "arena" coordinates: seat 0's island at x 0..ISLAND_W, the strait,
// then seat 1's island mirrored so both islands face each other across the bridge.

export const STRAIT = 144
export const ARENA_W = ISLAND_W * 2 + STRAIT
export const BRIDGE_Y = 345
export const BRIDGE_HALF = 34
export const BRIDGE_BUILD_MS = 4_000
export const MAX_SOLDIERS = 8
export const ARMY_AGGRO = 260
/** Gold stolen per point of damage dealt to an enemy castle. */
export const PLUNDER_RATE = 0.5
export const TOWER_RANGE = 330
export const TOWER_DAMAGE = 30
export const TOWER_FIRE_MS = 1_000
export const KEG_UNIT_DAMAGE = 45

export interface SoldierStats {
    hp: number
    damage: number
    range: number
    speed: number
    cooldownMs: number
}

export const SOLDIERS: Record<SoldierType, SoldierStats> = {
    warrior: { hp: 120, damage: 18, range: 48, speed: 125, cooldownMs: 900 },
    archer: { hp: 60, damage: 13, range: 250, speed: 115, cooldownMs: 1_100 },
    lancer: { hp: 110, damage: 28, range: 64, speed: 175, cooldownMs: 1_300 },
    /** monk: `damage` is healing per cast */
    monk: { hp: 70, damage: 16, range: 190, speed: 120, cooldownMs: 1_300 },
}

/** Rock-paper-scissors: attacker -> defender -> damage multiplier. */
export const COUNTERS: Partial<Record<SoldierType, Partial<Record<SoldierType, number>>>> = {
    archer: { warrior: 1.6 },
    lancer: { archer: 1.8, monk: 1.4 },
    warrior: { lancer: 1.6 },
}

export function toArena(seat: 0 | 1, p: Point): Point {
    return seat === 0 ? { x: p.x, y: p.y } : { x: ARENA_W - p.x, y: p.y }
}

/** Arena -> island-local for `seat` (the same flip, it's its own inverse). */
export const fromArena = toArena

/** Which island an arena x is on, or 'strait'. */
export function regionOf(x: number): 0 | 1 | 'strait' {
    if (x <= ISLAND_W) return 0
    if (x >= ISLAND_W + STRAIT) return 1
    return 'strait'
}

export function onBridgeBand(y: number) {
    return Math.abs(y - BRIDGE_Y) <= BRIDGE_HALF
}

/**
 * Arena-space movement for soldiers: islands use the normal colliders, the strait
 * is only walkable on the bridge band, and only while the bridge stands.
 */
export function walkArena(from: Point, to: Point, bridgeUp: boolean): Point {
    const fr = regionOf(from.x)
    let x = to.x
    let y = to.y
    const canCross = bridgeUp && onBridgeBand(from.y) && onBridgeBand(y)
    if (fr === 'strait') {
        if (!bridgeUp) return from
        y = clamp(y, BRIDGE_Y - BRIDGE_HALF, BRIDGE_Y + BRIDGE_HALF)
        return { x: clamp(x, 0, ARENA_W), y }
    }
    // On an island: leaving through the inner edge is only possible on the bridge.
    const seat = fr
    const local = fromArena(seat, from)
    const target = fromArena(seat, { x, y })
    const onEdge = local.x > BOUNDS.maxX - 1
    if (canCross && (target.x > BOUNDS.maxX || onEdge)) {
        return toArena(seat, { x: target.x, y: clamp(target.y, BRIDGE_Y - BRIDGE_HALF, BRIDGE_Y + BRIDGE_HALF) })
    }
    return toArena(seat, walk(local, target))
}

export function isShopId(id: unknown): id is ShopId {
    return typeof id === 'string' && Object.hasOwn(SHOP, id)
}

// ---------- geometry helpers ----------

export interface Point {
    x: number
    y: number
}

export function distance(a: Point, b: Point) {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

export function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v))
}

export function atGate(p: Point, slack = 0) {
    return distance(p, CASTLE.gate) <= GATE_RANGE + slack
}

export function speedFor(boots: boolean) {
    return boots ? BOOTS_SPEED : PAWN_SPEED
}

/**
 * Moves `from` toward `to` while keeping feet inside the island and out of the
 * castle and resource colliders. Used by the client for its own avatar and by
 * the server for bots, so both walk the same way.
 */
export function walk(from: Point, to: Point): Point {
    const blocked = (x: number, y: number) => {
        const c = CASTLE_COLLIDER
        if (x > c.minX && x < c.maxX && y > c.minY && y < c.maxY) return true
        return RESOURCE_SPOTS.some((r) => distance({ x, y }, r) < RESOURCE_RADIUS[r.kind])
    }
    let x = clamp(to.x, BOUNDS.minX, BOUNDS.maxX)
    let y = clamp(to.y, BOUNDS.minY, BOUNDS.maxY)
    if (blocked(x, from.y)) x = from.x
    if (blocked(x, y)) y = from.y
    return { x, y }
}
