# AGENTS.md

Guidance for AI coding agents and contributors working on GoGrow. See [README.md](README.md) for the full concept, rules and setup.

## What we're building

GoGrow is a **1v1, real-time, skill-based farming duel** in the browser. Each match is **2 minutes** on a split screen. Players plant, sell, buff themselves and sabotage each other, and whoever has more money when the timer ends wins.

Every change should support these product pillars:

1. **Smooth and fast.** This is a fast-paced game where reaction time matters. Input must feel instant, and the networking must never stutter or hitch. If a change hurts responsiveness, it's a regression.
2. **Skill decides the winner.** Results should come from how quickly and accurately players act, from reading the opponent (both fields are always visible), and from managing risk against reward. Avoid adding randomness that decides matches.
3. **Pixel art in the web.** The art is crisp, chunky pixel art. The game renders at a fixed 1280×720 logical resolution and scales to any window without blurring or breaking the layout.
4. **Playing with friends is the core loop.** One player creates a room and sends the link to a friend, who opens it and plays. Keep that flow as short as possible.

## Architecture

npm workspaces monorepo:

| Package   | What                                                                  |
| --------- | --------------------------------------------------------------------- |
| `shared/` | `config.ts` (all balance numbers) and `protocol.ts` (message types)   |
| `server/` | Node 24 + `ws`. Rooms, authoritative `Match` simulation, practice bot |
| `client/` | Phaser 4 + TypeScript + Vite. Scenes, field view, generated sprites   |

### Networking rules

- **The server is authoritative.** Clients send intents (`plant`, `harvest`, `use`) and the server validates and applies them. Never trust client data. Validate everything in `Match.apply` / `isValidAction`.
- The server ticks at `TICK_RATE` (10/s) and sends a full `state` snapshot to each player from that player's point of view (`you` / `opponent`). One-off visual moments such as hits, harvests and blocks go out as `events`.
- The messages are JSON over a single WebSocket. Keep payloads small. If a message type is added to `protocol.ts`, handle it on both sides.
- To keep the game smooth, the client should render the latest snapshot immediately. If you add interpolation or prediction later, the server stays the source of truth.

### Rooms

- `create` returns a 5-character code, and the client builds the invite link `?room=CODE`.
- `join` with that code starts the match. Rooms only exist in memory. Expect accounts and persistence to come later.
- `bot` starts a match against `server/src/bot.ts`, which uses the same `Match` API as a human player.

## Conventions

- TypeScript everywhere, `strict`, `noUncheckedIndexedAccess`.
- **`erasableSyntaxOnly` is on.** Node runs the server's `.ts` files directly, so `enum`, `namespace` and constructor parameter properties are not allowed. Use union types and assign fields explicitly.
- Use relative imports with the `.ts` extension (`./match.ts`). Import shared code from `@gogrow/shared`.
- Formatting: 4 spaces, single quotes, no semicolons (Prettier config in the repo root).
- All tunable numbers go in `shared/src/config.ts`. Don't hard-code costs or timings anywhere else.
- Sprites are 12×12 character grids in `client/src/sprites.ts`, rendered with `pixelArt: true`. Draw with integer scales and hard-edged rectangles. Don't use anti-aliased shapes or rounded corners. Text uses the "Press Start 2P" font.

## Checking your work

```bash
npm run typecheck
npm run dev        # then open http://localhost:5173/?practice for an instant bot match
```

For multiplayer changes, test with two tabs (Create room in one tab, open the link in the other).

## Planned (don't block on these, but don't paint us into a corner)

- Logins and accounts, player profiles, match history and ranking
- Matchmaking queue next to private rooms
- More crops and items, sound, animations, real spritesheets
- Rematch and spectators
