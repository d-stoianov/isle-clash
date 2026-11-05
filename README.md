# GoGrow!

> "Let's go 1v1 in GoGrow! I'm gonna beat you up."

GoGrow is a fast-paced **1v1 competitive farming game** with a **3-minute timer**, played in the browser. It's built for settling arguments about who's more skilled: send a friend a link and settle it on the farm.

## The concept

The game is played on a single screen split into two halves. Each player owns one half, which is their farm field. Each field has a **shop** and a limited number of **plots** where seeds can be planted. Each player controls a little farmer who walks around their field.

Each player starts with some money and spends it in the shop on seeds. Planted crops grow in real time, and you sell ripe crops for profit. The shop also sells a **booster** that instantly grows your crops. **Whoever has more money when the timer runs out wins.**

To make the game more skill-based and competitive, the shop also sells **debuffs** that mess with the other player:

- call a **tornado** to destroy all of the opponent's crops
- **strike** one of their crops with lightning
- **slow down** their crop growth
- **freeze** them so they can't move or act

Crops come in tiers from **fast-growing (5 seconds)** to **really slow-growing (25 seconds)**. A crop that grows longer sells for more, but it also stays on the field longer, so your opponent has more time to destroy that expensive crop. **Both players can always see each other's field**, including where the other farmer is walking. Use that to decide which plots to hit and when to throw a debuff.

### Why it's a skill game

Nothing about the outcome is random. You win by:

- **Speed:** how fast you move your farmer, how quickly you press your buttons, how few steps you waste between the shop and your plots.
- **Reading your opponent:** you see their field, their seeds and their farmer. Hit their potato just before it ripens, or put up a Scarecrow when they're walking to the shop with money.
- **Managing risk:** play it safe with cheap, fast crops, or invest in slow, expensive ones and defend them. Freezing an opponent while their crops are ripe can make them wither.

## How to play

1. Type your **nickname** on the start screen.
2. Click **Create room** and send the invite link to the friend you want to fight. Or click **Practice vs bot**.
3. Your friend opens the link, picks a nickname and clicks **Join**. The match starts right away.
4. Walk to the **shop door** and press **E** to buy seeds and items.
5. Walk onto a **plot** and press **Space** to plant. When the crop is ripe (it glows yellow), stand on it and press **Space** again to sell it.
6. When the timer hits 0:00, the richest farmer wins.

### Controls

| Action                    | Key                                        |
| ------------------------- | ------------------------------------------ |
| Move                      | `WASD` / arrow keys                        |
| Plant / harvest           | `Space` (or click the plot you stand on)   |
| Open / close shop         | `E` at the shop door, `Esc` to close       |
| Pick which seed to plant  | `1` – `4` (or click the seed bar)          |
| Buy in the shop           | Click, or `1`–`4` seeds and `5`–`0` items  |
| Aim Lightning             | Click an enemy crop (`Esc` cancels)        |

### Crops

| Crop       | Seed cost | Sells for | Grow time |
| ---------- | --------- | --------- | --------- |
| Leek       | $10       | $22       | 5s        |
| Strawberry | $25       | $60       | 11s       |
| Onion      | $45       | $115      | 17s       |
| Potato     | $80       | $220      | 25s       |

A ripe crop withers if you don't sell it within 12 seconds.

### Shop items

| Item       | Type    | Cost | Effect                                       |
| ---------- | ------- | ---- | -------------------------------------------- |
| Fertilizer | booster | $70  | Instantly ripens all your crops              |
| Scarecrow  | buff    | $35  | Blocks the next debuff used on you (30s)     |
| Lightning  | debuff  | $35  | Destroys one enemy crop that you pick        |
| Drought    | debuff  | $45  | Enemy crops grow 60% slower for 15s          |
| Freeze     | debuff  | $50  | Enemy can't move or act for 3s               |
| Tornado    | debuff  | $200 | Destroys **all** enemy crops                 |

Every item has a cooldown. All balance numbers and the farm layout are in [`shared/src/config.ts`](shared/src/config.ts).

## Tech

- **Client:** [Phaser 4](https://phaser.io) + TypeScript, bundled with Vite. The game uses 16×16 pixel art drawn at 3× and a fixed 1280×720 resolution that scales to fit any window.
- **Server:** Node.js 24 + [`ws`](https://github.com/websockets/ws), written in TypeScript. Node runs the TypeScript directly, so the server has no build step.
- **Shared:** game config, farm layout and the message protocol, used by both client and server.

### Netcode

It's a fast game, so it has to feel instant and look smooth:

- **Your own farmer moves on your screen immediately.** The client streams your position to the server 20 times a second. The server checks the speed and bounds and snaps you back only if you cheat or drift too far.
- **Your opponent's farmer is interpolated.** It's drawn about 100ms in the past and blended between server snapshots, so it glides smoothly instead of jumping between updates.
- **The server decides everything else.** It owns money, seeds, crop growth, range checks (you must stand at the shop to buy and on a plot to plant or harvest), items and the timer. It sends a snapshot of the game to both players 20 times a second.

```
gogrow/
├── client/
│   ├── public/assets/   pixel-art sprites (third-party, not committed; see below)
│   └── src/
│       ├── scenes/      BootScene (assets, animations), MenuScene, GameScene
│       ├── Farm.ts      draws one player's field (shop, plots, crops, decor)
│       ├── Avatar.ts    farmer sprite with idle/walk animations + nickname
│       ├── ShopMenu.ts  shop popup
│       └── net.ts       WebSocket client
├── server/src/          rooms (main.ts), match simulation (match.ts), practice bot
└── shared/src/          config (crops, items, layout, timings) + protocol types
```

## Running locally

Requires Node.js 24+.

```bash
npm install
npm run dev          # server on :8080, client on http://localhost:5173
```

Open two browser tabs: create a room in one, then open the invite link in the other. Or use **Practice vs bot**. In dev mode, `http://localhost:5173/?practice` skips the menu and starts a bot match.

```bash
npm run typecheck    # all workspaces
npm run build        # production client build -> client/dist
npm run format       # prettier
```

The client connects to `ws://<current host>:8080` by default. To use a different server, set `VITE_SERVER_URL` (see `client/.env.example`).

### Art assets

The character, crops, house, fences, trees, rocks and chicken come from **"Farm RPG FREE 16x16 – Tiny Asset Pack"** by [Emanuelle](https://emanuelledev.itch.io/farm-rpg). The pack's terms don't allow redistributing the files, so they're git-ignored. Download the pack yourself and copy these files into `client/public/assets/`:

| File in the pack                  | Save as          |
| --------------------------------- | ---------------- |
| `Character/Idle.png`              | `char-idle.png`  |
| `Character/Walk.png`              | `char-walk.png`  |
| `Objects/Spring Crops.png`        | `crops.png`      |
| `Objects/House.png`               | `house.png`      |
| `Objects/Fence's copiar.png`      | `fences.png`     |
| `Objects/Maple Tree.png`          | `tree.png`       |
| `Objects/Road copiar.png`         | `rocks.png`      |
| `Farm Animals/Chicken Red.png`    | `chicken.png`    |

The item icons (lightning, freeze...) and soil tiles are generated in code (`client/src/sprites.ts`).

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
- More crops, items and maps (pests, rain, market price swings...)
- Sound, more animations and effects
