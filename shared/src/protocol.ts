import type { LoadKind, ResourceKind, ShopId, SoldierType, UpgradeId } from './config.ts'

export type Facing = 'left' | 'right'
export type Side = 'you' | 'opponent'

export interface UnitState {
    x: number
    y: number
    facing: Facing
    moving: boolean
}

export interface ResourceState {
    kind: ResourceKind
    /** swings left before it breaks; 0 while regrowing */
    hp: number
    maxHp: number
    /** ms until it's back, 0 when standing */
    regrowMs: number
}

export interface SheepState extends UnitState {
    alive: boolean
    hp: number
}

export interface RaiderState extends UnitState {
    attacking: boolean
    lifeMs: number
}

export interface KegState {
    id: number
    x: number
    y: number
    fuseMs: number
}

export type ArmyOrder = 'charge' | 'defend'

/** A soldier, in arena coordinates (see `toArena`). */
export interface SoldierState {
    id: number
    type: SoldierType
    mine: boolean
    x: number
    y: number
    facing: Facing
    hp: number
    maxHp: number
    action: 'idle' | 'run' | 'attack'
}

export interface BridgeState {
    status: 'none' | 'building' | 'up'
    /** 0..1 while building */
    progress: number
}

export interface PlayerState {
    name: string
    order: ArmyOrder
    gold: number
    pawn: UnitState
    carrying: LoadKind | null
    upgrades: Record<UpgradeId, boolean>
    cooldowns: Record<ShopId, number>
    effects: { stunMs: number; fireMs: number; towerMs: number }
    /** The things on this player's island */
    resources: ResourceState[]
    sheep: SheepState[]
    raider: RaiderState | null
    kegs: KegState[]
}

// ---- client -> server ----

export type ClientMessage =
    /** create a private room and get a shareable code */
    | { t: 'create'; name: string }
    /** join a friend's room by code */
    | { t: 'join'; name: string; code: string }
    /** practice against a server-side bot */
    | { t: 'bot'; name: string }
    /** leave the room you are waiting in */
    | { t: 'cancel' }
    /** your worker's position, streamed while moving */
    | { t: 'move'; x: number; y: number; facing: Facing; moving: boolean }
    /** swing your tool at whatever is in reach */
    | { t: 'swing' }
    /** buy at the castle; `x`/`y` target a spot on the enemy island (keg) */
    | { t: 'buy'; id: ShopId; x?: number; y?: number }
    /** switch your army between charging the enemy and defending home */
    | { t: 'order'; order: ArmyOrder }

export type GameAction = Extract<ClientMessage, { t: 'move' | 'swing' | 'buy' | 'order' }>

// ---- server -> client ----

export type EndReason = 'time' | 'opponent_left'

/**
 * One-off moments for effects and sounds. `island` is whose island it happened
 * on, from the receiver's point of view.
 */
export type GameEvent =
    | { kind: 'swing'; island: Side; target: ResourceKind | 'sheep'; index: number }
    | { kind: 'gather'; island: Side; load: LoadKind }
    | { kind: 'deposit'; island: Side; load: LoadKind; amount: number }
    | { kind: 'buy'; island: Side; item: ShopId }
    | { kind: 'explode'; island: Side; x: number; y: number }
    | { kind: 'smack'; island: Side }
    | { kind: 'drop'; island: Side; load: LoadKind }
    | { kind: 'shot'; island: Side; x: number; y: number }
    // Army events use arena coordinates.
    | { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number; mine: boolean }
    | { kind: 'hit'; x: number; y: number; amount: number }
    | { kind: 'heal'; x: number; y: number; amount: number; mine: boolean }
    | { kind: 'die'; x: number; y: number; type: SoldierType; mine: boolean }
    | { kind: 'spawn'; x: number; y: number; mine: boolean }
    | { kind: 'plunder'; island: Side; amount: number }
    | { kind: 'bridge'; status: 'building' | 'up' | 'destroyed' }
    | { kind: 'charge'; island: Side; order: ArmyOrder }

export type ServerMessage =
    | { t: 'room'; code: string }
    /** `seat` decides how arena coordinates are mirrored for this player */
    | { t: 'start'; opponentName: string; durationMs: number; seat: 0 | 1 }
    | {
          t: 'state'
          timeLeftMs: number
          you: PlayerState
          opponent: PlayerState
          soldiers: SoldierState[]
          bridge: BridgeState
      }
    | { t: 'events'; events: GameEvent[] }
    | {
          t: 'end'
          result: 'win' | 'lose' | 'draw'
          reason: EndReason
          yourGold: number
          opponentGold: number
      }
    | { t: 'error'; message: string }
