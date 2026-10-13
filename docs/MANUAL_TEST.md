# Manual test script — Phase 4 acceptance (04 §9)

Prereqs: `cp .env.example .env`, `npm install`, Mongo on `MONGO_URI`, then
`npm run dev` (server :3001, web :5173). Open three windows:
A = `/admin/draw` (logged in as admin), B = `/` (public board),
C = `/my-card` (logged in as a player who holds a known number, e.g. check
the admin dashboard for a serial whose card contains that number).

1. **Live draw, no refresh.** In A, type a number (confirm dialog ON) and submit.
   Within ~1 s: B's cell fills + Last-drawn updates, C's card marks if it holds
   the number (pulse), and `/admin` leaderboard reorders. No refresh anywhere.
2. **Reconnect.** In C, go offline (devtools Network → Offline): “○ Reconnecting…”
   appears and the card stays. Draw two numbers in A. Go back online: C resyncs
   to the correct marks without reload.
3. **Undo.** In A, “Undo draw #N (number X)?” → confirm. B, C and the leaderboard
   un-mark X everywhere; X can be redrawn.
4. **Close-to-win + hot numbers.** Find a player at 15/16 (dashboard “Close to
   winning”): their page shows “1 to go” + the exact missing number, and the
   admin hot-number panel lists that number with that player.
5. **Tie.** Force via API (two 2-number cards sharing the last number, see
   `server/test/api.test.ts` “tie”), draw the shared number: the winner modal
   shows BOTH names; the public banner stays empty until Confirm; after Confirm
   the banner shows “Winners: A & B”.
6. **Responsive.** C usable at 360 px wide (devtools device toolbar); B readable
   projected at 1920×1080 (Fullscreen toggle).
7. **Player isolation.** As a player, visit `/admin`, `/admin/draw`,
   `/admin/players` directly: each shows the 403 screen. `/me/card` shows only
   the logged-in card.
