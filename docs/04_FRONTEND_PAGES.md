# 04 — Frontend: Pages, Components, UX

> Use for: the React app (admin console, public board, player card, login).
> Prerequisites: `00_OVERVIEW.md`, `02_BACKEND_API_REALTIME.md` (API + socket events), `03_CARD_IMAGES_AND_SHARING.md` (Distribution page).

## 1. Stack and structure

- React 18 + Vite + TypeScript, React Router, **TanStack Query** for REST data, `socket.io-client`, Tailwind CSS, **shadcn/ui** components.
- Shared zod types from `shared/`.
- State rule: server data lives in TanStack Query. Sockets only **invalidate or patch** the query cache (`queryClient.setQueryData` for `draw:new`, full refetch on gap/reconnect). No second source of truth.
- A single `useLiveSync()` hook owns the socket, reconnect and gap detection (file 02 §8) and exposes `{ connected, lastSeq }` for a small status dot in the UI ("● Live" / "○ Reconnecting…").

## 2. Visual direction

- **Minimalist, dark-first, monochrome** with ONE accent colour (use a vivid lime or amber) reserved for "drawn / marked / winning". Light theme optional via a toggle.
- Big, legible numbers. Tabular figures (`font-variant-numeric: tabular-nums`) everywhere numbers appear.
- Meaning must never rely on colour alone: marked cells also get a bold weight and a check or ring (accessibility, grayscale projectors).
- Motion: subtle. When a number is drawn, the board cell does a short (≤400 ms) pop/flash; the "last drawn" number animates in. Respect `prefers-reduced-motion`.
- Mobile-first for the player page; the public board is designed for a **projector/TV (landscape, 16:9)** and must also work on phones.

## 3. Routes

| Route | Who | Page |
|---|---|---|
| `/` | public | Public board (the TV page) |
| `/login` | public | Player login (ID + PIN) with a small "Admin" link |
| `/admin/login` | public | Admin login |
| `/my-card` | player | The player's live card |
| `/admin` | admin | Dashboard (live status) |
| `/admin/draw` | admin | Draw console |
| `/admin/players` | admin | Players list and management |
| `/admin/players/:id` | admin | Player detail |
| `/admin/setup` | admin | Game setup, cards generation, lock, start/finish |
| `/admin/distribution` | admin | Card images, credentials, WhatsApp (file 03 §6) |
| `/admin/log` | admin | Draw log and audit |

Route guards: redirect to the right login page when unauthenticated; wrong-role access shows a clear 403 screen.

## 4. Public board (`/`) — "the numbers that have been taken"

- A **grid of all 110 numbers** (suggested 10 columns × 11 rows, auto-fit to the viewport). Undrawn = dim outline; drawn = filled accent + bold. Newest drawn number is highlighted with a distinct ring until the next draw.
- **Large "Last drawn" panel:** the latest number, huge, with its sequence ("Draw #37").
- **Recent draws strip:** last 10 numbers in order.
- **Counters:** `Drawn 37 / 110`, `Remaining 73`.
- **Game status banner:** "Waiting to start", "LIVE", "Finished". When winner(s) are confirmed: a prominent banner with the winner name(s) and card number; handle co-winners ("Winners: Rahul (#047) & Anu (#012)"). Confetti optional (respect reduced motion).
- No login, no PII beyond confirmed winners' names.
- A fullscreen toggle and an optional "sound on new number" toggle (off by default). Optional text-to-speech of the number (Web Speech API) behind a toggle, off by default, since this is a live event with an announcer.
- Works offline-ish: if the socket drops, keep showing the last state and show the "Reconnecting…" indicator, then resync.

## 5. Player page (`/my-card`)

- Header: player name, `Card #047`, Live dot.
- The **4×4 card grid**, large tap-friendly cells. Marked cells: accent fill + check. Newly marked cell (from the latest draw) pulses once.
- Progress: `11 / 16 marked`, a slim progress bar, `5 to go`.
- "Still needed" list of the remaining numbers (this is what players love to watch).
- Last drawn number and the last ~8 draws, small, below.
- Status chip: "In the game" / "So close! 2 to go" (when ≤3 remaining) / "🎉 You completed your card!" (shown only when the server says `isWinner`; the official winner still needs admin confirmation, so label it "Card complete — waiting for admin to confirm" until confirmed).
- Rank shown per the game flag (bucket vs exact), never revealing other players' identities.
- "Download my card image" button (`/me/card/image?marked=1`).
- Logout button.
- Fully responsive down to 320 px wide; test at 360×640.

## 6. Admin pages

### 6.1 Dashboard (`/admin`) — "know each and every person's status"
Layout (desktop three-column; stacks on mobile):
1. **Top stats row:** drawn count, remaining, last drawn, game status, connected viewers (optional), players close to winning.
2. **Leaderboard (live):** top 10 by marks with name, serial, `markedCount/16`, a mini progress bar, "needs N". Ties shown with the same rank number and a `=` marker.
3. **Winner alert area:** when `win:detected` arrives → a blocking modal (file 02 §7) with **Verify card** and **Confirm winner(s)** / **Reject**.
4. **Hot numbers panel:** "If one of these is called next, someone wins": number → players who would complete. Click a number to see the players.
5. **Close to winning list:** players with ≤3 remaining and the exact numbers they need.
6. **Distribution histogram:** how many players have 0, 1, 2 … 16 marks (simple bar chart).
7. **Full players table** (all 110): serial, name, marks `x/16`, remaining, rank, status badge, and a **row-expand** showing the card grid with marked cells and the missing numbers. Sortable by rank / serial / name / marks; **search** by name or serial; filter chips: `Close to win (≤3)`, `Completed`, `No marks`, `Inactive`.
8. A persistent **mini draw box** (number input + "Draw") on every admin page header, so the admin can enter numbers from anywhere. Keyboard: `Enter` submits; focus returns to the input.

### 6.2 Draw console (`/admin/draw`) — built for speed and for mistakes
- Huge numeric input (autofocus, `inputmode="numeric"`, 1–3 digits). `Enter` to submit.
- **Live inline validation before submit:** out-of-range → "1–110 only"; already drawn → "Already drawn at draw #12" (and the submit is disabled).
- A **confirm-before-submit** toggle (default ON for the first run, can be turned off by experienced admins): shows "Draw 57?" with `Enter` to confirm and `Esc` to cancel. A wrong number on a live board is embarrassing.
- **Random draw** button with a short (≈1 s) shuffle animation then the result. It calls the server (the server picks, the animation is cosmetic and must never choose the number).
- Large "last drawn" display with an **Undo last draw** button (confirmation dialog, optional reason). Show exactly which number will be undone: "Undo draw #37 (number 64)?".
- The number grid 1–110 (same as the public board) where **clicking an undrawn number fills the input** (handy when the admin prefers tapping). Drawn numbers are disabled.
- Recent-draws list with seq, number, time, `manual|random` source.
- Disabled state with explanation when the game is not `live` ("Start the game from Setup first").
- Error toasts mapped from the stable error codes in file 02.

### 6.3 Players (`/admin/players`) and detail
- Table with CRUD, CSV import (with a preview and a row-level error report: duplicate loginId, bad phone), "create N placeholder players".
- Detail page: player info, card grid, marked/remaining, **timeline** of when each number was marked (draw seq), sent flags, PIN reset, and the card PNG preview.

### 6.4 Setup (`/admin/setup`) — a guided stepper
1. Create game (name, win rules toggles, advanced: numbers/card size/player count).
2. Add players (import or placeholders) — shows count `110/110`.
3. Generate credentials (one-time reveal screen with the warning from file 03 §5).
4. Generate cards — shows generation stats (balanced counts, max overlap, seed). "Regenerate" allowed until locked.
5. **Lock cards** (danger-styled confirm: "After locking, cards can't be changed").
6. Go to Distribution (file 03), then **Start game**.
Each step is disabled until the previous is complete, with the reason shown.

### 6.5 Log (`/admin/log`)
Draw log (including undone, struck through) and audit log with filters, plus **Export standings CSV**.

## 7. Components to build (reuse across pages)

`NumberGrid` (1..110 board, props: drawn, last, onPick), `CardGrid` (4×4, props: grid, marked, highlight), `ProgressBar`, `LiveDot`, `LastDrawnPanel`, `WinnerBanner`, `WinnerModal`, `PlayerRow`/`PlayerExpandRow`, `Histogram`, `ConfirmDialog`, `Stepper`, `CopyButton`, `EmptyState`.
`CardGrid` and `NumberGrid` must be pure/presentational and driven by props, so they can be rendered in Storybook-like isolation and ported to Flutter widgets later.

## 8. Quality bar

- No layout shift when numbers update. Fixed cell sizes.
- Every async action has loading, success and error states. Buttons disable during requests to prevent double submits (and the server is idempotent anyway).
- Keyboard accessible, visible focus rings, ARIA labels on grids (`aria-label="Number 57, drawn"`).
- No horizontal scroll on mobile.
- Lighthouse accessibility ≥ 90 on `/` and `/my-card`.
- Empty states for "no players yet", "no draws yet", "game not started".

## 9. Acceptance for this file
1. Draw a number on `/admin/draw`: within ~1 s the public board cell, the matching players' cards and the admin leaderboard update **without refresh**, in three different browser windows.
2. Kill and restore network on the player page: it shows "Reconnecting…", then resyncs to the correct state.
3. Undo a draw: the number un-marks everywhere.
4. A player at 15/16 sees "1 to go" and the exact missing number; the admin hot-number panel lists that number with that player.
5. On a tie, both names appear in the winner modal and public banner.
6. Player page usable at 360 px wide; public board readable from across a room at 1920×1080.
7. A player user cannot open any `/admin/*` page (even by typing the URL).
