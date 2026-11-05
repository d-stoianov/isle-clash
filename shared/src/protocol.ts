import type { CropId, ItemId } from './config.ts'

export interface TileState {
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
    tiles: TileState[]
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
    | { t: 'plant'; tile: number; crop: CropId }
    | { t: 'harvest'; tile: number }
    | { t: 'use'; item: ItemId; tile?: number }

// ---- server -> client ----

export type EndReason = 'time' | 'opponent_left'

export type GameEvent =
    | { kind: 'item'; by: Side; item: ItemId; tile?: number; blocked: boolean }
    | { kind: 'harvest'; by: Side; tile: number; amount: number }
    | { kind: 'wither'; by: Side; tile: number }

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
