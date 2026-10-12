# 🃏 Poker Club — Texas Hold'em

A web-based **Texas Hold'em** multiplayer game. Play chips only (no real money), standard
no-limit rules, with a rotating dealer / small blind / big blind and a host who sets the
starting stack and blinds so every player begins equal.

- **Frontend:** React + Vite + TypeScript → deploy to **Netlify**
- **Backend:** Node.js + Socket.IO (authoritative game server) → deploy to a free Node host
  (**Render**, Railway, Fly, or Koyeb)

---

## Features

- **Room code + display name** — no accounts. A host creates a table, shares a 6-character
  code, and friends join instantly.
- **Host controls the game** — sets starting chips, small blind, and big blind; starts the
  hand and advances to the next one.
- **Rotating blinds** — the dealer button moves each hand; small blind / big blind follow.
- **Full no-limit rules** — preflop / flop / turn / river, fold / check / call / bet / raise /
  all-in, **side pots**, split pots with odd chips, and a 7-card hand evaluator (best 5 of 7).
- **Single session, no rebuy** — when your chips hit zero you're out; the game ends when fewer
  than two players have chips left.
- **Up to 9 players per table** — each host runs their own table, so any number of people can
  play by opening more tables.
- **45-second turn timer** — stalled players auto-check (when free) or auto-fold.
- Simple, clean, mobile-friendly UI.

---

## Project structure

```
Poker/
├─ server/                 # Node.js + Socket.IO game server
│  ├─ src/
│  │  ├─ app.js            # Socket.IO rooms + host/join/start/action handlers
│  │  ├─ index.js          # entry point (starts the HTTP server)
│  │  ├─ table.js          # game engine: blinds, betting, side pots, showdown
│  │  ├─ handEval.js       # 7-card best-5 hand evaluator
│  │  └─ deck.js           # deck + shuffle
│  ├─ scripts/
│  │  ├─ verify.js         # in-process engine checks (no child spawns needed)
│  │  └─ e2e.js            # full Socket.IO end-to-end check
│  ├─ test/                # node:test suites (run on CI / standard hosts)
│  ├─ render.yaml          # Render blueprint (one-click deploy)
│  └─ package.json
└─ client/                 # React + Vite + TypeScript frontend
   ├─ src/
   │  ├─ App.tsx
   │  ├─ components/       # Lobby, Table, CardView
   │  └─ ...
   ├─ netlify.toml         # Netlify build + SPA redirect
   ├─ .env.example         # VITE_SERVER_URL template
   └─ package.json
```

---

## Run locally

You need Node 18+ (Node 20/22 recommended).

**1. Start the server**

```bash
cd server
npm install
npm start          # listens on http://localhost:3001
```

**2. Start the client**

```bash
cd client
npm install
npm run dev        # opens http://localhost:5173
```

Open http://localhost:5173 in two browser tabs/windows. In one, **Host a game** (set your
starting chips and blinds). In the other, **Join a game** with the room code shown at the top
of the table. The host presses **Start game**.

> By default the client talks to `http://localhost:3001`. To point it elsewhere, create
> `client/.env` with `VITE_SERVER_URL=<your-server-url>`.

---

## Deploy

### 1. Deploy the server (free Node host)

Pick one:

**Render (easiest, one-click)** — push this repo to GitHub, then in Render choose
**New → Blueprint** and select `server/render.yaml`. It deploys a free web service that runs
`node src/index.js` and auto-detects the `PORT`.

**Railway / Fly / Koyeb (manual)** — deploy the `server/` folder as a Node app:

- Build command: `npm install`
- Start command: `node src/index.js`
- The app reads `PORT` from the environment (falls back to `3001`).

Copy the resulting server URL (e.g. `https://poker-server.onrender.com`). The `/` path returns
a health-check response, and WebSockets are supported on all of these platforms.

### 2. Deploy the client to Netlify

1. Push this repo to GitHub (or drag-and-drop the `client/` folder in Netlify).
2. In Netlify, create a new site pointing at the **`client/`** directory
   (base directory = `client`). `netlify.toml` already sets the build command
   (`npm run build`) and publish dir (`dist`).
3. Add an environment variable:
   - **Name:** `VITE_SERVER_URL`
   - **Value:** your server URL from step 1 (no trailing slash), e.g.
     `https://poker-server.onrender.com`
4. Deploy. Share the Netlify URL with your friends.

> `VITE_SERVER_URL` is baked in at build time, so change it and re-deploy if the server URL
> changes.

---

## How a game works

1. The **host** creates a table: picks starting chips, small blind, and big blind.
2. Friends **join** with the room code and a display name.
3. The host presses **Start game** (needs at least 2 players).
4. Each hand: the **dealer button** moves one seat clockwise; the next two players post the
   **small blind** and **big blind**. Deal, betting rounds (preflop → flop → turn → river),
   then showdown. Best 5-card hand wins; all-ins create side pots automatically.
5. When a hand ends, the host presses **Next hand**. Players who bust (0 chips) are out.
6. When fewer than two players have chips, the game ends with a final ranking.

---

## Notes & known simplifications

- **"Any number of people"** is implemented as *up to 9 seats per table, and each host runs
  their own table* (a "table full" message appears at 9). A public lobby with automatic
  seating across tables is a natural next step if you want it.
- A **page refresh returns to the lobby** — re-enter the room code and the same name to reclaim
  your seat.
- Turn timer is fixed at **45 seconds** (edit `turnSeconds` in `server/src/app.js` to change).
- Minor rules simplification: a short all-in that isn't a full raise still reopens betting
  (in strict casino rules it would only reopen the call obligation). This is standard enough
  for a casual home game.

---

## Tests

```bash
cd server
npm run verify    # in-process checks: evaluator + engine (works anywhere)
npm test          # node:test suites (standard environments / CI)
node scripts/e2e.js   # create → join → start → play a full hand over Socket.IO
```
