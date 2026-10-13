import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { Player } from '../models/Player.js';
import { bus, type DomainEvent } from '../services/events.js';
import { getProgress } from '../services/progressService.js';
import { Game } from '../models/Game.js';
import { verifyToken } from '../utils/jwt.js';

/**
 * Real-time layer (02 §8). Rooms: `public`, `admin`, `player:<playerId>`.
 * Handshake auth: JWT via `auth.token` (or cookie for browsers); public
 * sockets send none and join `public` only. REST is the source of truth —
 * every payload carries drawCount/lastSeq so clients detect gaps and refetch.
 */

function tokenFromHandshake(authToken: unknown, cookieHeader: string | undefined): string | null {
  if (typeof authToken === 'string' && authToken) return authToken;
  if (cookieHeader) {
    const found = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('lotto_token='));
    if (found) return decodeURIComponent(found.slice('lotto_token='.length));
  }
  return null;
}

let lastSnapshotAt = 0;

export function attachSockets(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  });

  io.on('connection', async (socket) => {
    const token = tokenFromHandshake(
      (socket.handshake.auth as { token?: unknown })?.token,
      socket.handshake.headers.cookie,
    );
    socket.join('public');
    if (token) {
      try {
        const payload = verifyToken(token);
        if (payload.role === 'admin') {
          socket.join('admin');
        } else if (payload.role === 'player') {
          // Server-assigned room only — a player can never join another
          // player's room or the admin room (no join handler exists).
          const player = await Player.findById(payload.sub).select('_id').lean();
          if (player) socket.join(`player:${String(player._id)}`);
        }
      } catch {
        // Invalid token → stays public-only.
      }
    }
    socket.emit('connected', { rooms: [...socket.rooms].filter((r) => r !== socket.id) });
  });

  bus.on('domain', async (event: DomainEvent) => {
    try {
      switch (event.type) {
        case 'draw:new':
          io.to('public').emit('draw:new', {
            seq: event.seq,
            number: event.number,
            drawCount: event.drawCount,
            lastSeq: event.seq,
            source: event.source,
          });
          await fanoutMeUpdates(io, event.gameId, event.seq, event.drawCount);
          break;
        case 'draw:undone':
          io.to('public').emit('draw:undone', {
            seq: event.seq,
            number: event.number,
            drawCount: event.drawCount,
            lastSeq: event.seq,
          });
          await fanoutMeUpdates(io, event.gameId, event.seq, event.drawCount);
          break;
        case 'admin:snapshot': {
          // Throttle to ~5/second (02 §8). Lightweight notify — the admin
          // client refetches GET /admin/status (REST is the source of truth).
          const now = Date.now();
          if (now - lastSnapshotAt < 200) break;
          lastSnapshotAt = now;
          io.to('admin').emit('admin:snapshot', { gameId: event.gameId, at: new Date().toISOString() });
          break;
        }
        case 'me:update':
          await fanoutMeUpdates(io, event.gameId, 0, 0);
          break;
        case 'win:detected':
          io.to('admin').emit('win:detected', { events: event.events });
          break;
        case 'win:confirmed':
          io.to('public').emit('win:confirmed', { events: event.events });
          break;
        case 'game:status':
          io.to('public').emit('game:status', { status: event.status });
          break;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('socket emit failed:', e);
    }
  });

  return io;
}

/** Per-player updates go ONLY to that player's room (02 §8). */
async function fanoutMeUpdates(
  io: Server,
  gameId: string,
  lastSeq: number,
  drawCount: number,
): Promise<void> {
  const game = await Game.findById(gameId);
  if (!game) return;
  const { ctx, progress } = await getProgress(game);
  const seq = lastSeq || ctx.lastSeq;
  const count = drawCount || ctx.draws.length;
  for (const p of progress.players) {
    if (p.playerId.startsWith('unassigned-')) continue;
    io.to(`player:${p.playerId}`).emit('me:update', {
      markedCount: p.markedCount,
      remainingCount: p.remainingCount,
      marked: p.marked,
      isWinner: p.completedAtSeq != null,
      drawCount: count,
      lastSeq: seq,
    });
  }
}
