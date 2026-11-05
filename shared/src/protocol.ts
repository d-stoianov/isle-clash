import type { CropId, ItemId } from './config.ts'

export type Facing = 'down' | 'up' | 'left' | 'right'

export interface AvatarState {
    x: number
    y: number
    facing: Facing
    moving: boolean
}

export interface PlotState {
    crop: CropId | null
    /** 0..1 while growing, 1 when ripe */
    progress: number
    /** ms left before a ripe crop withers, 0 while growing */
    witherInMs: number
}

export interface EffectsState {
    droughtMs: number
    frozenMs: number
    scarecrowMs: number
}

export interface PlayerState {
    name: string
    money: number
    avatar: AvatarState
    /** seeds bought in the shop and not planted yet */
    seeds: Record<CropId, number>
    plots: PlotState[]
    effects: EffectsState
    cooldowns: Record<ItemId, number>
}

export type Side = 'you' | 'opponent'

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
    /** your avatar's position, sent continuously while moving */
    | { t: 'move'; x: number; y: number; facing: Facing; moving: boolean }
    /** buy seeds or an item (must be at the shop). `plot` targets an enemy plot. */
    | { t: 'buy'; id: CropId | ItemId; plot?: number }
    | { t: 'plant'; plot: number; crop: CropId }
    | { t: 'harvest'; plot: number }

export type GameAction = Extract<ClientMessage, { t: 'move' | 'buy' | 'plant' | 'harvest' }>

// ---- server -> client ----

export type EndReason = 'time' | 'opponent_left'

export type GameEvent =
    | { kind: 'item'; by: Side; item: ItemId; plot?: number; blocked: boolean }
    | { kind: 'harvest'; by: Side; plot: number; amount: number }
    | { kind: 'wither'; by: Side; plot: number }

export type ServerMessage =
    | { t: 'room'; code: string }
    | { t: 'start'; opponentName: string; durationMs: number }
    | { t: 'state'; timeLeftMs: number; you: PlayerState; opponent: PlayerState }
    | { t: 'events'; events: GameEvent[] }
    | {
          t: 'end'
          result: 'win' | 'lose' | 'draw'
          reason: EndReason
          yourMoney: number
          opponentMoney: number
      }
    | { t: 'error'; message: string }
