# Edge cases (05 §7) — required behaviour → covering test

| Situation | Required behaviour | Covered by |
|---|---|---|
| Admin types `0`, `111`, `-5`, `7.5`, `abc`, empty | Rejected with `INVALID_NUMBER`, no draw | `server/test/api.test.ts` → invalid numbers rejected (422 INVALID_NUMBER / VALIDATION_ERROR, log stays empty) |
| Same number twice quickly | One draw, one clean 409 | api.test.ts → same number twice (409 NUMBER_ALREADY_DRAWN, 1 active draw); 20 concurrent same-number → 1×201 + 19×409 |
| Two admin tabs open | Both stay in sync via sockets; no duplicate draw | Sockets (`draw:new` to admin room) + idempotency-key test; manual script docs/MANUAL_TEST.md item 1 |
| Admin undoes, then redraws a different number | Allowed; `seq` keeps increasing; log shows all | api.test.ts → undo then redraw (seq 2, audit has draw+undo) |
| Winner detected but shout was wrong | Reject → undo → game continues | api.test.ts → reject path + undo withdraws detection |
| Tie on the winning draw | Co-winners, both shown | api.test.ts → tie (ONE WinEvent, 2 players); e2e/tie-undo-refresh.spec.ts (modal + banner) |
| All 110 drawn, nobody "won" | Must not crash; all complete | api.test.ts → random 110× + 111th ALL_NUMBERS_DRAWN (game completes; progress engine handles all-complete); full-game.spec.ts draws to completion |
| Player forgets PIN | Reset PIN → new one-time PIN; old dead | `resetPin` overwrites hash immediately (api.test.ts reset flow keeps old PINs working only when untouched; password.test.ts verifies new hash); Distribution Reset PIN button |
| Player shares card image publicly | Harmless: no PIN in image | renderCard footer has Login ID only (visual check); credentials.test.ts + CSV test assert PIN never in PNG path |
| Server restart mid-game | No state lost; reconnect + resync | Draws/Wins in Mongo (stateless server); useLiveSync refetch-on-reconnect; manual script (kill server, restart, refresh) |
| Player logs in on two phones | Allowed (read-only views) | No session invalidation on login (api.test.ts logins); player routes are read-only |
| Player with no phone number | WhatsApp disabled, PNG still downloadable | Distribution row (“No phone saved”, wa.me disabled); buildWhatsappLink(null) → null test |
| Practice run needs resetting | Reset with typed “RESET”: clears Draws+WinEvents → ready, keeps players/cards | api.test.ts → reset test (draws 0, players/cards kept, old PINs work, status ready) + confirmResetSchema rejects other values (422) |
