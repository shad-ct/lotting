# 06 — Flutter Client (LATER — do not start until the web app is accepted)

> Use for: planning the Flutter app after the MERN web app passes `05_TESTING_AND_ACCEPTANCE.md`. Until then, this file only tells the web/back-end agent what to keep stable.

## 1. What the web/back-end agent must preserve NOW (so Flutter is easy later)
1. All behaviour lives behind `/api/v1`. No server-side rendering, no web-only cookies as the sole auth path: Bearer tokens must work (file 02 §2).
2. `docs/openapi.yaml` is kept up to date and generated types are possible.
3. `docs/events.md` documents every Socket.IO event with payload examples.
4. Error `code` strings are stable (never rename without a version bump).
5. Business logic (`progress`, win rules) is **server-computed**. The client only renders what the server returns. Do not push game logic into React components.
6. Presentational components (`CardGrid`, `NumberGrid`) are prop-driven (file 04 §7) so they map 1:1 to Flutter widgets.
7. Never add an API that requires cookies or browser-only features for core flows.

## 2. Flutter app scope (when the time comes)
Two modes in one app, chosen at login:
- **Player:** login (ID + PIN), live card, still-needed numbers, last drawn, download/share card image, haptic feedback on a new mark.
- **Admin:** draw console (number pad), random draw, undo, dashboard (leaderboard, close-to-win, hot numbers), player search/detail, winner confirm modal. Admin Distribution (WhatsApp share) uses the native share sheet, which works with images natively (better than the web flow).
- Public board mode (a "TV/Display" view) optional.

## 3. Suggested architecture
- Flutter (stable), **Riverpod** for state, **dio** for HTTP with an interceptor for the Bearer token, **socket_io_client** for events, `flutter_secure_storage` for the token, `go_router` for navigation, `freezed` + `json_serializable` for models (generated from OpenAPI where possible).
- Same rule as the web: REST is the source of truth, sockets only notify; on reconnect or sequence gap, refetch.
- Feature-first folders: `features/auth`, `features/player_card`, `features/admin_draw`, `features/admin_dashboard`, `features/public_board`, `core/api`, `core/socket`, `core/theme`.
- Dark monochrome theme with one accent colour, matching the web app.
- Offline behaviour: show the last known state with a "Reconnecting" banner. Do not queue admin draws offline (draws must be server-confirmed).

## 4. Flutter acceptance (later)
1. Player on Android: logs in, sees the live card, a new draw marks within ~1 s, haptic fires.
2. Admin on Android: can run a full game from the draw console without touching the web app.
3. Token expiry and re-login handled gracefully.
4. Shares the card PNG to WhatsApp through the native share sheet.
