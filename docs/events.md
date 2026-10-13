# Socket.IO events (02 §8)

Namespace `/`. Rooms: `public`, `admin`, `player:<playerId>`.
Handshake auth: JWT via `auth.token` (native clients) or the `lotto_token`
cookie (browsers). Public sockets send no token and join `public` only.
The server assigns rooms — there is no client join API, so a player can never
join another player's room or the admin room.

REST is the source of truth; sockets are notifications. Every payload carries
`drawCount` and `lastSeq`. A client that sees `lastSeq` jump by more than 1,
or that reconnects, must refetch its REST snapshot
(`/public/board`, `/me/card`, `/admin/status`).

## Server → client

### `draw:new` → `public` (everyone: public, admin, players)
```json
{ "seq": 37, "number": 64, "drawCount": 37, "lastSeq": 37, "source": "manual" }
```

### `draw:undone` → `public`
```json
{ "seq": 37, "number": 64, "drawCount": 36, "lastSeq": 37 }
```

### `me:update` → `player:<playerId>` only
```json
{
  "markedCount": 11, "remainingCount": 5,
  "marked": [3, 8, 12], "isWinner": false,
  "drawCount": 37, "lastSeq": 37
}
```

### `admin:snapshot` → `admin` only (throttled ~5/second)
Lightweight notify; the admin client refetches `GET /admin/status`.
```json
{ "gameId": "65...", "at": "2026-01-01T00:00:00.000Z" }
```

### `win:detected` → `admin` only (never public until confirmed)
```json
{ "events": [{ "eventId": "65...", "rule": "fullCard", "placing": 1,
  "players": [{ "serial": 47, "name": "Rahul" }] }] }
```

### `win:confirmed` → `public`
```json
{ "events": [{ "eventId": "65...", "placing": 1 }] }
```

### `game:status` → `public`
```json
{ "status": "live" }
```

### `connected` → the new socket only
```json
{ "rooms": ["public", "admin"] }
```

## Client → server

No application emits are required. Clients refetch REST on gap/reconnect.
