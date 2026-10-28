import type { Types } from 'mongoose';

import { defaultLoginId, generatePin, normalizePhone } from '@lotto/shared/credentials.js';
import { AuditLog } from '../models/AuditLog.js';
import { Card } from '../models/Card.js';
import { Draw } from '../models/Draw.js';
import { Game } from '../models/Game.js';
import type { GameDoc } from '../models/Game.js';
import { Player } from '../models/Player.js';
import { WinEvent } from '../models/WinEvent.js';
import { hashSecret } from '../utils/password.js';
import { err } from '../utils/errors.js';
import { bus } from './events.js';
import { assertRegenerable, clearCards, persistGeneratedCards } from './cardPersistence.js';
import { generateCards, newSeed } from './cardGenerator.js';
import { addPin, clearPins, getPins, storePins } from './pinStore.js';
import { env } from '../config/env.js';

/** Parse a `name,phone` CSV body into [{name, phone}]. */
export function parsePlayerCsv(text: string): { name: string; phone?: string }[] {
  const rows: { name: string; phone?: string }[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Skip a header row.
    if (i === 0 && /^name\s*,/i.test(line)) continue;
    const [nameRaw, phoneRaw] = line.split(',').map((s) => s?.trim());
    if (!nameRaw) {
      errors.push(`row ${i + 1}: missing name`);
      continue;
    }
    rows.push({ name: nameRaw.slice(0, 120), phone: phoneRaw || undefined });
  }
  if (errors.length > 0) throw err('CSV_ROW_ERRORS', 'Some CSV rows are invalid', 422, { errors });
  return rows;
}

export async function addPlayers(
  game: GameDoc,
  inputs: { name?: string; phone?: string | null }[],
): Promise<{ created: number; players: { serial: number; loginId: string; name: string }[] }> {
  const gameId = game._id as Types.ObjectId;
  const last = await Player.findOne({ gameId }).sort({ serial: -1 }).select('serial').lean();
  let serial = (last?.serial ?? 0) + 1;
  const out: { serial: number; loginId: string; name: string }[] = [];
  for (const input of inputs) {
    const loginId = defaultLoginId(serial);
    let phone: string | null = null;
    if (input.phone) {
      try {
        phone = normalizePhone(input.phone, game.defaultCountryCode ?? env.DEFAULT_COUNTRY_CODE);
      } catch {
        throw err('INVALID_PHONE', `Invalid phone for ${input.name ?? loginId}`, 422, { name: input.name });
      }
    }
    const name = (input.name && input.name.trim()) || `Player ${serial}`;
    try {
      const pinHash = phone ? await hashSecret(phone) : null;
      const p = await Player.create({ gameId, serial, name, phone, loginId, pinHash });
      out.push({ serial: p.serial, loginId: p.loginId, name: p.name });
      serial++;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        throw err('DUPLICATE_LOGIN_ID', `Login ID ${loginId} already exists`, 409, { loginId });
      }
      throw e;
    }
  }
  // Keep configured count in sync with actual roster (no hard cap).
  game.playerCount = await Player.countDocuments({ gameId });
  await game.save();
  return { created: out.length, players: out };
}

export async function generateCardsForGame(game: GameDoc, hmacSecret: string): Promise<object> {
  const gameId = game._id as Types.ObjectId;
  await assertRegenerable(gameId);
  const players = await Player.find({ gameId }).sort({ serial: 1 }).select('serial');
  if (players.length === 0) {
    throw err('PLAYER_COUNT_MISMATCH', 'Add players first', 409, { need: 1, have: 0 });
  }
  game.playerCount = players.length;
  await game.save();
  await clearCards(gameId);
  const seed = newSeed();
  const deal = generateCards(
    {
      playerCount: game.playerCount,
      cardSize: game.cardSize,
      maxNumber: game.maxNumber,
      maxOverlap: game.maxOverlap ?? null,
    },
    seed,
  );
  await persistGeneratedCards(
    gameId,
    players.map((p) => p.serial),
    deal.cards,
    { seed, stats: deal.stats, hmacSecret },
  );
  return deal.stats;
}

export async function lockCards(game: GameDoc): Promise<void> {
  if (game.status !== 'setup') throw err('CARDS_LOCKED', 'Cards can only be locked from setup', 409, { status: game.status });
  const gameId = game._id as Types.ObjectId;
  const [playerCount, cardCount] = await Promise.all([
    Player.countDocuments({ gameId }),
    Card.countDocuments({ gameId }),
  ]);
  if (playerCount === 0) {
    throw err('SETUP_INCOMPLETE', 'Add players first', 409);
  }
  if (cardCount !== playerCount) {
    throw err('SETUP_INCOMPLETE', 'Every player needs a card before locking', 409);
  }
  game.playerCount = playerCount;
  game.status = 'ready';
  game.cardsLockedAt = new Date();
  await game.save();
  await AuditLog.create({ gameId, actor: 'admin', action: 'lock_cards', payload: {} });
  bus.emit('domain', { type: 'game:status', gameId: String(gameId), status: 'ready' });
}

export async function startGame(game: GameDoc): Promise<void> {
  if (game.status !== 'ready') throw err('BAD_TRANSITION', `Cannot start from ${game.status}`, 409);
  game.status = 'live';
  game.startedAt = new Date();
  await game.save();
  await AuditLog.create({ gameId: game._id, actor: 'admin', action: 'start', payload: {} });
  bus.emit('domain', { type: 'game:status', gameId: String(game._id), status: 'live' });
}

export async function finishGame(game: GameDoc): Promise<void> {
  if (game.status !== 'live') throw err('BAD_TRANSITION', `Cannot finish from ${game.status}`, 409);
  game.status = 'finished';
  game.finishedAt = new Date();
  await game.save();
  await AuditLog.create({ gameId: game._id, actor: 'admin', action: 'finish', payload: { manual: true } });
  bus.emit('domain', { type: 'game:status', gameId: String(game._id), status: 'finished' });
}

export async function reopenGame(game: GameDoc): Promise<void> {
  if (game.status !== 'finished') throw err('BAD_TRANSITION', `Cannot reopen from ${game.status}`, 409);
  game.status = 'live';
  game.finishedAt = null;
  await game.save();
  await AuditLog.create({ gameId: game._id, actor: 'admin', action: 'reopen', payload: {} });
  bus.emit('domain', { type: 'game:status', gameId: String(game._id), status: 'live' });
}

/** Rehearsal reset: clears Draws + WinEvents, back to ready. Keeps players/cards/PINs/audit. */
export async function resetGame(game: GameDoc): Promise<void> {
  const gameId = game._id as Types.ObjectId;
  await Draw.deleteMany({ gameId });
  await WinEvent.deleteMany({ gameId });
  game.status = 'ready';
  game.startedAt = null;
  game.finishedAt = null;
  await game.save();
  await AuditLog.create({ gameId, actor: 'admin', action: 'reset', payload: {} });
  bus.emit('domain', { type: 'game:status', gameId: String(gameId), status: 'ready' });
  bus.emit('domain', { type: 'admin:snapshot', gameId: String(gameId) });
}

/**
 * Full wipe: deletes EVERYTHING under this game (players, cards, PINs, draws,
 * wins) and returns it to empty setup. Allowed in any status — the typed
 * WIPE confirmation is the guard. Audit keeps one 'wipe' entry as the trail.
 */
export async function wipeGame(game: GameDoc): Promise<void> {
  const gameId = game._id as Types.ObjectId;
  await Draw.deleteMany({ gameId });
  await WinEvent.deleteMany({ gameId });
  await Card.deleteMany({ gameId });
  await Player.deleteMany({ gameId });
  clearPins(String(gameId));
  game.status = 'setup';
  game.cardsLockedAt = null;
  game.startedAt = null;
  game.finishedAt = null;
  game.generationStats = null;
  await game.save();
  await AuditLog.create({ gameId, actor: 'admin', action: 'wipe', payload: {} });
  bus.emit('domain', { type: 'game:status', gameId: String(gameId), status: 'setup' });
  bus.emit('domain', { type: 'admin:snapshot', gameId: String(gameId) });
}
/** Delete the game record entirely (and everything under it) so a brand new game can be created. Allowed in any status — typed DELETE confirmation is the guard. Audit keeps one `delete_game` entry first, then clears this game’s audit too. */
export async function deleteGame(game: GameDoc): Promise<void> {
  const gameId = game._id as Types.ObjectId;
  await AuditLog.create({ gameId, actor: 'admin', action: 'delete_game', payload: {} });
  await Draw.deleteMany({ gameId });
  await WinEvent.deleteMany({ gameId });
  await Card.deleteMany({ gameId });
  await Player.deleteMany({ gameId });
  await AuditLog.deleteMany({ gameId });
  clearPins(String(gameId));
  await Game.deleteOne({ _id: gameId });
  bus.emit('domain', { type: 'game:status', gameId: String(gameId), status: 'deleted' });
  bus.emit('domain', { type: 'admin:snapshot', gameId: String(gameId) });
}
