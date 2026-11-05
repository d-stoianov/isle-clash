# AGENTS.md

Guidance for AI coding agents and contributors working on GoGrow. [README.md](README.md) has the full concept, rules, controls and setup.

## What we're building

GoGrow is a **1v1, real-time, skill-based farming duel** in the browser, with a **~3-minute timer**. It's the game you pick to settle who's better: *"Let's go 1v1 in GoGrow! I'm gonna beat you up."*

- The screen is split in two. Each player owns a farm field with a **shop** and a limited number of **plots**.
- Each player controls a **farmer avatar** with idle and walk animations and a floating nickname. Players walk to the shop to buy seeds, walk to plots to plant and harvest, and race the clock.
- Crops come in tiers from fast (5s) to slow (25s). Slower crops pay more, but they stay exposed to sabotage for longer.
- The shop also sells **boosters** (instant growth) and **debuffs** for the opponent: tornado, lightning, drought (slow growth), freeze, and more to come.
- **Both fields are always visible.** You watch your opponent's crops and farmer move in real time and decide what to hit and when.
- Whoever has the most money when the timer ends wins.

## Product pillars

Every change should support these:

1. **Smooth and fast.** This is a fast-paced game where reaction time matters. Input must feel instant. The remote player has to glide smoothly, with no jitter or teleporting. Treat anything that adds input latency or stutter as a regression.
2. **Skill decides the winner.** Results should come from how quickly and accurately players move and press buttons, how well they read the opponent, and how they balance risk against reward. Don't add randomness that decides matches.
3. **Pixel art in the web.** Art is 16×16 pixel art drawn at an integer scale (3×) with `pixelArt: true`. The game renders at a fixed 1280×720 and scales to fit any window without blurring or breaking the layout.
4. **Playing a friend is the core loop.** Pick a nickname, create a room, send the link, fight. Keep that flow as short as possible.

## Architecture

npm workspaces monorepo:

| Package   | What                                                                                   |
| --------- | -------------------------------------------------------------------------------------- |
| `shared/` | `config.ts` (balance, farm layout, ranges, `plotCenter`, `atShop`), `protocol.ts` (messages) |
| `server/` | Node 24 + `ws`. Rooms (`main.ts`), authoritative `Match` (`match.ts`), practice `Bot`  |
| `client/` | Phaser 4 + TypeScript + Vite. `BootScene` (assets + anims), `MenuScene`, `GameScene`, `Farm`, `Avatar`, `ShopMenu` |

### World and coordinates

- Each farm is a `FIELD_SIZE`×`FIELD_SIZE` space measured in **world pixels** (1 tile = 16px). The client draws it at `SCALE = 3`. `Farm.sx/sy` convert world coordinates to screen coordinates.
- Plot positions, the shop door, walk bounds and interaction ranges live in `shared/src/config.ts`. Both sides use them: the client to show prompts, the server to enforce rules.
- An avatar's position is the point at its **feet**. Objects are depth-sorted by their bottom y.

### Networking rules

- **Own movement is predicted on the client.** The client moves your farmer immediately and sends `move` at `TICK_RATE`, plus one extra message when you stop. The server clamps by speed and bounds. The client snaps to the server position only if they differ by more than `RECONCILE_PX`.
- **The remote avatar is interpolated** about `INTERP_DELAY_MS` (100ms) behind the latest snapshots. Never render raw snapshots directly.
- **Everything else is decided by the server.** Clients send intents (`buy`, `plant`, `harvest`). The server validates shape (`isValidAction`), range (shop door or plot), money, cooldowns and frozen state. Never trust client data.
- The server ticks at 20/s and sends a full `state` snapshot to each player from that player's point of view (`you` / `opponent`). One-off visual moments such as harvests, hits and blocks go out as `events`.
- If you add a message type to `protocol.ts`, handle it on both client and server.
- Shop-building collision is enforced only on the client. The server enforces speed and bounds only.

### Rooms

- `create` returns a 5-character code. The client builds the invite link `?room=CODE`, and the join screen asks for a nickname.
- `join` with that code starts the match. Rooms live only in memory. Logins and persistence come later.
- `bot` starts a match against `server/src/bot.ts`. The bot walks and acts through the same `Match` API as a human player.

## Assets

- Third-party art lives in `client/public/assets/` and is **git-ignored**, because the license doesn't allow redistribution. README lists the files to copy from the pack. Don't commit these files to the public repo.
- The frame layouts are documented in `BootScene.ts`:
  - **Character:** 32×32 frames. Rows are down, up and side (side faces right; flip it for left). Idle has 4 frames, walk has 6.
  - **Crops:** 16×32 frames, 14 per row, one row per crop. Columns 0..ripe are growth stages, column 7 is the seed packet and column 8 is the produce.
  - **House, fences, trees and rocks:** hand-cut frames.
- Item icons and soil tiles are generated in `client/src/sprites.ts`.

## Conventions

- TypeScript everywhere, `strict`, `noUncheckedIndexedAccess`.
- **`erasableSyntaxOnly` is on.** Node runs the server's `.ts` files directly, so `enum`, `namespace` and constructor parameter properties are not allowed. Use union types and assign fields explicitly.
- Use relative imports with the `.ts` extension. Import shared code from `@gogrow/shared`.
- Formatting: 4 spaces, single quotes, no semicolons (Prettier config in the repo root).
- All tunable numbers and layout go in `shared/src/config.ts`. Don't hard-code costs, timings or positions anywhere else.
- Text uses the "Press Start 2P" pixel font. Use hard-edged rectangles for UI (`pixelPanel` in `ui.ts`), with no rounded or anti-aliased shapes.

## Checking your work

```bash
npm run typecheck
npm run dev        # then http://localhost:5173/?practice for an instant bot match
```

For multiplayer changes, test with two tabs: create a room in one and open the invite link in the other. In dev builds, `window.game` exposes the Phaser game for debugging and browser automation.

## Planned (don't block on these, but don't paint us into a corner)

- Logins and accounts, profiles, match history, ranking
- Matchmaking queue next to private rooms
- Rematch, spectators
- More crops, items and debuffs, sound, more animations
