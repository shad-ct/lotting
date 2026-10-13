# Lotto — offline-draw game tracker (110 players + 1 admin)

A web app that tracks a physical lotto game. The admin draws numbers offline and
types each one into the app (or uses random draw). The app marks drawn numbers
live on a public board, on every player's card, and on the admin dashboard with
rankings, close-to-win, hot numbers and winner confirmation.

Spec pack (source of truth): `docs/00_OVERVIEW.md` … `docs/05_TESTING_AND_ACCEPTANCE.md`.
Build progress + deviations: `docs/PROGRESS.md`. Manual test script: `docs/MANUAL_TEST.md`.
Edge cases: `docs/EDGE_CASES.md`. API: `docs/openapi.yaml`. Sockets: `docs/events.md`.

## Stack

Monorepo (npm workspaces): `shared` (constants, types, zod schemas, progress +
win-rule engine), `server` (Express + Socket.IO + Mongoose, TypeScript),
`web` (React 18 + Vite + TanStack Query + Tailwind). Single-instance Node
(in-memory lockout, idempotency keys and PIN window — see below).

## Setup

```bash
cp .env.example .env        # then set real secrets (never commit .env)
npm install
npm run dev                 # server :3001 + web :5173
```

Health: `GET http://localhost:3001/api/v1/health`. Web: `http://localhost:5173`.
Seeded admin comes from `ADMIN_USERNAME` / `ADMIN_PASSWORD` at first boot.

### Env vars (all in `.env.example`)

| Var | Purpose |
|---|---|
| `PORT` | Server port (default 3001) |
| `MONGO_URI` | Mongo connection string |
| `JWT_SECRET` | JWT signing secret (12h tokens) |
| `JWT_EXPIRES_IN` | Token lifetime (fixed `12h` per spec; override only for tests) |
| `CARD_HMAC_SECRET` | Card verify-code HMAC secret |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Seeded single admin |
| `WEB_ORIGIN` | CORS origin of the web app |
| `APP_URL` | URL printed on card images + WhatsApp text |
| `DEFAULT_COUNTRY_CODE` | Prefix for bare 10-digit phones (default 91) |
| `DISABLE_RATE_LIMITS` | `1` only for E2E (rate limits are covered by API tests) |

## Running an event (step by step)

1. **Setup → Create game** (name; defaults 110 players / numbers 1–110 / 16 per card).
2. **Add players**: import `name,phone` CSV (or JSON), one-by-one, or N placeholders.
3. **Generate PINs**: one-time reveal — **copy/download now**, PINs can't be shown
   again (15-minute window for CSV/print; afterwards use per-player Reset PIN).
4. **Generate cards**: check stats (each number on exactly 16 cards). Regenerate
   freely until lock.
5. **Lock cards** (irreversible) → **Distribution**: download PNGs/ZIP, send each
   player their PNG + login text via WhatsApp (`wa.me` carries text only — attach
   the PNG manually, or Web Share on mobile), tick sent flags.
6. **Start game** → **Draw console**: type numbers (confirm dialog on) or random
   draw; undo fixes mistakes (audit-logged). Player pages, public board and the
   dashboard update live.
7. A full card triggers the **winner modal** (admin-only): Verify card, then
   Confirm (public banner appears, game finishes) or Reject. Ties show co-winners.
8. **Log** page: draw log (undone struck through), audit, standings CSV export.
9. Practice runs: **Reset game** (type `RESET`) clears draws/wins, keeps
   players/cards/PINs.

## Tests

```bash
npm test          # unit + API + socket tests (shared 20, server 55, web 1)
npm run test:e2e  # Playwright: full 110-player game + tie/undo/refresh
```

E2E needs Mongo on `localhost:27017` (uses DB `lotto_e2e`, leaves data — drop it
afterwards) and builds `server/dist` first (`npm run build --workspace=@lotto/server`).

## Docker

```bash
docker compose up --build -d   # mongo + server (:3001) + web (:80→5173)
curl http://localhost:3001/api/v1/health
docker compose down
```

Mongo is a plain single node (no replica set): card generation validates fully in
memory then does one `insertMany`, cleaning up with `deleteMany` on failure.

## Local-network mode (no internet)

1. Put the laptop + player phones on the same Wi-Fi/hotspot.
2. Server binds `0.0.0.0` already. Find the laptop LAN IP (`hostname -I`).
3. Set `WEB_ORIGIN` and `APP_URL` to `http://<LAN-IP>:5173` (and Vite port 5173
   reachable). Card images/QR text will carry that URL.
4. Players open `http://<LAN-IP>:5173` on their phones. Don't let the laptop sleep.

## Backup

```bash
npm run backup            # dumps all collections to backups/lotto-backup-<ts>.json
npm run backup ./my-dir   # custom directory
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `NUMBER_ALREADY_DRAWN` | Number already drawn — check the log; undo only removes the latest |
| `GAME_NOT_LIVE` | Setup → Start game first |
| `CARDS_LOCKED` | Cards locked — regeneration blocked by design |
| `PINS_NO_LONGER_AVAILABLE` (410) | 15-min window expired — Reset PIN per player |
| `WINNER_CONFIRMED_REOPEN_FIRST` | Reopen the game before undoing a confirmed win |
| Board shows “Reconnecting…” | Server down or network drop — it resyncs automatically |
| Malayalam name as boxes | Rebuild `server/assets/fonts` (Noto Sans + Noto Sans Malayalam are bundled) |
| `INVALID_CREDENTIALS` for everyone | Wrong `ADMIN_*` or old PIN — Reset PIN; player logins are scoped to the current game |

## Notes for operators

- Never use `Math.random` for draws/PINs/seeds — the server uses `crypto` everywhere.
- Only the draw log is stored; marks, ranks and winners are computed from it.
- Plain PINs exist only in the one-time reveal responses + 15-min memory window.
- Public endpoints never expose cards, phones, login IDs or unconfirmed winners.
