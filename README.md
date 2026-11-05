# GoGrow!

> "Let's go 1v1 in GoGrow! I'm gonna beat you up."

GoGrow is a fast-paced **1v1 competitive game** with a **3-minute timer**, played in the browser. Two rival villages sit on floating islands, facing each other across a strait. Each player runs a little worker who gathers resources and hauls them home for gold, then spends it on upgrades, sabotage and an **army**. Build a **bridge**, march your soldiers across and plunder the enemy castle. **Whoever has the most gold when the timer runs out wins.** It's built for settling arguments: send a friend a link and settle it on the islands.

## The concept

The screen is split in two. **Your island is on the left and your rival's is on the right**, and both are always visible. You can see what your rival is doing, where their worker is running and which resources they're about to cash in.

Each island has a **castle**, which is both your bank and your shop, plus **trees**, **gold rocks** and wandering **sheep**:

| Source    | Tool    | Swings | Load | Worth | Comes back after |
| --------- | ------- | ------ | ---- | ----- | ---------------- |
| Tree      | Axe     | 3      | Wood | 10    | 12s              |
| Gold rock | Pickaxe | 6      | Gold | 40    | 20s              |
| Sheep     | Knife   | 2      | Meat | 22    | 10s              |

1. **Gather:** walk up to a source and hit **Space** to swing. Every press is one swing, with a short cooldown, so fast and accurate hands win. Sheep run away from you, so you have to corner them.
2. **Haul:** your worker carries **one load at a time**. Run it back to your castle gate to bank the gold.
3. **Spend:** at the castle, invest in upgrades, sabotage or soldiers. Every coin you spend lowers your score, so each purchase is a bet that it'll earn or cost more than it's worth.
4. **Fight:** build the bridge, press **Q** to charge, and your army crosses to fight theirs. It knocks over their worker and attacks their castle. **Every hit on the castle steals gold** from them and gives it to you.

### Army & bridge

| Soldier | Cost | Role                            | Strong against |
| ------- | ---- | ------------------------------- | -------------- |
| Warrior | 60   | Tough melee (sword & shield)    | Lancers        |
| Archer  | 70   | Ranged, fragile                 | Warriors       |
| Lancer  | 90   | Fast, hard-hitting charger      | Archers, monks |
| Monk    | 80   | Heals nearby allies, never fights | —            |

- Train soldiers at your castle gate with `Z X C V`, without opening the shop. Up to 8 at a time.
- `Q` switches your army between **Charge** and **Defend**:
  - Charging soldiers cross the bridge and attack the enemy castle. If there's no bridge yet, they wait at the edge of your island.
  - Defending soldiers guard your castle.
- **The bridge is shared.** Either player can build it for 150 gold, and once it's up both armies can use it. Building it is a declaration of war.
- **A powder keg on the bridge blows it up**, and any soldiers on it fall into the water. Use it to cut off an invasion, or to trap their army on your side.
- The archer tower shoots any enemy soldier or raider in range.
- A worker knocked over by a soldier gets a short grace period before it can be knocked over again, so it can't be stunned forever.

### The shop

| Item          | Type    | Cost | Effect                                                                                     |
| ------------- | ------- | ---- | ------------------------------------------------------------------------------------------ |
| Sharp Axe     | upgrade | 50   | Trees fall in 2 swings instead of 3                                                        |
| Steel Pickaxe | upgrade | 80   | Gold breaks in 3 swings instead of 6                                                       |
| Swift Boots   | upgrade | 70   | Run 25% faster                                                                             |
| Powder Keg    | attack  | 60   | Pick a spot on their island. After a 1.6s fuse it explodes: stuns, makes them drop their load, wrecks trees, gold and sheep |
| Raider        | attack  | 90   | A warrior lands on their island and hunts their worker for 12s. Each hit stuns and drops their load |
| Torch         | attack  | 70   | Sets their castle on fire for 7s: no deliveries, no shopping                               |
| Archer Tower  | build   | 60   | Guards your island for 45s and shoots raiders and invading soldiers                        |
| Bridge        | build   | 150  | Connects the islands so armies can cross, in both directions                               |

All numbers live in [`shared/src/config.ts`](shared/src/config.ts).

### Why it's a skill game

Nothing about the outcome is random. You win by:

- **Hands:** how quickly you move, how fast you mash Space and how cleanly you corner a sheep.
- **Routing:** which source to hit next, and whether it's worth a long walk for gold or a short one for wood.
- **Reading your rival:** if they're hauling gold, a keg on their path makes them drop it. If they're about to deliver, torch the castle. If you see them shopping with 90 gold, a raider may be coming, so get a tower up first.
- **Army timing and counters:** charge when they're out of position, answer warriors with archers and archers with lancers, and keep a monk behind the line. Blow the bridge when a charge goes wrong.
- **Dodging:** keg blasts are telegraphed with a red circle and a countdown, and raiders can be outrun. Keep your eyes on your own island.

## How to play

1. Type your **nickname** on the start screen.
2. Click **Create room**. The invite link is copied for you, so send it to the friend you want to fight. Or click **Practice vs bot**.
3. Your friend opens the link, picks a nickname and clicks **Join**. The match starts immediately.

| Action                 | Key                                             |
| ---------------------- | ----------------------------------------------- |
| Move                   | `WASD` / arrow keys                             |
| Chop / mine / catch    | `Space` (one swing per press)                   |
| Deliver                | Walk into your castle gate (automatic)          |
| Shop                   | `E` at the castle gate, then click or press the key shown on the card |
| Train soldiers         | `Z` warrior, `X` archer, `C` lancer, `V` monk (at the gate) |
| Army order             | `Q` toggles Charge / Defend                     |
| Aim a powder keg       | Click a spot on their island or the bridge (`Esc` cancels) |

## Tech

- **Client:** [Phaser 4](https://phaser.io) + TypeScript, bundled with Vite. The game renders at a fixed 1600×900 resolution that scales to fit any window. Text uses the Lilita One font.
- **Server:** Node.js 24 + [`ws`](https://github.com/websockets/ws), written in TypeScript. Node runs the TypeScript directly, so the server has no build step.
- **Shared:** game config, island layout, walking/collision and targeting rules, and the message protocol. Client and server both import it.

### Netcode

- **Your own worker moves on your screen immediately.** The client streams your position to the server 20 times a second. The server checks speed and bounds and snaps you back only if something is off.
- **Everything else is interpolated:** the rival's worker, sheep and raiders are drawn about 100ms in the past and blended between server snapshots, so they glide instead of jumping.
- **The server decides the rest.** It owns gold, swings, ranges, loads, sheep AI, raiders, kegs, fire, towers, the bridge, all soldiers and the timer. It sends a full snapshot to both players 20 times a second, plus one-off events for effects.
- Soldiers live in shared **arena coordinates** (island, strait, island). The second player's client mirrors them, so everyone sees their own island on the left.

```
gogrow/
├── client/src/
│   ├── scenes/       BootScene (assets, animations, 9-slice UI), MenuScene, GameScene
│   ├── Island.ts     one floating island: terrain, castle, trees, gold, sheep, kegs, fire, tower, raider
│   ├── Unit.ts       worker/warrior sprite: animations, shadow, name tag, prompt
│   ├── ShopMenu.ts   castle shop popup
│   ├── ui.ts         text, panels, ribbons, buttons, effects helpers
│   └── net.ts        WebSocket client
├── server/src/       rooms (main.ts), match simulation (match.ts), soldiers/bridge/towers (army.ts), bot (bot.ts)
├── shared/src/       config.ts, rules.ts, protocol.ts
└── scripts/          import-assets.sh
```

## Running locally

Requires Node.js 24+ and the free [Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) asset pack by Pixel Frog (see below).

```bash
npm install
./scripts/import-assets.sh "/path/to/Tiny Swords (Free Pack)"
npm run dev          # server on :8080, client on http://localhost:5173
```

Open two browser windows: create a room in one, then open the invite link in the other. Or use **Practice vs bot**. In dev mode, `http://localhost:5173/?practice` skips the menu and starts a bot match.

Playtest knobs for the server:

```bash
START_GOLD=500 MATCH_MS=30000 npm run dev:server   # rich start, 30s matches
```

Other scripts:

```bash
npm run typecheck    # all workspaces
npm run build        # production client build -> client/dist
npm run format       # prettier
```

The client connects to `ws://<current host>:8080` by default. To use a different server, set `VITE_SERVER_URL` (see `client/.env.example`).

### Art assets

All art comes from **[Tiny Swords (Free Pack)](https://pixelfrog-assets.itch.io/tiny-swords) by Pixel Frog**. The pack's license doesn't allow redistributing the files, so `client/public/assets/` is git-ignored. `scripts/import-assets.sh` copies and renames exactly the files the game needs.

### Deploying the server

```bash
docker build -f server/Dockerfile -t gogrow-server .
docker run -p 8080:8080 gogrow-server
```

`GET /health` returns `ok`.

## Roadmap

- Accounts and logins, player profiles, match history, ranking
- Matchmaking queue alongside private rooms
- Rematch button, spectators
- Unit abilities and hero units, siege weapons, more maps
- Sound and music
