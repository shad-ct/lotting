# Lotto build progress (maintained after every phase)

## Phase 0 — Scaffold (done, verified)
- Monorepo `shared/server/web` workspaces, TS base config, ESLint (flat) + Prettier,
  Vitest per workspace, `docker-compose.yml` (plain single-node mongo, no replica set),
  `.env.example` (all 02§10 vars + PORT/APP_URL), README stub, `docs/` spec pack,
  `shared/constants.ts` (01§1).
- Verified: `npm install` (334 pkgs, 0 errors), `npm run dev` (server :3001 + web :5173),
  `GET /api/v1/health` → `{"ok":true,...}`, `npm test` 3/3 workspaces green.

## Phase 1 — Data models, card generator, progress/ranking (done, verified)
- Models (`server/src/models/`): Game (+agreed flags: showExactRankToPlayers=false,
  closeThreshold=3, maxOverlap=null, defaultCountryCode=91, appUrl, whatsappTemplate,
  includeInactiveInRank=true), Player (unique {gameId,serial}, unique {gameId,loginId}
  collation strength 2), Card (unique {gameId,serial}, unique {gameId,canonicalKey}),
  Draw (**isActive:boolean** + partial unique `{gameId,number}|{isActive:true}` +
  `undoneAt` audit stamp + unique `{gameId,seq}`), AuditLog, AdminUser,
  WinEvent (`status: pending|confirmed|rejected|withdrawn` + placing/resolvedAt).
- `server/src/services/cardGenerator.ts`: pure balanced seeded generator (mulberry32 +
  FNV-1a seed hash, Fisher–Yates, repair-by-swap preserving balance, bounded retries,
  uniqueness fix, optional overlap cap that fails loudly, per-card layout shuffle).
- `server/src/services/cardPersistence.ts`: in-memory validate → single `insertMany`,
  `deleteMany({gameId})` on failure (setup-only, safe), verifyCode per card,
  regenerate guard (409 CARDS_LOCKED after lock).
- `shared/progress.ts`: computeProgress (marks/remaining/completedAtSeq/
  reachedCountAtSeq/competition ranking with co-winner ties/histogram/closeToWin/
  hotNumbers). `shared/winRules.ts`: config-driven engine (all 6 rules + needed counts).
- `shared/credentials.ts`: crypto PIN gen + weak rejection, phone normalisation,
  HMAC verifyCode (upper base32), canonicalKey, filename sanitiser. Hashing
  (`server/src/utils/password.ts`): argon2id, bcryptjs fallback (argon2 native build
  works — fallback never triggered so far). `shared/schemas.ts`: zod inputs for Phase 2.
- Repair-by-swap (own words): a duplicate cell (i,j) is exchanged with a random cell
  (a,b) on another card only if neither recipient already holds the incoming value;
  swaps move values between cards so global per-number counts never change while
  duplicates strictly decrease; stall → retry whole deal with derived seed → fail loudly.
- Verified:
  - `npm run test --workspace=@lotto/shared` → 4 files, 20 tests pass
  - `npm run test --workspace=@lotto/server` → 3 files, 16 tests pass (ran 3× green;
    fixed a first-run race by `syncIndexes()` in models.test.ts)
  - `npm test` (all workspaces) → shared 20 + server 16 + web 1, all pass
  - `npx tsc --noEmit -p server/tsconfig.json` OK; `npm run build --workspace=@lotto/server` OK
  - `npx eslint shared server/src server/test web/src` → 0 errors (1 unused-disable warning)
- 01§9 acceptance: (1)(2)(3) balanced 16× + unique keys via 200-seed loop test;
  (4) determinism test; (5) <2s single-gen test; (6) lock→409 unit-tested (API test in Phase 2);
  (7) no plain-PIN field test + PINs only in-memory (exports in Phase 3).
- NOT done: API/routes/sockets (Phase 2), PNG/exports (Phase 3), frontend (Phase 4),
  E2E/Docker/README (Phase 5).
- Cut / deferred: none. Assumptions: competition ranking "1,2,2,4"; closeToWin excludes
  completed cards; shared consumed as compiled `dist` via exports map (server/web build
  shared first — see root scripts); `Game.winRules` stored via flexible sub-schema.

## Phase 2 — Backend API, draw logic, win flow, sockets (done, verified)
- Deps: jsonwebtoken, cookie-parser, express-rate-limit (explicit MemoryStores),
  socket.io, socket.io-client (tests), zod pinned to v3 to match shared.
- Auth: admin/player JWT `{sub, role, gameId}` 12h, httpOnly SameSite=Lax cookie
  (+ Secure in prod) AND Bearer; token in JSON body only for `X-Client: mobile`;
  generic INVALID_CREDENTIALS; 5-fail/5-min in-memory lockout; case-insensitive loginId.
- Routes: all of 02 §3 EXCEPT image/ZIP/credential-export (Phase 3):
  auth, public/board (no PII; winners only after confirm), me/card (bucket rank
  by default, exact when flag), admin game/cards/lock/start/finish/reopen/reset,
  players CRUD + import (JSON array or `{csv}` — no multipart, see below) +
  placeholders + credentials/generate + reset-pin + sent flags + detail,
  draws/manual/random/undo/list, status snapshot (?q, ?sort, ?full),
  verify-claim, wins confirm/reject, standings.csv, audit log.
- Draw logic: live-guard, integer validation (422 INVALID_NUMBER), next seq =
  max-ever+1, partial-unique (gameId,number)|active → 409 NUMBER_ALREADY_DRAWN
  with details, crypto.randomInt for random draws + ALL_NUMBERS_DRAWN, undo
  latest-only with pending-win withdrawal and WINNER_CONFIRMED_REOPEN_FIRST,
  Idempotency-Key (200 entries, 10-min TTL, per-admin scope).
- Winners: before/after rule comparison per draw, one WinEvent per rule with
  co-winners, placing counter, confirm (finishes when stopAtFirstFullCard)
  /reject/withdraw flows; win:detected admin-only, win:confirmed public.
- Sockets: rooms public/admin/player:id (server-assigned, no join API);
  draw:new/draw:undone/game:status/win:confirmed → public, me:update fanned out
  per player room, win:detected + throttled admin:snapshot → admin;
  every payload carries drawCount+lastSeq. docs/events.md + docs/openapi.yaml.
- Verified: `npm test` → shared 20 + server 41 + web 1, ALL pass;
  `tsc --noEmit server` OK; eslint 0 errors; 02 §12 all 7 items covered in
  server/test/api.test.ts (incl. 20-concurrent same-number → 1×201+19×409,
  110 random draws + 111th ALL_NUMBERS_DRAWN, tie → ONE event w/ 2 co-winners).
- Fixed along the way: syncIndexes after dropDatabase (index-creation race),
  tie-fixture keys '5-6'/'6-7' (generated 2-card deals only contain 1-4),
  reset→start in withdraw test.
- Deviations: (1) draw seq-collision retry up to 25 + jitter instead of 3 —
  3 cannot converge 20 concurrent requests; safety still from DB indexes.
  (2) CSV import accepts `{csv: string}` / JSON, not multipart (no multer dep);
  same preview/error-report semantics via CSV_ROW_ERRORS. (3) `me:update`
  fan-out computed server-side per player room.
- NOT done: card PNG/ZIP/CSV/print endpoints (Phase 3), frontend (Phase 4),
  E2E/Docker-proof/README (Phase 5).
- Cut / deferred: none.
## Phase 3 — (pending)
## Phase 4 — (pending)
## Phase 5 — (pending)
