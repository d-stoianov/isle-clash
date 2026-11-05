# AGENTS.md

Guidance for AI coding agents and contributors working on GoGrow. [README.md](README.md) has the full rules, controls and setup.

## What we're building

GoGrow is a **1v1, real-time, skill-based duel** in the browser with a **3-minute timer**. It's the game you pick to settle who's better: *"Let's go 1v1 in GoGrow! I'm gonna beat you up."*

- Two rival villages on **floating islands**, shown side by side on a split screen. **Both islands are always visible.**
- Each player controls a **worker** with idle, run, carry and tool-swing animations and a floating nickname.
- The worker **chops trees, mines gold and catches sheep**. Every press of Space is one swing. The worker carries **one load at a time** back to the **castle** to bank gold.
- The castle is also the **shop**. It sells **upgrades** (axe, pickaxe, boots), **sabotage** (powder keg, raider, torch) and **defense** (archer tower).
- The player with the most gold when the timer ends wins.

## Product pillars

Every change should support these:

1. **Looks and feels amazing.** Everything should animate and react: swaying trees, surf, sheep, puffs of dust, coins flying to the HUD, explosions, screen shake, pop-in tweens. When adding a mechanic, add its feedback (animation, effect, sound later) at the same time.
2. **Smooth and fast.** Input must feel instant and remote things must glide. Treat added input latency, jitter or teleporting as a regression.
3. **Skill decides the winner.** Results should come from speed (movement, mashing, routing), reading the opponent, and timing or dodging sabotage. Don't add randomness that decides matches. Every attack needs a counter, a tell, or both.
4. **Playing a friend is the core loop.** Pick a nickname, create a room, send the link, fight. Keep that flow as short as possible.

## Architecture

npm workspaces monorepo:

| Package   | What                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `shared/` | `config.ts` (balance, island layout, colliders, `walk()`), `rules.ts` (`nearestTarget`), `protocol.ts` |
| `server/` | Node 24 + `ws`. Rooms (`main.ts`), authoritative `Match` (`match.ts`), practice `Bot` (`bot.ts`)      |
| `client/` | Phaser 4 + TS + Vite. `BootScene`, `MenuScene`, `GameScene`, `Island`, `Unit`, `ShopMenu`, `ui.ts`     |

### World and coordinates

- Each island is `ISLAND_W`×`ISLAND_H` in **world pixels** at 1:1 with the art (1 tile = 64px), with the origin at the top-left of the grass. `Island.sx/sy` convert to screen coordinates.
- The logical screen is **1600×900**: your island on the left, the rival's on the right, HUD on top. Phaser `Scale.FIT` handles any window size.
- Units are anchored at their **feet** and everything is depth-sorted by base y.
- Layout (resource spots, castle gate, colliders, meadow) lives in `shared/src/config.ts`. Movement and collision use the shared `walk()` on the client (own worker) and in the bot, so they agree.

### Networking rules

- **Own movement is predicted on the client.** The client moves its worker immediately and sends `move` at `TICK_RATE` (20/s), plus once on stop. The server clamps by speed and bounds. The client snaps back only beyond `RECONCILE_PX`.
- **Remote things are interpolated**: the rival worker, sheep and raiders are drawn `INTERP_DELAY_MS` (100ms) behind the latest snapshots. Never render raw snapshots directly.
- **Everything else is decided by the server.** Clients send intents (`swing`, `buy`). The server validates shape, range (`nearestTarget`, `atGate`), cooldowns, gold and stun.
- Each tick the server sends a full `state` from the receiver's point of view (`you` / `opponent`), plus `events` for effects. In events, `island` says whose island something happened on, relative to the receiver.
- When adding a message type to `protocol.ts`, handle it on both client and server.

### Rooms

- `create` returns a 5-character code. The client builds the invite link `?room=CODE` and copies it to the clipboard.
- `join` with that code starts the match. Rooms live only in memory. Logins and persistence come later.
- `bot` starts a match against `server/src/bot.ts`. The bot walks, swings, delivers and sabotages through the same `Match` API as a human.
- Playtest overrides for the server: `START_GOLD`, `MATCH_MS`.

## Assets

- All art is **Tiny Swords (Free Pack) by Pixel Frog**. It's imported with `scripts/import-assets.sh` into `client/public/assets/`, which is **git-ignored** because the license forbids redistribution. Never commit those files. If you use a new file from the pack, add it to the import script.
- Units are 192×192 frames (feet at y=135). Trees are 192×256 (8 frames). Sheep and gold are 128×128. FX are 64 or 192px strips. `BootScene` lists every sheet with its frame count and fps.
- The terrain uses tilemap cells (`t<col>_<row>`): grass is cols 5–7 × rows 0–2 and the cliff face is row 5. Foam sprites sit under the edge tiles.
- UI kit sheets space their 9-slice pieces out on a 64px grid. `BootScene.compactNineSlice` packs them into tight textures and records insets in `SLICES`. Use `panel()` (stretched) for buttons and ribbons, and `tiledPanel()` (tiled) for big wood, paper and banner panels.

## Conventions

- TypeScript everywhere, `strict`, `noUncheckedIndexedAccess`.
- **`erasableSyntaxOnly` is on.** Node runs the server's `.ts` files directly, so `enum`, `namespace` and constructor parameter properties are not allowed.
- Use relative imports with the `.ts` extension. Import shared code from `@gogrow/shared`.
- Formatting: 4 spaces, single quotes, no semicolons (Prettier config in the repo root).
- All tunable numbers and layout go in `shared/src/config.ts`.
- Text uses `label()` (Lilita One with a dark outline and shadow) or `text()` for ink on paper.

## Checking your work

```bash
npm run typecheck
START_GOLD=500 npm run dev   # then http://localhost:5173/?practice
```

For multiplayer changes, test with two browser windows (create a room in one, open the invite link in the other). In dev builds, `window.game` exposes the Phaser game for debugging and browser automation.

## Planned (don't block on these, but don't paint us into a corner)

- Logins and accounts, profiles, match history, ranking
- Matchmaking queue next to private rooms
- Rematch, spectators
- More sabotage and defenses, more maps, sound and music
