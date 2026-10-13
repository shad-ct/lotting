import type { Types } from 'mongoose';
import { MAX_PLAYERS } from '@lotto/shared/constants.js';
import { defaultLoginId, generatePin, normalizePhone } from '@lotto/shared/credentials.js';
import { AuditLog } from '../models/AuditLog.js';
import { Card } from '../models/Card.js';
import { Draw } from '../models/Draw.js';
import type { GameDoc } from '../models/Game.js';
import { Player } from '../models/Player.js';
import { WinEvent } from '../models/WinEvent.js';
import { hashSecret } from '../utils/password.js';
import { err } from '../utils/errors.js';
import { bus } from './events.js';
import { assertRegenerable, clearCards, persistGeneratedCards } from './cardPersistence.js';
import { generateCards, newSeed } from './cardGenerator.js';
import { addPin, getPins, storePins } from './pinStore.js';
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
  inputs: { name: string; phone?: string | null }[],
): Promise<{ created: number; players: { serial: number; loginId: string; name: string }[] }> {
  const gameId = game._id as Types.ObjectId;
  // Hard cap: never more players than the game allows, and never more than
  // MAX_PLAYERS (110). Covers add-one and CSV/JSON import alike.
  const cap = Math.min(game.playerCount, MAX_PLAYERS);
  const current = await Player.countDocuments({ gameId });
  if (current + inputs.length > cap) {
    throw err(
      'PLAYER_LIMIT_REACHED',
      `Player limit reached (${current}/${cap}) — delete a player to add another`,
      409,
      { limit: cap, current, requested: inputs.length },
    );
  }
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
        throw err('INVALID_PHONE', `Invalid phone for ${input.name}`, 422, { name: input.name });
      }
    }
    try {
      const p = await Player.create({ gameId, serial, name: input.name, phone, loginId });
      out.push({ serial: p.serial, loginId: p.loginId, name: p.name });
      serial++;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        throw err('DUPLICATE_LOGIN_ID', `Login ID ${loginId} already exists`, 409, { loginId });
      }
      throw e;
    }
  }
  return { created: out.length, players: out };
}

/** Generate PINs for all players that have none. Returns ONE-TIME plain PINs. */
export async function generateCredentials(game: GameDoc): Promise<{ serial: number; name: string; loginId: string; pin: string }[]> {
  const gameId = game._id as Types.ObjectId;
  const players = await Player.find({ gameId, pinHash: null }).sort({ serial: 1 });
  const pins = new Map<string, string>();
  const out: { serial: number; name: string; loginId: string; pin: string }[] = [];
  for (const p of players) {
    const pin = generatePin();
    p.pinHash = await hashSecret(pin);
    await p.save();
    pins.set(String(p._id), pin);
    out.push({ serial: p.serial, name: p.name, loginId: p.loginId, pin });
  }
  if (out.length > 0) {
    const merged = new Map(getPins(String(gameId)) ?? []);
    for (const [k, v] of pins) merged.set(k, v);
    storePins(String(gameId), merged);
    await AuditLog.create({ gameId, actor: 'admin', action: 'reset_pin', payload: { scope: 'bulk', count: out.length } });
  }
  return out;
}

/** Reset one player's PIN. The old PIN dies immediately. */
export async function resetPin(game: GameDoc, playerId: string): Promise<{ serial: number; loginId: string; pin: string }> {
  const gameId = game._id as Types.ObjectId;
  const player = await Player.findOne({ _id: playerId, gameId });
  if (!player) throw err('PLAYER_NOT_FOUND', 'Player not found', 404);
  const pin = generatePin();
  player.pinHash = await hashSecret(pin);
  player.pinResetAt = new Date();
  await player.save();
  addPin(String(gameId), String(player._id), pin);
  await AuditLog.create({ gameId, actor: 'admin', action: 'reset_pin', payload: { playerId: String(player._id), serial: player.serial } });
  return { serial: player.serial, loginId: player.loginId, pin };
}

export async function generateCardsForGame(game: GameDoc, hmacSecret: string): Promise<object> {
  const gameId = game._id as Types.ObjectId;
  await assertRegenerable(gameId);
  const players = await Player.find({ gameId }).sort({ serial: 1 }).select('serial');
  if (players.length !== game.playerCount) {
    throw err('PLAYER_COUNT_MISMATCH', `Need ${game.playerCount} players, have ${players.length}`, 409, {
      need: game.playerCount,
      have: players.length,
    });
  }
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
  const [playerCount, cardCount, pinnless] = await Promise.all([
    Player.countDocuments({ gameId }),
    Card.countDocuments({ gameId }),
    Player.countDocuments({ gameId, pinHash: null }),
  ]);
  if (playerCount !== game.playerCount) {
    throw err('SETUP_INCOMPLETE', `Need ${game.playerCount} players, have ${playerCount}`, 409);
  }
  if (cardCount !== game.playerCount) {
    throw err('SETUP_INCOMPLETE', 'Every player needs a card before locking', 409);
  }
  if (pinnless > 0) {
    throw err('SETUP_INCOMPLETE', `${pinnless} players still need PINs`, 409);
  }
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
