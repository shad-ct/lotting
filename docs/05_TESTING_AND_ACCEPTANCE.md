# 05 — Testing, Edge Cases & Final Acceptance

> Use for: writing tests, running the end-to-end rehearsal, final sign-off.
> Prerequisites: all previous files. Run this phase after building, and ideally write the unit tests alongside phases 1–2.

## 1. Test tooling
- **Vitest** for unit tests (server + shared). **Supertest** for API tests with `mongodb-memory-server` (or a throwaway Mongo in Docker). **Playwright** for end-to-end (3 browser contexts: admin, public, player).
- Tests must run with one command: `npm test`. E2E: `npm run test:e2e`.

## 2. Unit tests (pure logic) — must exist

### 2.1 Card generator (`cardGenerator`)
- 110 cards, each length 16, all numbers integers in 1..110, all distinct within a card.
- All canonical keys distinct.
- Balanced: every number 1..110 appears exactly 16 times in total.
- Determinism: same seed → deep-equal output; different seed → different output.
- Run 200 different seeds in a loop: every run satisfies all properties (property-style test) and finishes within the time budget.
- Non-integer quotient config (e.g. 100 players × 15 numbers from 1..110): near-balanced, counts differ by ≤ 1.
- Overlap cap set to 10: no pair exceeds 10, or the generator fails loudly (never silently ignores the cap).
- Impossible config (cardSize > maxNumber) throws a clear error.

### 2.2 Progress / ranking (`shared/progress`)
- No draws → everyone 0 marked, same rank, no winners.
- A draw hits exactly the players whose card contains the number.
- Ranking: more marks first; tie-break by who reached that count earlier; then by serial.
- `completedAtSeq` set at the right draw; two players completing on the same `seq` → co-winners, same rank, `isTie = true`.
- `hotNumbers` lists exactly the undrawn numbers that complete someone's card, with the right players.
- Undo (removing the latest draw from the input list) restores the previous output exactly.
- Disabled players behave as configured.

### 2.3 Win rules engine
- Each rule individually (fullCard, row, column, corners, diagonals, firstToMarks) with hand-built cards.
- Prizes are awarded once, to the first achievers, ties allowed.

### 2.4 Utilities
- Phone normalisation (10-digit + default country code, existing `+91`, spaces/dashes, garbage rejected).
- PIN generation: 6 digits, uses `crypto`, rejects weak patterns; hash/verify round trip.
- Filename sanitiser.

## 3. API tests (Supertest)

- Auth: wrong PIN and unknown ID return the same error; lockout after 5 failures; admin vs player token separation.
- **Authorization matrix:** for every `/admin/*` route, a player token → 403, no token → 401. For `/me/*`, an admin token behaves per design (documented). A player can never read another player's card, by any route or parameter tampering.
- Draw rules from file 02 §12 (duplicates, concurrency, random exhaustion, undo + redraw, idempotency key replay).
- Draw rejected unless the game is `live`.
- Lock rules: cards cannot be regenerated after lock (409); lock requires all players to have cards and PINs.
- Win flow: detected → not visible on the public endpoint → confirm → visible; reject path; undo of an unconfirmed win withdraws it; undo after confirmation requires reopen.
- Public payload contains no phone numbers, login IDs or card grids (assert on the JSON keys).
- Rate limits respond 429.
- Plain PIN never appears in DB documents (scan the collection) or captured logs.

## 4. Socket tests
- A draw produces `draw:new` to public, admin, and each player; `me:update` only to the relevant player rooms.
- A player socket can't join another player's room or the admin room.
- Reconnect after missing events: the client's gap detection triggers a REST refetch (test the hook or simulate).

## 5. End-to-end rehearsal (Playwright) — "the full game"

Seed 110 players, generate cards, lock, start. Then:
1. Draw all numbers 1..110 in a random order (mix of manual and random draws) while three windows are open (admin dashboard, public board, one player page).
2. After every draw, assert the three views agree on the drawn set (sample every 10th draw to keep it fast).
3. When the first completion happens, assert the admin modal appears, the public page does NOT yet show a winner, then confirm and assert the public banner appears.
4. Separate scenario: **force a tie** (pick two cards with a small overlap difference using a test fixture, draw so both complete on the same draw) and assert co-winners.
5. Separate scenario: mistaken manual entry then Undo; assert un-marking everywhere and that the number can be redrawn.
6. Separate scenario: refresh the player page mid-game; state is restored.

## 6. Manual QA checklist (the admin does this before the real event)

- [ ] Import the real 110-player CSV; a few rows deliberately invalid; the preview shows the errors.
- [ ] Generate credentials; copy/download; confirm that after 15 minutes the export is gone and Reset PIN works.
- [ ] Generate cards; check stats show "each number appears 16 times".
- [ ] Open 5 random PNGs: grid matches the player's card in the app.
- [ ] Lock cards; confirm regeneration is blocked.
- [ ] Send yourself the WhatsApp flow end to end on your phone (Web Share and the `wa.me` text).
- [ ] Log in as three players on three phones; verify each sees only their own card.
- [ ] Project the public board on the actual screen/projector; check legibility from the back of the room.
- [ ] Run a 15-number practice draw, undo one, then **reset the game** (see below) before the real event.
- [ ] Kill the server mid-game and restart it: the game resumes with the same draws (state is in the DB).
- [ ] Throttle the phone network to "slow 3G": the player page still resyncs.

## 7. Edge cases the agent must handle explicitly

| Situation | Required behaviour |
|---|---|
| Admin types `0`, `111`, `-5`, `7.5`, `abc`, empty | Rejected with `INVALID_NUMBER`, no draw |
| Same number twice quickly | One draw, one clean 409 |
| Two admin tabs open | Both stay in sync via sockets; no duplicate draw |
| Admin undoes, then redraws a different number | Allowed; `seq` keeps increasing; log shows all |
| Winner detected but admin's shout was wrong (e.g. mis-entry) | Reject → undo → game continues |
| Tie on the winning draw | Co-winners, both shown |
| All 110 numbers drawn, nobody "won" | Impossible with full-card + all cards valid (every card is complete after 110), but the code must not crash: game ends with all complete; treat as co-winners by `completedAtSeq` ordering |
| Player forgets PIN | Admin Reset PIN → new one-time PIN; old PIN dead immediately |
| Player shares their card image publicly | Harmless: it doesn't contain the PIN; the card contents are not secret from the public board's perspective |
| Server restart mid-game | No state lost; sockets reconnect; clients resync |
| Player logs in on two phones | Allowed (both read-only views) |
| Player with no phone number | Distribution row disabled for WhatsApp, card PNG still downloadable |
| Game needs resetting after a practice run | Admin "Reset game" (dangerous action, typed confirmation "RESET"): clears Draws and WinEvents, sets status back to `ready`, keeps players and cards |

> Add the **Reset game** action to the backend (file 02) and the Setup page (file 04) if not already present; it is required for rehearsals.

## 8. Final acceptance checklist (sign-off)

- [ ] `npm test` passes; coverage on `cardGenerator`, `progress`, and the winrules ≥ 90% lines.
- [ ] Playwright full-game rehearsal passes, including the tie and undo scenarios.
- [ ] `docs/openapi.yaml` exists and matches the implemented routes.
- [ ] `docker-compose up` brings up Mongo + server + web with only a `.env` file.
- [ ] README explains: setup, env vars, how to run an event step by step (the stepper), how to run on a local network without internet (see below), and troubleshooting.
- [ ] No secrets committed; `.env.example` complete.
- [ ] Security checklist in file 02 §10 is satisfied.
- [ ] Accessibility and responsive checks in file 04 §8–9 are satisfied.

## 9. Deployment note (put in README)
Two supported modes:
1. **Hosted** (a small VPS or any Node + Mongo host). Players use their own mobile data.
2. **Local network** (laptop as server, event Wi-Fi or hotspot): server binds `0.0.0.0`, README shows how to find the laptop's LAN IP and put it in `WEB_ORIGIN`; the QR/URL on the card images must use that address. Remind the admin: the players' phones must be on the same network, and the laptop must not sleep.
Provide a one-command backup: `npm run backup` dumps the DB to a timestamped file.
