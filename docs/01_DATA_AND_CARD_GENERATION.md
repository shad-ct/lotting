# 01 — Data Model & Card Generation

> Use for: database schemas, card generation algorithm, uniqueness guarantees, win-rule config, player credentials model.
> Prerequisite: `00_OVERVIEW.md`.

## 1. Constants (put in `shared/constants.ts`, never hard-code elsewhere)

```ts
export const MAX_NUMBER = 110;       // numbers are 1..110 inclusive
export const CARD_SIZE = 16;         // numbers per card
export const GRID_ROWS = 4;
export const GRID_COLS = 4;
export const PLAYER_COUNT_DEFAULT = 110;
```

The generator, validators and UI must read these. A different event (say 60 players, numbers 1–90, 9 per card) should only need config changes, not code changes. Config is per-game and stored on the Game document (§2.1).

## 2. MongoDB collections (Mongoose, TypeScript)

### 2.1 `Game`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | string | e.g. "Onam Lotto 2026" |
| `status` | enum `setup` \| `ready` \| `live` \| `finished` | See state machine §5 |
| `maxNumber` | number | default 110 |
| `cardSize` | number | default 16 |
| `playerCount` | number | default 110 |
| `winRules` | object | See §6 |
| `cardsLockedAt` | Date \| null | set when status moves to `ready` |
| `startedAt`, `finishedAt` | Date \| null | |
| `generationSeed` | string | the seed used, for reproducibility/audit |
| `generationStats` | object | overlap stats etc. from §4.6 |
| `createdAt`, `updatedAt` | Date | |

### 2.2 `Player`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `gameId` | ObjectId | index |
| `serial` | number | 1..110, human-friendly card number, unique per game |
| `name` | string | required |
| `phone` | string \| null | E.164 digits, used only to build WhatsApp links. Optional |
| `loginId` | string | e.g. `P001`; unique per game; case-insensitive |
| `pinHash` | string | argon2id or bcrypt hash. NEVER store the plain PIN after the one-time reveal |
| `pinResetAt` | Date \| null | |
| `cardId` | ObjectId \| null | set when cards are generated |
| `cardImageSentAt` | Date \| null | admin ticks "sent" in the UI |
| `credentialsSentAt` | Date \| null | same |
| `isActive` | boolean | admin can disable a player (e.g. no-show). A disabled player stays in rankings only if admin chooses; default: still ranked |
| timestamps | | |

### 2.3 `Card`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `gameId` | ObjectId | index |
| `serial` | number | same as player serial |
| `grid` | number[16] | row-major order, i.e. `grid[r*4+c]`. The visible layout |
| `numbersSorted` | number[16] | sorted ascending, derived from `grid` |
| `canonicalKey` | string | `numbersSorted.join("-")` — **unique index with `gameId`** (guarantees no two identical cards) |
| `verifyCode` | string | 6–8 char code = first chars of HMAC-SHA256(secret, gameId + serial + canonicalKey), uppercase base32. Printed on the card image; the admin uses it to verify a claim (file 02 §9) |
| `createdAt` | Date | |

### 2.4 `Draw` (the only game-state log)
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `gameId` | ObjectId | |
| `seq` | number | 1,2,3… strictly increasing per game |
| `number` | number | 1..110 |
| `source` | enum `manual` \| `random` | |
| `drawnAt` | Date | server time |
| `undoneAt` | Date \| null | soft-delete for undo (audit trail). Active draws have `undoneAt = null` |
| `undoReason` | string \| null | |

Indexes:
- `{ gameId: 1, number: 1 }` **unique, partial** on `undoneAt: null` → the database itself rejects a number being drawn twice among active draws.
- `{ gameId: 1, seq: 1 }` unique.

> Undo = set `undoneAt` on the latest active draw. The number becomes drawable again. `seq` of later draws continues from the max ever used (never reuse a `seq`), but all ranking logic uses only active draws, ordered by `seq`.

### 2.5 `AuditLog` (simple, append-only)
`{ gameId, at, actor: "admin", action: "draw" | "undo" | "reset_pin" | "lock_cards" | "start" | "finish" | "regenerate_cards", payload }`

### 2.6 `AdminUser`
Seed ONE admin from env (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) at boot if none exists. Password is hashed. No registration endpoint.

## 3. Player and credential creation

1. Admin adds players by (a) a CSV upload with columns `name,phone` or (b) a form, or (c) a "create N placeholder players" button (names "Player 001"… editable later).
2. Serial numbers are assigned 1..N in insertion order.
3. `loginId` default = `P` + serial zero-padded to 3 digits (`P001`). Admin can override but it must stay unique.
4. **PIN:** random 6 digits generated with `crypto.randomInt`, never `Math.random`. Show it to the admin ONCE (on generation) in a credentials table and a CSV/printable export, then keep only the hash. The admin can "reset PIN", which issues a new one-time reveal.
   - Because the admin must hand credentials out over WhatsApp, the one-time reveal screen is the only place plain PINs exist. Warn the admin clearly: "Export or copy now — PINs cannot be shown again."
   - Avoid trivially guessable PINs: reject `000000`, `123456`, repeated digit patterns.
5. Phone numbers: store digits only with country code (default `91` if the user types 10 digits — make the default country code a config value).

## 4. Card generation algorithm

### 4.1 Goals (all must hold)
1. Every card has exactly 16 **distinct** numbers in 1..110.
2. All 110 cards are **different as sets** (enforced by `canonicalKey` unique index, and checked before insert).
3. **Balanced (default):** every number from 1..110 appears on exactly `playerCount * cardSize / maxNumber` cards. For 110/16/110 that is exactly 16 cards per number. If that quotient is not an integer, fall back to "near-balanced": counts differ by at most 1.
4. Randomness comes from a **seeded PRNG** so a game can be reproduced for audit/debug. Seed is generated with `crypto.randomBytes` and stored on the Game. Use a small, well-known seedable PRNG (e.g. mulberry32 or sfc32) — do not use `Math.random`.
5. Grid position within a card is a random shuffle (Fisher–Yates with the same PRNG).
6. Optional **overlap cap** (default off, configurable): no two cards share more than `maxOverlap` numbers. A validated prototype (random balanced deal) already gave max pairwise overlap of 8 and a mean of 2.2 without any cap, so a cap of 10–12 is cheap to satisfy; do not set it tighter than 8 without testing.

### 4.2 Balanced deal procedure (validated in a prototype)

```
function generateCards(playerCount, cardSize, maxNumber, rng):
  perNumber = playerCount * cardSize / maxNumber        // 16 for the default
  slots = []                                            // length playerCount*cardSize
  for n in 1..maxNumber: push n, perNumber times
  shuffle(slots, rng)                                   // Fisher–Yates
  cards = split slots into playerCount chunks of cardSize

  // Repair phase: a chunk may contain the same number twice. Fix by swapping.
  repeat up to MAX_REPAIR_ITERATIONS (e.g. 200_000):
      dupes = all (cardIndex, position) where that number appears >1 time in the card
      if dupes empty: break
      pick one dupe (i, j) at random
      pick another card a != i and position b at random
      va = cards[i][j]; vb = cards[a][b]
      if vb already in cards[i] OR va already in cards[a]: continue   // swap would create a new duplicate
      swap cards[i][j] and cards[a][b]
  if dupes not empty after the loop: retry the whole deal with the next derived seed (max 50 retries), then fail loudly

  // Uniqueness
  verify all canonicalKeys are distinct; if two cards are identical sets, swap one element of one card with another card (same validity rule as above) and re-check
  // Optional overlap cap
  if maxOverlap set: compute pairwise overlaps; for any pair exceeding the cap, do a validity-preserving swap on one of the cards; bounded retries
  // Layout
  for each card: shuffle its numbers (rng) to form the grid
  return cards
```

Why swapping preserves balance: each swap exchanges one number between two cards, so the total count of each number across all cards never changes.

### 4.3 Where it lives
A pure function in `server/src/services/cardGenerator.ts` with **no database access**: `(config, seed) => { cards: number[][]; stats }`. A separate service persists the result. Pure = trivially unit-testable and reusable for the Flutter-side or CLI later.

### 4.4 Persistence (all-or-nothing)
Insert the 110 cards with one `insertMany` in a Mongo transaction if a replica set is available; otherwise insert into a staging flag (`Card.draft = true`) and flip to final after all inserts and validation succeed. If anything fails, remove the partial set. A half-generated card set must never be visible.

### 4.5 Regeneration rules
- While `Game.status === "setup"`, the admin may **regenerate** all cards (new seed). Old cards are deleted (audit log entry written).
- Moving to `ready` (button: **"Lock cards"**) sets `cardsLockedAt`. After that, regeneration is blocked at the API level with a clear error. This is a fairness guarantee.

### 4.6 Generation stats (store on Game, show to admin)
`{ seed, perNumberCounts: {min,max}, maxPairwiseOverlap, meanPairwiseOverlap, attemptsUsed, generatedAt }`

## 5. Game state machine

```
setup  --(cards generated, all players have cards)--> setup (cards present)
setup  --(Lock cards)--> ready
ready  --(Start game)--> live          (draws now accepted)
live   --(win detected & admin confirms OR admin ends manually)--> finished
finished --(Reopen, admin only, with confirmation)--> live   (for misclicks)
```
Draw endpoints reject unless `status === "live"`.
Winner detection does NOT auto-finish the game instantly; it raises a "WINNER" state for the admin to confirm and announce (see file 02 §7), because physical-world verification matters.

## 6. Win rules — config-driven

Stored on `Game.winRules`:

```ts
type WinRules = {
  fullCard: { enabled: boolean };                       // DEFAULT: enabled = true
  anyRow: { enabled: boolean };                          // DEFAULT: false
  anyColumn: { enabled: boolean };                       // DEFAULT: false
  fourCorners: { enabled: boolean };                     // DEFAULT: false
  diagonals: { enabled: boolean };                       // DEFAULT: false
  firstToMarks: { enabled: boolean; marks: number };     // DEFAULT: false, marks = 8
  stopAtFirstFullCard: boolean;                          // DEFAULT: true
};
```
Implement a **rule engine**: each rule is a small pure function `(card, drawnSet) => boolean` plus a function that reports "how many more numbers are needed to satisfy this rule" (used for the "closest to winning" ranking). Only `fullCard` has to be shown in the UI at first, but the engine must run all enabled rules. Prize events (e.g. "first row completed") are recorded once, with the draw `seq` that caused them, so each prize is awarded to whoever hit it first, with ties allowed.

## 7. Derived (computed, not stored) values per player

For a given set of active draws `D` (ordered by `seq`):
- `marked = card ∩ D`
- `markedCount`
- `remaining = card − D` (the numbers the player still needs)
- `remainingCount`
- `completedAtSeq`: the `seq` at which the card reached 16 marks (null if not complete)
- `reachedCountAtSeq[k]`: the `seq` when the player reached k marks. Used for tie-breaks.

**Ranking:** sort by `markedCount` desc; ties broken by who reached that count at an earlier `seq` (asc); then by `serial` asc. For finished players (full card), rank by `completedAtSeq` asc; same `seq` = **co-winners** (same rank, flagged as tie).

Put this in one pure module `shared/progress.ts` so the web app and the Flutter-side port use identical logic. It must be covered by unit tests (file 05).

## 8. Indexes summary
- `Player`: `{gameId, serial}` unique, `{gameId, loginId}` unique (collation strength 2 for case-insensitive).
- `Card`: `{gameId, serial}` unique, `{gameId, canonicalKey}` unique.
- `Draw`: described in §2.4.

## 9. Acceptance for this file
1. Generating cards for 110 players yields 110 cards, each with 16 distinct numbers in 1..110.
2. All `canonicalKey`s are distinct.
3. Each number 1..110 appears on exactly 16 cards.
4. Same seed → identical output (deterministic). Different seed → different output.
5. Generation completes in under 2 seconds on a normal laptop.
6. After lock, regeneration returns HTTP 409.
7. Plain PINs exist nowhere in the DB or logs.
