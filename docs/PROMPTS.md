# PROMPTS.md — What to send to the AI agent, and which file for which task

Put all the `.md` files in the project's `docs/` folder (or attach them), then send the prompts below **one phase at a time**. Do not move to the next phase until the previous one runs and passes its acceptance list.

## Map: task → file → prompt

| Phase | Task | Files the agent must read | Prompt |
|---|---|---|---|
| 0 | Kickoff, plan, project scaffold | `00_OVERVIEW.md` (+ skim all) | Prompt 0 |
| 1 | Data models, card generator, progress/ranking logic | `00`, `01` | Prompt 1 |
| 2 | Backend API, auth, draw/undo, win flow, sockets | `00`, `01`, `02` | Prompt 2 |
| 3 | Card PNGs, ZIP, credentials export, WhatsApp flow (server side) | `00`, `01`, `03` (+ `02` for routes) | Prompt 3 |
| 4 | Frontend: public board, player card, admin console, distribution UI | `00`, `04` (+ `02`, `03`) | Prompt 4 |
| 5 | Tests, end-to-end rehearsal, README, Docker, sign-off | `05` (+ all) | Prompt 5 |
| 6 | Flutter app (only AFTER sign-off of phase 5) | `06` (+ `docs/openapi.yaml`, `docs/events.md`) | Prompt 6 |

---

## Prompt 0 — Kickoff (send this first)

```
You are a senior full-stack engineer (MERN + TypeScript). We are building a "Lotto" web app: an offline-draw game tracker for 110 players and 1 admin. I have written a spec pack in markdown files (00_OVERVIEW.md to 06_FLUTTER_LATER.md plus PROMPTS.md). These files are the source of truth.

Step 1: Read 00_OVERVIEW.md fully. Then skim 01 to 05 so you know what is coming. Do not read 06 beyond its section 1.

Step 2: Reply with, and nothing else yet:
  a) A 10-line summary of the product in your own words (to prove you understood it).
  b) The architecture you will use, as a short list, and any deviation from the spec with a reason.
  c) Any ambiguity or contradiction you found in the files. Ask me before assuming.
  d) The phase plan (phases 1 to 5) with what each phase delivers.

Step 3: After I say "go", scaffold the monorepo exactly as 00_OVERVIEW.md section 7 describes: npm workspaces (shared, server, web), TypeScript configs, ESLint + Prettier, Vitest, docker-compose.yml with MongoDB, .env.example with every variable named in 02_BACKEND_API_REALTIME.md section 10, and a README stub. Put the .md spec files in docs/. Add shared/constants.ts from 01_DATA_AND_CARD_GENERATION.md section 1. Make sure `npm install`, `npm run dev` and `npm test` work (with one trivial test).

Rules for the whole project:
- Never use Math.random for anything security- or fairness-related; use crypto.
- Server is the single source of truth. Only the draw log is stored; marks, ranks and winners are computed from it.
- Give me complete files, not fragments or diffs.
- At the end of every phase tell me: how to run it, how to test it, what is not done yet.
- If something is ambiguous, ask before guessing.
```

## Prompt 1 — Data models, card generator, progress logic

```
Phase 1. Read 00_OVERVIEW.md and 01_DATA_AND_CARD_GENERATION.md again carefully.

Build:
1. Mongoose models: Game, Player, Card, Draw, AuditLog, AdminUser (and WinEvent, defined in 02 section 7), with every index from file 01 (especially the partial unique index on Draw and the unique canonicalKey on Card).
2. server/src/services/cardGenerator.ts: a PURE function (no DB) implementing the balanced, seeded, unique-card algorithm from file 01 section 4, with a seedable PRNG (mulberry32 or sfc32), the repair-by-swap step, the retry logic, the optional overlap cap and the generation stats.
3. A persistence service that saves generated cards all-or-nothing, plus the regenerate/lock rules from 4.4 and 4.5.
4. shared/progress.ts: computeProgress() with ranking, tie-break, completedAtSeq, hotNumbers, closeToWin, histogram (file 01 section 7 and file 02 section 5), and shared/winRules.ts: the config-driven rule engine from file 01 section 6.
5. Credential helpers: secure 6-digit PIN generation (crypto.randomInt, weak-pattern rejection), hashing with argon2id (or bcrypt), verifyCode HMAC generation, phone normalisation.
6. Unit tests for everything in 05_TESTING_AND_ACCEPTANCE.md sections 2.1 to 2.4.

Before writing code, show me your plan and explain the repair-by-swap step in your own words, including why swapping preserves the "each number appears exactly 16 times" property.

Done means: file 01 section 9 acceptance list passes, shown by test output.
```

## Prompt 2 — Backend API, draw logic, win flow, sockets

```
Phase 2. Read 00_OVERVIEW.md, 01_DATA_AND_CARD_GENERATION.md and 02_BACKEND_API_REALTIME.md.

Build the Express + Socket.IO backend exactly as 02 describes:
- Auth (admin + player, JWT cookie and Bearer, lockout, generic errors), zod validation, stable error codes, rate limits, Helmet, CORS.
- All routes in 02 section 3 EXCEPT the image/ZIP/credentials-export routes (those are Phase 3), including the game state machine and the reset-game route.
- The draw logic from section 4: manual draw, random draw (crypto.randomInt), undo of the latest draw only, Idempotency-Key handling, concurrency-safe seq assignment relying on the DB unique indexes.
- Progress engine wiring, GET /admin/status snapshot, /public/board, /me/card, verify-claim.
- Winner detection, WinEvent, confirm/reject flow (section 7). Public endpoints must not reveal winners until confirmed.
- Socket.IO rooms, events and gap-safe payloads (section 8), plus docs/events.md.
- docs/openapi.yaml.
- Supertest API tests for section 12 of file 02 and the API part of 05 section 3.

Before coding, tell me: (1) how you will make two simultaneous draws of the same number safe, and (2) what happens to a pending win detection when the admin undoes the draw that caused it. I want your answers in your own words.

Done means: file 02 section 12 acceptance passes, with evidence (test output).
```

## Prompt 3 — Card images, exports, WhatsApp flow (server side)

```
Phase 3. Read 00_OVERVIEW.md, 01 (sections 2.3 and 3) and 03_CARD_IMAGES_AND_SHARING.md.

Build the server side of card distribution:
- renderCard using @napi-rs/canvas with a BUNDLED font (and a fallback font that covers Malayalam so names don't render as boxes). Layout and style per 03 section 2. Deterministic output. Unmarked and marked variants.
- Endpoints in 03 section 4: single card PNG (admin and player-own), streamed ZIP of all cards, credentials CSV, printable credentials slips, with the in-memory 15-minute PIN window (410 after expiry) and no plain PINs in DB or logs.
- WhatsApp text builder with the editable template, wa.me link builder, filename sanitiser.
- PATCH sent-flags endpoint (already in 02) wired up.
- Tests for 03 section 7.

Be upfront about what WhatsApp can and cannot do: wa.me cannot attach images. Implement exactly the flow in 03 section 1.

Done means: 110 PNGs generated in under 30 seconds, grid in each PNG matches Card.grid, long and Malayalam names render correctly.
```

## Prompt 4 — Frontend

```
Phase 4. Read 00_OVERVIEW.md and 04_FRONTEND_PAGES.md, plus the API in 02 and the distribution requirements in 03 section 6.

Build the React + Vite + TypeScript + Tailwind + shadcn/ui frontend:
- Public board (/), Player login and /my-card, Admin login, Admin dashboard, Draw console, Players list and detail, Setup stepper, Distribution page, Log page.
- TanStack Query for REST data; one useLiveSync() hook for sockets with reconnect and gap detection that refetches snapshots.
- Minimalist dark, monochrome with ONE accent colour; marked cells must be distinguishable without colour (check mark or ring + bold).
- Pure presentational CardGrid and NumberGrid components.
- Draw console with live validation, confirm-before-submit, random draw (server picks), undo with confirmation, click-to-fill from the number grid.
- Admin dashboard as specified: leaderboard, hot numbers, close-to-win, histogram, searchable/sortable table of all 110 players with expandable card view, winner modal (verify + confirm/reject).
- Mobile-first for the player page, projector-friendly public board.

Build in this order and show me after each: (1) public board + player card + player login, (2) draw console + admin login, (3) admin dashboard, (4) setup + players + distribution, (5) log page and polish.

Done means: file 04 section 9 acceptance passes. Show it with a short manual test script I can follow.
```

## Prompt 5 — Tests, rehearsal, README, Docker

```
Phase 5. Read 05_TESTING_AND_ACCEPTANCE.md and re-check every other file's acceptance section.

1. Fill any unit/API/socket test gaps from sections 2 to 4.
2. Write the Playwright end-to-end suite from section 5 (full game with three windows, tie scenario, undo scenario, refresh scenario).
3. Verify the edge-case table in section 7 row by row; for each row tell me which test covers it. Fix any gap you find.
4. Make `docker-compose up` run Mongo + server + web from a .env file. Add `npm run backup`.
5. Write the README: setup, env vars, step-by-step event runbook, local-network mode, troubleshooting.
6. Give me the final sign-off checklist (section 8) with each box ticked or explained.

Be honest: list anything that is not covered or that you could not verify.
```

## Prompt 6 — Flutter (only after phase 5 is accepted)

```
Phase 6. The web app is accepted. Read 06_FLUTTER_LATER.md, docs/openapi.yaml and docs/events.md.

First, give me a plan: architecture, packages, folder structure, screen list and the API/socket calls each screen uses. Wait for my approval. Then build the Flutter app in this order: auth + player card, then admin draw console, then admin dashboard, then native share of card images. Do not change the backend except to fix real bugs, and tell me each bug you found.
```
