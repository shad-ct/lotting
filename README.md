# Lotto (scaffold — Phase 0)

Offline-draw lotto tracker for 110 players + 1 admin. MERN + TypeScript monorepo.
Spec pack is the source of truth: see `docs/` (`00_OVERVIEW.md` … `06_FLUTTER_LATER.md`).

## Layout (per `00_OVERVIEW.md` §7)

```text
lotto/
├─ package.json            (workspaces: shared, server, web)
├─ docker-compose.yml      (mongo + server + web, plain single-node mongo)
├─ .env.example
├─ shared/                 (constants, zod schemas, progress/win logic — Phases 1+)
├─ server/src/             (config/models/services/routes/middleware/sockets/utils)
├─ server/test/
├─ web/src/                (pages/components/hooks/api/store — Phase 4)
└─ docs/                   (spec .md files + openapi.yaml in Phase 2)
```

Agreed decisions (Phase 0 answers): no `Card.draft`, no transactions/replica set
(generate + validate in memory, single `insertMany`, `deleteMany({gameId})` on
failure); `Draw.isActive:boolean` + partial unique index + `undoneAt` audit stamp;
extra `Game` flags (`showExactRankToPlayers=false`, `closeThreshold=3`,
`maxOverlap=null`, `defaultCountryCode="91"`, `appUrl`, `whatsappTemplate`);
inactive players ranked but excluded from hot/close/winners; ObjectId in paths;
`WinEvent{…, placing, resolvedAt, status: pending|confirmed|rejected|withdrawn}`;
reset clears Draws+WinEvents+started/finishedAt → `ready`, keeps players/cards/PINs/audit;
single-instance in-memory lockout + idempotency (see full README in Phase 5).

## Setup

```bash
cp .env.example .env
npm install
npm run dev      # server :3001 + web :5173 (concurrently)
npm test         # vitest in each workspace (one trivial test each for now)
```

- Health: `GET http://localhost:3001/api/v1/health`
- Web: `http://localhost:5173`
- Full runbook, LAN mode, backup (`npm run backup`) and troubleshooting land in Phase 5.

## What is NOT done yet

Phases 1–5 (models/generator/progress → API/sockets → PNG/WhatsApp → frontend → tests/Docker/README).
This scaffold is only: workspaces, TS, ESLint+Prettier, Vitest, compose, env, docs, `shared/constants.ts`.
