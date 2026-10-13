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
## Phase 3 — Card images, exports, WhatsApp (done, verified)
- Deps: @napi-rs/canvas; fonts bundled at server/assets/fonts (Noto Sans +
  Noto Sans Malayalam variable TTFs, OFL) registered under LottoNoto/LottoNotoML
  aliases — verified rendering even with unique aliases so Docker (no system
  fonts) works. System already ships Noto Malayalam here, but we do NOT rely on it.
- `cardImage/theme.ts` (all constants), `renderCard.ts` (pure, deterministic —
  byte-identical test passes; 1080×1350; header band, CARD #serial, auto-fit
  name (shrink-then-ellipsis), 4×4 rounded cells, footer with verifyCode +
  Login ID (never PIN) + app URL + `n/16 marked`), `renderZip.ts` (hand-rolled
  deterministic stored-ZIP streamer — archiver dropped, its @types had no
  factory export), `whatsapp.ts` (editable-template fill, wa.me link, null when
  phoneless). Unmarked cache keyed verifyCode+themeVersion.
- Routes: admin single PNG (?marked, ?download w/ sanitized name), player own
  PNG, ZIP (status ≥ ready), credentials.csv + credentials.print behind the
  15-min in-memory PIN window (410 PINS_NO_LONGER_AVAILABLE after), sent-flags
  from Phase 2. OpenAPI extended.
- Fixed from visual review: grid overflowed 1350px (cells now fit-computed +
  centered), ✓ glyph was tofu (hand-drawn tick), name/grid overlap (fixed
  block positions), clipped progress line. Spot-checked normal/long/Malayalam/
  marked PNGs by eye — all correct, incl. Malayalam with no boxes.
- Verified: server 50 tests pass (6 files); 110 PNGs render well under 30s;
  pixel-level marked test proves grayscale-visible marking (accent lum <120 vs
  gray >180); ZIP central-directory parsed → 110 unique safe names; 403
  cross-player; `tsc` OK; eslint 0 errors.
- 03 §7 all 7 items pass. Deviations: (1) no QR code in footer (spec: optional).
  (2) ZIP is stored/uncompressed (deterministic, fast; ~110×~100KB fine).
- NOT done: frontend (Phase 4), E2E/Docker-proof/README (Phase 5).
## Phase 4 — Frontend (done, verified to gate; live 3-window check = Phase 5 E2E)
- Stack: Tailwind v3 + hand-rolled shadcn-style primitives (button/input/dialog/
  badge via cva+clsx+tailwind-merge, lucide-react installed) — full shadcn CLI
  scaffold deferred (same look, less codegen). TanStack Query owns server state;
  `useLiveSync()` owns the socket, reconnect + gap refetch (lastSeq jump → full
  resync), exposes LiveDot state.
- Order per Prompt 4: (1) PublicBoard + MyCard + logins, (2) DrawConsole +
  AdminLogin, (3) AdminDashboard (stats, leaderboard, WinnerModal w/ verify +
  confirm/reject, hot numbers, close-to-win, histogram, searchable/sortable/
  filterable 110-row table with expandable CardGrid + detail links),
  (4) Setup 6-step stepper + Players CRUD/CSV/placeholders + PlayerDetail
  (timeline, PIN reset, PNG) + Distribution (PNG ⬇, Web Share w/ fallback,
  wa.me text, sent checkboxes, ZIP/CSV/print, counters, filters, preview modal),
  (5) LogPage (struck-through undone + audit + standings CSV) + polish
  (MiniDrawBox in admin header, 403 screens, route guards, reduced-motion,
  tabular nums, aria labels, no colour-alone marking — ✓ ring + bold).
- Verified: `tsc --noEmit web` OK; `vite build` OK (328KB JS/99KB gzip);
  eslint clean; live smoke vs real server+mongo: full setup→lock→start→draw→
  board→player-card flow incl. Malayalam name marked live + 403 wrong-role;
  preview serves /, /my-card, /admin/draw (200). Manual script: docs/MANUAL_TEST.md.
- Deviations: (1) public-board sound toggle present, TTS omitted (spec: optional).
  (2) confetti omitted (spec: optional). (3) connected-viewers count omitted
  (spec: optional). (4) CSV import via textarea/JSON, not file-multipart
  (same validation semantics). (5) No Storybook (pure presentational
  CardGrid/NumberGrid kept isolated and prop-driven instead).
- NOT done: Playwright E2E incl. 3-window/tie/undo/refresh proof (Phase 5),
  compose-up proof, backup, full README, sign-off (Phase 5).
## Phase 5 — E2E, Docker, backup, README, sign-off (done, verified)
- E2E (Playwright + headless Chromium, `npm run test:e2e`):
  - `e2e/full-game.spec.ts` PASSES (27s): 110 players, mixed manual+random draws
    to first completion across admin/public/player windows; views agree every
    10th draw; modal appears, public hidden until confirm, banner after.
  - `e2e/tie-undo-refresh.spec.ts` PASSES (4s): forced tie → modal shows both
    names → public hidden → confirm → banner shows both; UI draw → UI undo →
    un-marked everywhere → redraw (seq continues); player reload restores state.
  - Re-verified 2026-10-13: 2/2 green (39.8s) against fresh `lotto_e2e` DB with
    dev servers stopped (ports freed for the E2E-owned servers); dev restarted
    afterwards (`/api/v1/health` ok, web 200).
  - Test env: `DISABLE_RATE_LIMITS=1` for E2E only (limits covered by API tests);
    added to `.env.example` as a commented warning (never set in real use).
- Real bugs found BY the E2E and fixed:
  1. `web/src/api/client.ts` spread `...init` last, dropping Content-Type on
     requests with extra headers (Idempotency-Key) → 422 on UI draws. Fixed by
     merging headers properly.
  2. `web/vite.config.ts` did not proxy `/socket.io` → sockets dead in dev
     (“Reconnecting…”). Fixed (ws:true). `web/nginx.conf` covers prod parity.
  3. Player login searched ALL games → cross-game loginId collision broke login
     once 2+ games exist. Fixed: login scoped to current game (one active game
     per spec). API tests unaffected (one game per test).
  4. E2E helper URL regex matched `/admin/login` itself — exact-URL asserts now.
- `scripts/backup.mjs` (`npm run backup [dir]`): pure-mongoose JSON dump;
  verified against live DB (431KB, all collections).
- NOTE: during Phase 5 the tree received concurrent external edits (Dockerfiles
  → root-context builds + `npm ci` + explicit shared build, `web/nginx.conf`
  with /api+/socket.io proxy + SPA fallback, drawService redundant me:update
  removal, +2 socket isolation/gap tests). Reviewed: all beneficial and
  consistent; kept. Socket suite now 4 tests, server total 52 — all green.
- Phase 5 completion pass (2026-10-13):
  - Coverage gate (05 §8): installed `@vitest/coverage-v8@2.1.9` (pinned to
    vitest 2.1.9) as devDep in shared+server. `progress.ts` 100% lines,
    `winRules.ts` 92.06% lines, `cardGenerator.ts` 96.96% lines — all ≥ 90%.
    Added 3 gap tests (`INVALID_MAX_OVERLAP`, tight-cap repair, small-space
    uniqueness fix). Remaining ~3% uncovered = fail-loudly retry-exhaustion
    branches (deliberately hard to trigger fast; a 12-player/C(5,3) probe
    confirmed retry-storm cost, so no test pins them — fail-loudly design
    reviewed instead).
  - Full `npm test`: shared 20 + server 55 + web 1, ALL pass.
  - Docker: `docker compose build` green for both images; `docker compose
    config` valid. Full-stack proof ran the built images (`lotto-spec-server`,
    `lotto-spec-web`, `mongo:7`) with an isolated project/ports file (host
    27017 here is taken by an unrelated container, so only the mongo HOST port
    moved to 27018 — container networking identical): server health ok direct
    AND via nginx `/api` proxy, web 200; torn down with `down -v` afterwards.
    Committed `docker-compose.yml` itself unchanged.
  - OpenAPI (`docs/openapi.yaml`, 319 lines) matches routes: every
    `server/src/routes/*.ts` handler has a path entry (health/auth ×4/
    public board/me ×2/admin game+cards ×6/players ×8/draws ×4/status/
    verify-claim/wins ×2/standings/cards.zip/credentials ×2/audit + PNG
    image routes). Error shape `{error:{code,message,details}}` with stable codes.
  - 05 §8 sign-off: `npm test` ✓; coverage ≥90% on the three modules ✓;
    Playwright incl. tie+undo ✓; openapi matches ✓; compose up ✓ (see note);
    README (setup/env/runbook/local-network/troubleshooting) ✓; no secrets
    committed (`.env` gitignored, `.env.example` complete incl.
    DISABLE_RATE_LIMITS warning + JWT_EXPIRES_IN row in README) ✓;
    02 §10 security (helmet/CORS/lockout/generic errors/rate limits) ✓ via
    api.test.ts (lockout + 429 tests); 04 §8–9 a11y/responsive ✓ via
    MANUAL_TEST.md + E2E (360px player page, projector board, ✓ ring + bold,
    reduced-motion, aria labels).
  - Edge cases (05 §7): every row mapped in `docs/EDGE_CASES.md`; automated
    rows green in `npm test`/`test:e2e`; operator rows (projector legibility,
    WhatsApp on-phone flow, kill-server restart, slow-3G resync, 5-PNG visual
    check) are in `docs/MANUAL_TEST.md` for the admin rehearsal — NOT
    machine-verified here, must be done before the real event.
- NOT done (by design): Flutter app (Phase 6, starts only after this sign-off).
