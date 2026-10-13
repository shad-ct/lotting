# 02 — Backend API, Draw Logic, Win Detection, Real-time

> Use for: Express routes, auth, draw endpoints, undo, win detection, admin status endpoints, Socket.IO events.
> Prerequisites: `00_OVERVIEW.md`, `01_DATA_AND_CARD_GENERATION.md`.

## 1. Conventions

- Base path: `/api/v1`. JSON only (except image/file downloads).
- Validation: **zod** schemas in `shared/` shared with the frontend. Reject unknown fields.
- Error shape (always): `{ "error": { "code": "NUMBER_ALREADY_DRAWN", "message": "Human readable", "details": {} } }`. Stable `code` strings, because the Flutter app will switch on them.
- Success shape: plain resource JSON, no envelope, except lists: `{ "items": [...], "total": n }`.
- Timestamps ISO-8601 UTC.
- Every state-changing admin route writes an `AuditLog` row.
- Rate limits: login 10 attempts / 15 min / IP+loginId; draw endpoints 30 / min; everything else generous.

## 2. Auth

- Two login flows, one token mechanism:
  - `POST /auth/admin/login` `{ username, password }`
  - `POST /auth/player/login` `{ loginId, pin }` (loginId case-insensitive)
- Token: JWT with `{ sub, role: "admin" | "player", gameId }`, 12h expiry. Deliver as an **httpOnly, SameSite=Lax, Secure (in prod) cookie** for the web app AND accept `Authorization: Bearer <jwt>` (for the Flutter app later). Return the token in the JSON body only for requests that send header `X-Client: mobile`.
- `GET /auth/me` returns `{ role, player? }`.
- `POST /auth/logout` clears the cookie.
- Middleware: `requireAdmin`, `requirePlayer`. A player token can only ever read its own card: derive the player from the token, **never** from a URL parameter, for player routes.
- Login failures return the same generic message for "unknown id" and "wrong PIN" (no user enumeration).
- Lock out: 5 consecutive failures for a loginId → 5-minute cooldown (in-memory is fine for one instance).

## 3. Route list

### 3.1 Public (no auth)
| Method | Path | Returns |
|---|---|---|
| GET | `/public/board` | `{ game: {name, status, maxNumber}, drawn: [{seq, number}], lastDrawn: {seq, number} \| null, drawCount, winners: [{serial, name}] \| [] }` |

Rules for the public payload: show winners' **name and serial** only after the admin has confirmed the winner (§7). Never include cards, phones, login IDs, or per-player counts.

### 3.2 Player (role=player)
| Method | Path | Returns |
|---|---|---|
| GET | `/me/card` | `{ serial, name, grid: number[16], marked: number[], markedCount, remaining: number[], remainingCount, rank, totalPlayers, isWinner, completedAtSeq }` |
| GET | `/me/card/image` | PNG of the player's own card (see file 03). Optional query `?marked=1` draws current marks |

> Showing the player their own **rank** is a design choice: default `rank` is exposed as a coarse bucket (e.g. "Top 10", "Top 25%") not an exact position, to avoid disputes. Make it a game config flag `showExactRankToPlayers` default `false`.

### 3.3 Admin: setup (role=admin)
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/game` | current game + stats |
| POST | `/admin/game` | create game `{name, maxNumber?, cardSize?, playerCount?, winRules?}` (only if none exists or previous finished) |
| PATCH | `/admin/game` | update name / winRules (only while `setup`) |
| POST | `/admin/players/import` | CSV (multipart) or JSON array `[{name, phone?}]` |
| POST | `/admin/players` | create one |
| PATCH | `/admin/players/:id` | edit name, phone, loginId, isActive |
| DELETE | `/admin/players/:id` | only while `setup` |
| POST | `/admin/players/credentials/generate` | generate PINs for all players that have none; returns **one-time** `[{serial, name, loginId, pin}]` |
| POST | `/admin/players/:id/reset-pin` | new one-time PIN for one player |
| POST | `/admin/cards/generate` | generate (or regenerate while `setup`) all cards |
| POST | `/admin/cards/lock` | `setup → ready`. Preconditions: playerCount players exist, every player has a card and a PIN |
| POST | `/admin/game/start` | `ready → live` |
| POST | `/admin/game/finish` | `live → finished` |
| POST | `/admin/game/reopen` | `finished → live` (requires `{confirm: true}`) |
| POST | `/admin/game/reset` | rehearsal reset: requires `{confirm: "RESET"}`; deletes Draws and WinEvents, status back to `ready`; keeps players and cards; audit-logged |
| PATCH | `/admin/players/:id/sent` | `{cardImageSent?: bool, credentialsSent?: bool}` sets/clears the sent timestamps |

### 3.4 Admin: drawing
| Method | Path | Body | Behaviour |
|---|---|---|---|
| POST | `/admin/draws` | `{ number }` | manual entry. See §4 |
| POST | `/admin/draws/random` | `{}` | server picks uniformly from numbers not drawn. See §4 |
| POST | `/admin/draws/undo` | `{ reason? }` | undo the **most recent active** draw only |
| GET | `/admin/draws` | | full log incl. undone entries (audit view) |

### 3.5 Admin: status and analytics
| Method | Path | Returns |
|---|---|---|
| GET | `/admin/status` | the whole dashboard snapshot (§6). One call, ready to render |
| GET | `/admin/players/:id` | one player's full detail: card grid, marked/remaining, history of when each number got marked (seq) |
| POST | `/admin/verify-claim` | `{ serial?, verifyCode?, loginId? }` → see §9 |
| GET | `/admin/export/credentials` | file download (file 03) |
| GET | `/admin/export/cards.zip` | ZIP of PNG cards (file 03) |
| GET | `/admin/export/standings.csv` | rank table as CSV |

## 4. Draw logic (the most important code in the project)

### 4.1 Manual draw `POST /admin/draws { number }`
1. `requireAdmin`; game must be `live`, else `409 GAME_NOT_LIVE`.
2. Validate: integer, `1 ≤ number ≤ maxNumber`, else `422 INVALID_NUMBER`.
3. Compute next `seq = (max seq ever for this game) + 1`.
4. Insert `Draw{ number, seq, source: "manual" }`. The partial unique index on `(gameId, number)` where `undoneAt = null` guards against duplicates: on duplicate-key error return `409 NUMBER_ALREADY_DRAWN` with `details: { number, seq }` of the existing draw.
5. If `seq` collides (two concurrent requests), retry the insert up to 3 times with a recomputed `seq`.
6. After insert, run the progress engine (§5), emit sockets (§8), write the audit log.
7. Respond `201` with `{ draw, lastDrawn, drawCount, newWinners: [...], progressDelta }`.

### 4.2 Random draw `POST /admin/draws/random`
1. Same preconditions.
2. Build the pool = `1..maxNumber` minus active drawn numbers. If empty → `409 ALL_NUMBERS_DRAWN`.
3. Pick with `crypto.randomInt(pool.length)`. Never `Math.random`.
4. Insert exactly like a manual draw with `source: "random"`. If the insert hits a duplicate (race), re-pick and retry up to 5 times.
5. Same response and side effects.

### 4.3 Undo `POST /admin/draws/undo`
1. Only the most recent active draw can be undone. `409 NOTHING_TO_UNDO` if none.
2. Set `undoneAt = now`, `undoReason`.
3. If a winner had been **detected** because of that draw and not yet confirmed, the detection is withdrawn. If it was already **confirmed and the game is `finished`**, undo is rejected with `409 WINNER_CONFIRMED_REOPEN_FIRST` (admin must call reopen first).
4. Recompute progress, emit a `draw:undone` event + fresh snapshot, write audit log.
5. UI: undo must require a confirmation click, since it changes what everyone is seeing.

### 4.4 Idempotency
Accept an optional `Idempotency-Key` header on draw routes. Store the last ~200 keys in memory with their responses (TTL 10 min). A repeated key returns the original response and does nothing. This protects against double-clicks and flaky mobile networks.

## 5. Progress engine (computed from the log)

`computeProgress(game, cards, activeDraws)` lives in `shared/progress.ts` (see file 01 §7) and returns for every player:

```ts
{
  serial, playerId, name,
  markedCount, remainingCount,
  marked: number[], remaining: number[],
  completedAtSeq: number | null,
  reachedCountAtSeq: number[],       // index k → seq when k marks reached (0 for k=0)
  rank: number, isTie: boolean,
  prizesWon: string[]                // which rules this player satisfied, e.g. ["fullCard"]
}
```
Plus game-level aggregates:
```ts
{
  histogram: { [markedCount: number]: number },   // e.g. how many players have 0,1,2,... marks
  closeToWin: PlayerRef[],                        // remainingCount <= closeThreshold (default 3)
  hotNumbers: [{ number, wouldCompleteCount, wouldCompletePlayers: serial[] }]
}
```
- **Performance:** at 110 players × 16 numbers this is microseconds. Recompute from scratch on every draw, do not maintain incremental counters. Keep an in-memory cache keyed by `(gameId, lastActiveSeq)`.
- **hotNumbers** = for each undrawn number `x`, the players for whom `remaining == {x}` (i.e. x would complete their card). This is the "who wins if this number is called next" feature; admin dashboard shows the top ones. Also support a general "needs N more" view.

## 6. `GET /admin/status` snapshot shape

```ts
{
  game: { id, name, status, maxNumber, cardSize, startedAt },
  drawn: { count, remaining, lastDrawn: {seq, number} | null, sequence: number[] },
  players: [ // all 110, already sorted by rank
    { serial, name, loginId, phone, isActive,
      markedCount, remainingCount, rank, isTie,
      completedAtSeq, remainingNumbers?: number[],   // included only when remainingCount <= 5 to keep payload small, or when ?full=1
      cardImageSentAt, credentialsSentAt }
  ],
  leaderboard: top 10 of the above,
  closeToWin: [...], hotNumbers: [top 10],
  histogram: {...},
  winners: { detected: [...], confirmed: [...], prizes: [...] },
  generationStats
}
```
Support query params: `?q=name-or-serial` (filter), `?sort=rank|serial|name|marks`. Filtering can also be done client-side, since it's 110 rows.

## 7. Winner detection and confirmation

1. After every draw, the progress engine finds players whose enabled win rules just became satisfied *because of this draw*.
2. If the set is non-empty: store a `WinEvent` `{ gameId, drawSeq, playerIds[], rule, detectedAt, confirmedAt: null }` (new small collection `WinEvent`). Multiple players on the same draw = one event, **co-winners**.
3. Emit `win:detected` to the **admin room only**, with names. The public board does NOT show winners yet.
4. Admin sees a modal: "Player 047 — Rahul — completed their card on draw #83. Verify the card, then confirm." The modal offers **Verify card** (shows the card + the numbers + the verify code) and **Confirm winner(s)**.
5. `POST /admin/wins/:id/confirm` sets `confirmedAt`; if `stopAtFirstFullCard` then game → `finished`. Emit `win:confirmed` to everyone (public board shows a celebratory banner with name and serial).
6. `POST /admin/wins/:id/reject` (e.g. data-entry error, then the admin undoes the draw): marks the event rejected, no public effect.
7. If the game continues (e.g. `stopAtFirstFullCard = false`), later completions create further `WinEvent`s with increasing placing (2nd, 3rd…).

## 8. Real-time (Socket.IO)

- Namespace `/` with three room types: `public`, `admin`, `player:<playerId>`.
- Handshake auth: admin and player sockets send the JWT (cookie or `auth.token`); public sockets send none and are joined to `public` only.
- Server → client events (document in `docs/events.md`):
  - `draw:new` → to `public`, `admin`, and each affected player. Payload: `{ seq, number, drawCount }`. Players receive it only if relevant? **No** — send to everyone so boards stay in sync. Players also get `me:update` with their new counts.
  - `draw:undone` → `{ seq, number, drawCount }` to all rooms.
  - `admin:snapshot` → full status after any change (admin room).
  - `me:update` → to the specific `player:<id>` room: `{ markedCount, remainingCount, marked, isWinner }`.
  - `win:detected` → admin only. `win:confirmed` → all.
  - `game:status` → `{ status }` to all on state changes.
- **Reliability:** every payload carries `drawCount` and `lastSeq`. A client that sees a gap (`lastSeq` jumped by more than 1, or reconnects) must refetch its REST snapshot (`/public/board`, `/me/card`, `/admin/status`). REST is the source of truth, sockets are just notifications.
- Throttle `admin:snapshot` emits to at most ~5/second.

## 9. Claim verification `POST /admin/verify-claim`

For a physical-world "HOUSIE!" shout. Admin enters a serial, loginId, or the verify code printed on the card image. Server returns the card grid, which numbers are drawn, which are missing, and a clear `valid: true|false` ("all 16 numbers drawn" / "missing 3: 12, 58, 77"). This must work **regardless of whether the player was auto-detected**, and must check against the card stored server-side (a player holding an edited image can't cheat). Also useful if a player's card image was shared or screenshot-edited.

## 10. Security checklist

- Hash admin password and PINs (argon2id preferred, bcrypt acceptable).
- Helmet, CORS limited to the configured web origin, body size limits (CSV upload ≤ 1 MB).
- No PINs in logs. Redact `pin`, `password` in request logging.
- Cards of other players are never reachable from a player token (write a test).
- The public endpoint is cached for 1 second at most, and is safe to hit publicly (cheap, no PII).
- `.env` driven secrets: `JWT_SECRET`, `CARD_HMAC_SECRET`, `MONGO_URI`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `WEB_ORIGIN`, `DEFAULT_COUNTRY_CODE`.

## 11. OpenAPI
Generate/maintain `docs/openapi.yaml` (zod-to-openapi or hand-written). It is a deliverable of this phase, because the Flutter client will be built from it.

## 12. Acceptance for this file
1. Drawing the same number twice → second call 409 with `NUMBER_ALREADY_DRAWN`, no state change.
2. 20 concurrent draw requests for 20 distinct numbers all succeed with unique contiguous `seq`s.
3. 20 concurrent requests for the same number → exactly one 201 and nineteen 409s.
4. Random draw 110 times returns every number exactly once; the 111th call → `ALL_NUMBERS_DRAWN`.
5. Undo then redraw the same number works; the audit log shows both.
6. A player token calling any `/admin/*` route gets 403; a player cannot fetch another player's card.
7. A tie (two players completing on the same draw) produces ONE WinEvent with two co-winners.
