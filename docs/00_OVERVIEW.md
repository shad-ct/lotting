# 00 — Project Overview: "Lotto" (offline-draw, online-tracking game)

> Read this file FIRST, before any other file. Every other file assumes you know this one.

## 1. What this is (one paragraph)

A web app that tracks a physical (offline) lotto game. 110 players each hold a unique card of 16 numbers picked from 1–110. An admin draws numbers offline (physical draw) and types each one into the app, or presses a "random draw" button. The app marks drawn numbers everywhere in real time: on a public board anyone can watch, and on every player's card. The admin has a live dashboard showing every player's progress, who is closest to winning, and who has won.

## 2. Roles

| Role | Count | Can do |
|---|---|---|
| **Admin** | 1 account (seeded from env) | Create/import players, generate cards, enter or randomly draw numbers, undo the last draw, see every player's status, export card images and credentials, reset PINs, start/finish the game |
| **Player** | 110 | Log in with Login ID + PIN, see ONLY their own card with drawn numbers marked live |
| **Public viewer** | anyone with the link | See the master board (1–110, drawn numbers highlighted), last drawn number, recent draws, winner banner. No login. No access to any card contents |

## 3. Decisions already made (do NOT re-ask)

1. **Card layout:** 4×4 grid, 16 cells, each a unique number from 1–110. Position in the grid is random but fixed forever once generated.
2. **Win condition (default):** FULL CARD — all 16 numbers drawn. The win-rule system must still be **config-driven** (see `01_DATA_AND_CARD_GENERATION.md` §6) so row/column/corner prizes can be switched on later without a rewrite.
3. **Stack:** MERN web first (MongoDB, Express, React, Node), TypeScript everywhere. A Flutter app comes later, so the API must be clean, versioned and documented (see `06_FLUTTER_LATER.md`).
4. **Card delivery:** BOTH ways: (a) the admin sends each player a PNG image of their card on WhatsApp, and (b) each player also gets a Login ID + PIN to view the live card in the app.
5. **Draw is offline.** The app never decides the physical draw. It records what the admin enters. The "random draw" button is an optional convenience that picks from the numbers not yet drawn.

## 4. Game numbers (derived facts the agent should rely on)

- Players = 110, numbers = 110, card size = 16.
- Total card slots = 110 × 16 = 1760 = 110 numbers × 16 occurrences each. So a **perfectly balanced** deal is possible: every number appears on exactly 16 cards. This is the default generation mode (fairness: no number is "luckier" than another). Details in file 01.
- Simulation (balanced cards, 1500 random games): the first full card appears after a **median of 83 draws** (range 56–95 out of 110), and about **9% of games end in a tie** (two or more players complete on the same draw). Consequences the agent must handle:
  - A full-card-only game runs most of the draw. The UI must stay pleasant over ~80+ draws.
  - **Ties are real.** Winner logic must support co-winners on the same draw. Never assume one winner.

## 5. Non-goals (do NOT build)

- Payments, wallets, real-money handling.
- Player self-registration. Admin creates all players.
- Auto-sending WhatsApp messages via the WhatsApp Business API. (See `03_CARD_IMAGES_AND_SHARING.md` for what IS in scope.)
- Multiple simultaneous games. One active game at a time (but keep a `gameId` on records so this can grow).
- Multiple admin accounts. One admin.

## 6. Core principles (the "why" behind the design — follow these when a case is not covered)

1. **The server is the single source of truth.** Clients never decide what is drawn or who won.
2. **Derive, don't duplicate.** The only game state that is stored is the ordered **draw log**. Marked numbers, mark counts, rankings and winners are all *computed* from `card ∩ drawn`. This makes "undo last draw" trivial and removes a whole class of out-of-sync bugs. With only 110 players this is instantly cheap.
3. **Cards are immutable after the game starts.** Once the admin locks the game, no card, player-to-card assignment, or card number can change.
4. **Privacy of cards.** A player can never read another player's card. The public board never exposes card contents. Admin-only endpoints are enforced server-side, not just hidden in the UI.
5. **Idempotent and safe draws.** Typing the same number twice, double-clicking, or two browser tabs must never produce a duplicate draw.
6. **Real-time with a safety net.** Push updates by WebSocket, but every client can also fetch a full snapshot, and must do so on reconnect.
7. **Admin mistakes happen** (it is a human typing numbers at a live event). Undo of the most recent draw is a first-class feature with an audit trail.

## 7. Suggested repo layout (monorepo, npm workspaces)

```
lotto/
├─ package.json            (workspaces: server, web, shared)
├─ docker-compose.yml      (mongo + server + web)
├─ .env.example
├─ shared/                 (TypeScript types, zod schemas, constants: N=110, K=16)
├─ server/
│  ├─ src/
│  │  ├─ config/  models/  services/  routes/  middleware/  sockets/  utils/
│  │  └─ index.ts
│  └─ test/
├─ web/                    (React + Vite + TS)
│  └─ src/ (pages/, components/, hooks/, api/, store/)
└─ docs/                   (these .md files + openapi.yaml)
```

## 8. Definition of done (whole project)

See `05_TESTING_AND_ACCEPTANCE.md` for the full checklist. In short: with 110 seeded players, the admin can generate and lock cards, export 110 PNGs and a credentials sheet, run a full 110-number game via typed and random draws, undo a mistaken draw, and see all three views (admin, public, player) update live with correct marks and correct winner(s), including a tie.

## 9. How the agent should work

- Work in the phases listed in `PROMPTS.md`. Finish and verify one phase before starting the next.
- Before writing code in each phase, state your plan in a short list and name any assumption you are making. If something in these files is ambiguous or contradicts itself, ask rather than guess.
- Prefer small, well-named modules and complete files over fragments.
- Every phase ends with: how to run it, how to test it, and what is NOT done yet.
