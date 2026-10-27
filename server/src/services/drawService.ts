import { randomInt } from 'node:crypto';
import type { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { Draw } from '../models/Draw.js';
import { Game, type GameDoc } from '../models/Game.js';
import { Player } from '../models/Player.js';
import { WinEvent } from '../models/WinEvent.js';
import { ApiError, err, isDuplicateKeyError } from '../utils/errors.js';
import { bus } from './events.js';
import { getProgress, loadContext, winRulesOf } from './progressService.js';
import { detectNewlySatisfied, recordWinEvents, withdrawPendingForDraw } from './winService.js';

/**
 * Draw logic (02 §4). Concurrency safety comes from the DB unique indexes:
 * - same number twice → partial unique (gameId, number)|active rejects → 409
 * - same seq twice (two concurrent requests) → unique (gameId, seq) rejects → recompute & retry
 */

async function nextSeq(gameId: Types.ObjectId): Promise<number> {
  const last = await Draw.findOne({ gameId }).sort({ seq: -1 }).select('seq').lean();
  return (last?.seq ?? 0) + 1;
}

async function activeDrawNumbers(gameId: Types.ObjectId): Promise<Set<number>> {
  const draws = await Draw.find({ gameId, isActive: true }).select('number').lean();
  return new Set(draws.map((d) => d.number));
}

export interface DrawResult {
  draw: { seq: number; number: number; source: string; drawnAt: Date };
  lastDrawn: { seq: number; number: number };
  drawCount: number;
  newWinners: { eventId: string; rule: string; placing: number; players: { serial: number; name: string }[] }[];
}

async function insertDraw(
  game: GameDoc,
  gameId: Types.ObjectId,
  number: number,
  source: 'manual' | 'random',
): Promise<{ seq: number; drawnAt: Date }> {
  // NOTE (deviation from 02 §4.1's "3 retries", documented in PROGRESS.md):
  // N-way concurrent draws all read the same max seq, so only one wins each
  // round and the rest must recompute. 3 retries cannot converge 20
  // concurrent requests (acceptance gate 02 §12 item 2); retry up to 25
  // times with a tiny jittered backoff. Safety still comes from the DB
  // unique indexes, not from the retry count.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    const seq = await nextSeq(gameId);
    try {
      const doc = await Draw.create({ gameId, seq, number, source, isActive: true });
      return { seq: doc.seq, drawnAt: doc.drawnAt };
    } catch (e) {
      if (!isDuplicateKeyError(e)) throw e;
      // Which index fired? Check whether the number is already actively drawn.
      const existing = await Draw.findOne({ gameId, number, isActive: true }).select('seq').lean();
      if (existing) {
        throw err('NUMBER_ALREADY_DRAWN', `Number ${number} was already drawn`, 409, {
          number,
          seq: existing.seq,
        });
      }
      // Otherwise it was a seq race — back off, recompute and retry.
      lastError = e;
      await new Promise((r) => setTimeout(r, randomInt(1, 6)));
    }
  }
  throw lastError ?? err('DRAW_FAILED', 'Could not record draw', 500);
}

function requireLive(game: GameDoc): void {
  if (game.status !== 'live') {
    throw err('GAME_NOT_LIVE', `Game is ${game.status}; draws require a live game`, 409, {
      status: game.status,
    });
  }
}

async function afterDraw(
  game: GameDoc,
  gameId: Types.ObjectId,
  seq: number,
  number: number,
  source: string,
  drawnBefore: Set<number>,
): Promise<DrawResult> {
  const drawnAfter = new Set(drawnBefore);
  drawnAfter.add(number);
  const { progress } = await getProgress(game);
  void progress;

  // Winner detection (before/after comparison so prizes record once).
  const ctx = await loadContext(game);
  const rules = winRulesOf(game);
  const byRule = detectNewlySatisfied(ctx.cards, drawnBefore, drawnAfter, rules);
  const playerIdBySerial = new Map<number, Types.ObjectId>();
  const players = await Player.find({ gameId }).select('_id serial').lean();
  for (const p of players) playerIdBySerial.set(p.serial, p._id);
  const newWinners = await recordWinEvents(gameId, seq, byRule, playerIdBySerial);

  const drawCount = ctx.draws.length;
  await AuditLog.create({ gameId, actor: 'admin', action: 'draw', payload: { seq, number, source } });

  const gid = String(gameId);
  bus.emit('domain', { type: 'draw:new', gameId: gid, seq, number, drawCount, source });
  bus.emit('domain', { type: 'admin:snapshot', gameId: gid });
  if (newWinners.length > 0) {
    bus.emit('domain', { type: 'win:detected', gameId: gid, events: newWinners });
  }

  return {
    draw: { seq, number, source, drawnAt: new Date() },
    lastDrawn: { seq, number },
    drawCount,
    newWinners,
  };
}

export async function manualDraw(game: GameDoc, rawNumber: unknown): Promise<DrawResult> {
  requireLive(game);
  const gameId = game._id as Types.ObjectId;
  if (typeof rawNumber !== 'number' || !Number.isInteger(rawNumber) || rawNumber < 1 || rawNumber > (game.maxNumber ?? 110)) {
    throw err('INVALID_NUMBER', `Number must be an integer 1..${game.maxNumber ?? 110}`, 422, {
      number: rawNumber,
    });
  }
  const drawnBefore = await activeDrawNumbers(gameId);
  const { seq } = await insertDraw(game, gameId, rawNumber, 'manual');
  return afterDraw(game, gameId, seq, rawNumber, 'manual', drawnBefore);
}

export async function randomDraw(game: GameDoc): Promise<DrawResult> {
  requireLive(game);
  const gameId = game._id as Types.ObjectId;
  const maxNumber = game.maxNumber ?? 110;
  for (let attempt = 0; attempt < 5; attempt++) {
    const drawn = await activeDrawNumbers(gameId);
    const pool: number[] = [];
    for (let n = 1; n <= maxNumber; n++) if (!drawn.has(n)) pool.push(n);
    if (pool.length === 0) throw err('ALL_NUMBERS_DRAWN', 'All numbers have been drawn', 409);
    const pick = pool[randomInt(pool.length)];
    try {
      const { seq } = await insertDraw(game, gameId, pick, 'random');
      return await afterDraw(game, gameId, seq, pick, 'random', drawn);
    } catch (e) {
      // NUMBER_ALREADY_DRAWN from a race → re-pick and retry; anything else rethrows.
      if (e instanceof ApiError && e.code === 'NUMBER_ALREADY_DRAWN') continue;
      throw e;
    }
  }
  throw err('DRAW_FAILED', 'Could not complete random draw after retries', 500);
}

export interface UndoResult {
  undone: { seq: number; number: number };
  drawCount: number;
  withdrawnWins: number;
}

export async function undoLastDraw(game: GameDoc, reason?: string): Promise<UndoResult> {
  const gameId = game._id as Types.ObjectId;
  const latest = await Draw.findOne({ gameId, isActive: true }).sort({ seq: -1 });
  if (!latest) throw err('NOTHING_TO_UNDO', 'No draws to undo', 409);

  // A confirmed win that finished the game blocks undo until reopen.
  const confirmedForDraw = await WinEvent.findOne({
    gameId,
    drawSeq: latest.seq,
    status: 'confirmed',
  });
  if (confirmedForDraw && game.status === 'finished') {
    throw err(
      'WINNER_CONFIRMED_REOPEN_FIRST',
      'A winner from this draw is confirmed and the game is finished — reopen first',
      409,
      { drawSeq: latest.seq },
    );
  }

  latest.isActive = false;
  latest.undoneAt = new Date();
  latest.undoReason = reason ?? null;
  await latest.save();

  const withdrawnWins = await withdrawPendingForDraw(gameId, latest.seq);
  const remaining = await Draw.countDocuments({ gameId, isActive: true });
  await AuditLog.create({
    gameId,
    actor: 'admin',
    action: 'undo',
    payload: { seq: latest.seq, number: latest.number, reason: reason ?? null, withdrawnWins },
  });

  const gid = String(gameId);
  bus.emit('domain', { type: 'draw:undone', gameId: gid, seq: latest.seq, number: latest.number, drawCount: remaining });
  bus.emit('domain', { type: 'admin:snapshot', gameId: gid });

  return { undone: { seq: latest.seq, number: latest.number }, drawCount: remaining, withdrawnWins };
}

export async function confirmWin(gameId: Types.ObjectId, eventId: string): Promise<{ placing: number; finished: boolean }> {
  const ev = await WinEvent.findOne({ _id: eventId, gameId });
  if (!ev) throw err('WIN_NOT_FOUND', 'Win event not found', 404);
  if (ev.status !== 'pending') throw err('WIN_ALREADY_RESOLVED', `Win is ${ev.status}`, 409, { status: ev.status });
  ev.status = 'confirmed';
  ev.confirmedAt = new Date();
  ev.resolvedAt = new Date();
  await ev.save();

  const game = await Game.findById(gameId);
  let finished = false;
  if (game && game.status === 'live') {
    // Count all confirmed win events (including the one we just confirmed).
    const confirmedCount = await WinEvent.countDocuments({ gameId, status: 'confirmed' });
    const maxPrizePlaces = (game.maxPrizePlaces as number | undefined) ?? 3;
    if (confirmedCount >= maxPrizePlaces) {
      game.status = 'finished';
      game.finishedAt = new Date();
      await game.save();
      finished = true;
      await AuditLog.create({ gameId, actor: 'admin', action: 'finish', payload: { reason: 'all-prizes-awarded', eventId, confirmedCount } });
    }
  }
  await AuditLog.create({ gameId, actor: 'admin', action: 'confirm_win', payload: { eventId } });
  const gid = String(gameId);
  bus.emit('domain', { type: 'win:confirmed', gameId: gid, events: [{ eventId, placing: ev.placing }] });
  bus.emit('domain', { type: 'game:status', gameId: gid, status: game?.status ?? 'live' });
  bus.emit('domain', { type: 'admin:snapshot', gameId: gid });
  return { placing: ev.placing, finished };
}

export async function rejectWin(gameId: Types.ObjectId, eventId: string): Promise<void> {
  const ev = await WinEvent.findOne({ _id: eventId, gameId });
  if (!ev) throw err('WIN_NOT_FOUND', 'Win event not found', 404);
  if (ev.status !== 'pending') throw err('WIN_ALREADY_RESOLVED', `Win is ${ev.status}`, 409, { status: ev.status });
  ev.status = 'rejected';
  ev.resolvedAt = new Date();
  await ev.save();
  await AuditLog.create({ gameId, actor: 'admin', action: 'reject_win', payload: { eventId } });
  bus.emit('domain', { type: 'admin:snapshot', gameId: String(gameId) });
}
