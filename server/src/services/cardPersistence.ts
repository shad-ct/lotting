import mongoose from 'mongoose';
import { buildVerifyCode, canonicalKeyFor } from '@lotto/shared/credentials.js';
import { AuditLog } from '../models/AuditLog.js';
import { Card } from '../models/Card.js';
import { Game } from '../models/Game.js';
import { Player } from '../models/Player.js';
import type { GenerationStats } from '../services/cardGenerator.js';

export class CardLockError extends Error {
  code = 'CARDS_LOCKED';
  status = 409;
}

/**
 * All-or-nothing persistence (agreed: NO transactions, NO replica set).
 * Cards are fully generated + validated in memory first, then a single
 * insertMany. On any failure, deleteMany({gameId}) removes the partial set —
 * safe because generation only runs while status === 'setup'.
 */
export async function persistGeneratedCards(
  gameId: mongoose.Types.ObjectId | string,
  serials: number[],
  grids: number[][],
  opts: { seed: string; stats: GenerationStats; hmacSecret: string },
): Promise<void> {
  const gid = new mongoose.Types.ObjectId(gameId);
  const gameIdStr = gid.toHexString();

  if (serials.length !== grids.length) throw new Error('SERIAL_GRID_MISMATCH');

  const docs = serials.map((serial, idx) => {
    const grid = grids[idx];
    const numbersSorted = [...grid].sort((a, b) => a - b);
    const canonicalKey = canonicalKeyFor(grid);
    return {
      gameId: gid,
      serial,
      grid,
      numbersSorted,
      canonicalKey,
      verifyCode: buildVerifyCode(opts.hmacSecret, gameIdStr, serial, canonicalKey),
    };
  });

  // In-memory pre-check: duplicate canonical keys fail fast before touching the DB.
  const keys = new Set(docs.map((d) => d.canonicalKey));
  if (keys.size !== docs.length) throw new Error('DUPLICATE_CARD');

  try {
    await Card.insertMany(docs, { ordered: true });
  } catch (err) {
    await Card.deleteMany({ gameId: gid });
    throw err;
  }

  // Link cards to players by serial.
  const cards = await Card.find({ gameId: gid }).select('_id serial');
  const bySerial = new Map(cards.map((c) => [c.serial, c._id]));
  await Promise.all(
    serials.map((serial) =>
      Player.updateOne({ gameId: gid, serial }, { $set: { cardId: bySerial.get(serial) ?? null } }),
    ),
  );

  await Game.updateOne(
    { _id: gid },
    { $set: { generationSeed: opts.seed, generationStats: opts.stats } },
  );
  await AuditLog.create({
    gameId: gid,
    actor: 'admin',
    action: 'regenerate_cards',
    payload: { seed: opts.seed, count: docs.length },
  });
}

/** Regeneration guard: allowed only while status === 'setup'. */
export async function assertRegenerable(gameId: mongoose.Types.ObjectId | string): Promise<void> {
  const game = await Game.findById(gameId);
  if (!game) throw new Error('GAME_NOT_FOUND');
  if (game.status !== 'setup') {
    throw new CardLockError('Cards are locked and cannot be regenerated');
  }
}

/** Remove all cards for a game (used by regenerate while in setup). */
export async function clearCards(gameId: mongoose.Types.ObjectId | string): Promise<void> {
  const gid = new mongoose.Types.ObjectId(gameId);
  await assertRegenerable(gid);
  await Card.deleteMany({ gameId: gid });
  await Player.updateMany({ gameId: gid }, { $set: { cardId: null } });
}
