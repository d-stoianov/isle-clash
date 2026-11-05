# GoGrow!

A fast-paced 1v1 farming duel for the browser. You get **2 minutes**, a field, a shop and a rival. Whoever has the most money when the timer runs out wins.

You play in real time against another person. You win by being faster and making better decisions than they do, not by luck or grinding.

## The concept

The screen is split in half. Your farm is on the left and your opponent's farm is on the right. **Both players can see both farms at all times**, so you always know what your rival is growing and which crop is worth destroying.

- Each player starts with **$100** and a **4×3 grid** of tiles.
- **Buy seeds** and plant them on empty tiles. Crops grow in real time.
- **Click a ripe crop to sell it.** If you leave a ripe crop alone for too long, it withers and you get nothing.
- **Long-growing crops pay much better**, but they also make juicy targets for your opponent.
- **Buy buffs** to speed yourself up and **debuffs** to wreck your opponent.

### Crops

| Crop    | Cost | Sells for | Grow time |
| ------- | ---- | --------- | --------- |
| Radish  | $10  | $20       | 4s        |
| Carrot  | $25  | $60       | 9s        |
| Corn    | $45  | $110      | 16s       |
| Pumpkin | $80  | $210      | 26s       |
| Melon   | $150 | $420      | 40s       |

### Shop items

| Item       | Type   | Cost | Effect                                       |
| ---------- | ------ | ---- | -------------------------------------------- |
| Fertilizer | buff   | $60  | Instantly ripens all your crops              |
| Scarecrow  | buff   | $35  | Blocks the next debuff used on you (30s)     |
| Lightning  | debuff | $30  | Destroys one enemy crop that you pick        |
| Drought    | debuff | $45  | Enemy crops grow 60% slower for 15s          |
| Freeze     | debuff | $50  | Enemy can't do anything for 4s               |
| Tornado    | debuff | $180 | Destroys **all** enemy crops                 |

Every item has a cooldown. All balance numbers are in [`shared/src/config.ts`](shared/src/config.ts).

### Why it's a skill game

- **Speed matters.** You plant, sell and react by clicking or using hotkeys, so faster hands earn more money.
- **Reading your opponent matters.** You can see their field, so you can time a Lightning on their Melon just before it ripens, or put up a Scarecrow when they look ready to strike.
- **Managing risk matters.** You can play it safe with cheap, fast crops, or invest big and defend it. Freezing your opponent while their crops are ripe makes them wither.

### Controls

| Action               | Mouse                           | Keyboard        |
| -------------------- | ------------------------------- | --------------- |
| Pick a seed          | Click a seed card               | `1` – `5`       |
| Plant                | Click an empty tile             |                 |
| Sell a ripe crop     | Click it                        |                 |
| Use a buff/debuff    | Click the item card             | `Q W E R T Y`   |
| Aim Lightning        | Click an enemy crop             |                 |
| Cancel aiming        | Right-click                     | `Esc`           |

## Playing with a friend

1. Click **Create room**.
2. Send the invite link (`…?room=ABC12`) to a friend.
3. The match starts as soon as your friend opens the link and clicks **Join**.

Use **Practice vs bot** to play alone.

## Tech

- **Client:** [Phaser 4](https://phaser.io) + TypeScript, bundled with Vite. The game draws pixel art at a fixed 1280×720 resolution and scales it to fit any window.
- **Server:** Node.js 24 + [`ws`](https://github.com/websockets/ws), written in TypeScript. Node runs the TypeScript directly, so the server has no build step.
- **Shared:** game config and the message protocol, used by both client and server.

The server is **authoritative**. Clients only send intents such as "plant here" or "use this item". The server runs the simulation at 10 ticks/s and sends the state to both players.

```
gogrow/
├── client/   Phaser game (scenes, field rendering, pixel sprites, WebSocket client)
├── server/   WebSocket server: rooms, match simulation, bot
└── shared/   Config (crops, items, timings) + protocol types
```

## Running locally

Requires Node.js 24+.

```bash
npm install
npm run dev          # server on :8080, client on http://localhost:5173
```

Open two browser tabs to play against yourself, or use **Practice vs bot**. In dev mode, `http://localhost:5173/?practice` skips the menu and starts a bot match.

Other scripts:

```bash
npm run typecheck    # all workspaces
npm run build        # production client build -> client/dist
npm run format       # prettier
```

The client connects to `ws://<current host>:8080` by default. To use a different server, set `VITE_SERVER_URL` (see `client/.env.example`).

### Deploying the server

```bash
docker build -f server/Dockerfile -t gogrow-server .
docker run -p 8080:8080 gogrow-server
```

`GET /health` returns `ok`.

## Roadmap

- Accounts and logins, player profiles, match history
- Ranked matchmaking alongside private rooms
- More crops and items (pests, rain, market price swings...)
- Real pixel-art spritesheets, animations and sound
- Rematch button and spectators
