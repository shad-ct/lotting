import { Router } from 'express';
import {
  confirmResetSchema,
  confirmTrueSchema,
  confirmWipeSchema,
  createGameSchema,
  updateGameSchema,
} from '@lotto/shared/schemas.js';
import { CROSS_WIN_RULES, DEFAULT_WIN_RULES } from '@lotto/shared/types.js';
import { requireAdmin } from '../middleware/auth.js';
import { requireGame } from '../middleware/requireGame.js';
import { validateBody } from '../middleware/validate.js';
import { AuditLog } from '../models/AuditLog.js';
import { Game } from '../models/Game.js';
import { env } from '../config/env.js';
import { deleteGame, finishGame, generateCardsForGame, lockCards, reopenGame, resetGame, startGame, wipeGame } from '../services/gameService.js';
import { bus } from '../services/events.js';
import { getCurrentGame } from '../services/progressService.js';
import { err } from '../utils/errors.js';

const router = Router();
router.use(requireAdmin);

function shapeGame(game: {
  _id: unknown;
  name: string;
  status: string;
  maxNumber: number;
  cardSize: number;
  playerCount: number;
  gameMode?: string;
  maxPrizePlaces?: number;
  winRules: unknown;
  cardsLockedAt: unknown;
  startedAt: unknown;
  finishedAt: unknown;
  generationStats: unknown;
  showExactRankToPlayers: boolean;
  closeThreshold: number;
}): object {
  return {
    id: String(game._id),
    name: game.name,
    status: game.status,
    maxNumber: game.maxNumber,
    cardSize: game.cardSize,
    playerCount: game.playerCount,
    gameMode: game.gameMode ?? 'housefull',
    maxPrizePlaces: game.maxPrizePlaces ?? 3,
    winRules: game.winRules,
    cardsLockedAt: game.cardsLockedAt,
    startedAt: game.startedAt,
    finishedAt: game.finishedAt,
    generationStats: game.generationStats,
    showExactRankToPlayers: game.showExactRankToPlayers,
    closeThreshold: game.closeThreshold,
  };
}

router.get('/game', async (_req, res, next) => {
  try {
    const game = await getCurrentGame();
    if (!game) throw err('NO_ACTIVE_GAME', 'No game exists yet', 404);
    res.json(shapeGame(game));
  } catch (e) {
    next(e);
  }
});

/** Create a game — only when none exists or the previous one finished. */
router.post('/game', validateBody(createGameSchema), async (req, res, next) => {
  try {
    const latest = await getCurrentGame();
    if (latest && latest.status !== 'finished') {
      throw err('GAME_IN_PROGRESS', 'A game is already in progress', 409, { status: latest.status });
    }
  const body = req.body as { name: string; maxNumber: number; cardSize: number; playerCount: number; gameMode?: 'housefull' | 'cross'; maxPrizePlaces?: number; winRules?: object };
    if (body.cardSize > body.maxNumber) {
      throw err('IMPOSSIBLE_CONFIG', 'cardSize cannot exceed maxNumber', 422);
    }
    // Auto-apply win rules based on game mode (unless caller supplies explicit winRules).
    const gameMode = body.gameMode ?? 'housefull';
    const defaultRules = gameMode === 'cross' ? CROSS_WIN_RULES : DEFAULT_WIN_RULES;
    const game = await Game.create({
      name: body.name,
      maxNumber: body.maxNumber,
      cardSize: body.cardSize,
      playerCount: body.playerCount,
      gameMode,
      maxPrizePlaces: body.maxPrizePlaces ?? 3,
      winRules: body.winRules ? body.winRules : defaultRules,
      appUrl: env.APP_URL,
      defaultCountryCode: env.DEFAULT_COUNTRY_CODE,
    });
    // New game becomes the current one everywhere: push clients to resync.
    bus.emit('domain', { type: 'game:status', gameId: String(game._id), status: 'setup' });
    bus.emit('domain', { type: 'admin:snapshot', gameId: String(game._id) });
    res.status(201).json(shapeGame(game));
  } catch (e) {
    next(e);
  }
});

/** Update name / winRules — only while setup. */
router.patch('/game', validateBody(updateGameSchema), requireGame, async (req, res, next) => {
  try {
    const game = req.game!;
    if (game.status !== 'setup') throw err('GAME_LOCKED', 'Game can only be edited while in setup', 409);
    const body = req.body as { name?: string; winRules?: object };
    if (body.name != null) game.name = body.name;
    if (body.winRules != null) game.winRules = { ...(game.winRules as object), ...body.winRules };
    await game.save();
    res.json(shapeGame(game));
  } catch (e) {
    next(e);
  }
});

router.post('/cards/generate', requireGame, async (req, res, next) => {
  try {
    const stats = await generateCardsForGame(req.game!, env.CARD_HMAC_SECRET);
    res.status(201).json({ stats });
  } catch (e) {
    if ((e as { code?: string }).code === 'CARDS_LOCKED') {
      return next(err('CARDS_LOCKED', 'Cards are locked and cannot be regenerated', 409));
    }
    next(e);
  }
});

router.post('/cards/lock', requireGame, async (req, res, next) => {
  try {
    await lockCards(req.game!);
    res.json({ ok: true, status: 'ready' });
  } catch (e) {
    next(e);
  }
});

router.post('/game/start', requireGame, async (req, res, next) => {
  try {
    await startGame(req.game!);
    res.json({ ok: true, status: 'live' });
  } catch (e) {
    next(e);
  }
});

router.post('/game/finish', requireGame, async (req, res, next) => {
  try {
    await finishGame(req.game!);
    res.json({ ok: true, status: 'finished' });
  } catch (e) {
    next(e);
  }
});

router.post('/game/reopen', validateBody(confirmTrueSchema), requireGame, async (req, res, next) => {
  try {
    await reopenGame(req.game!);
    res.json({ ok: true, status: 'live' });
  } catch (e) {
    next(e);
  }
});

/** Rehearsal reset — typed confirmation "RESET". */
router.post('/game/reset', validateBody(confirmResetSchema), requireGame, async (req, res, next) => {
  try {
    await resetGame(req.game!);
    res.json({ ok: true, status: 'ready' });
  } catch (e) {
    next(e);
  }
});

/** Full wipe — typed confirmation "WIPE". Deletes everything in this game. */
router.post('/game/wipe', validateBody(confirmWipeSchema), requireGame, async (req, res, next) => {
  try {
    await wipeGame(req.game!);
    res.json({ ok: true, status: 'setup' });
  } catch (e) {
    next(e);
  }
});

router.delete('/game', validateBody(confirmTrueSchema), requireGame, async (req, res, next) => {
  try {
    await deleteGame(req.game!);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/audit', requireGame, async (req, res, next) => {
  try {
    const items = await AuditLog.find({ gameId: req.game!._id }).sort({ at: -1 }).limit(500).lean();
    res.json({ items, total: items.length });
  } catch (e) {
    next(e);
  }
});

export default router;
