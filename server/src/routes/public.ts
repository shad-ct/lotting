import { Router } from 'express';
import { Draw } from '../models/Draw.js';
import { Player } from '../models/Player.js';
import { WinEvent } from '../models/WinEvent.js';
import { requireGame } from '../middleware/requireGame.js';

const router = Router();

/**
 * GET /public/board — no auth, no PII beyond confirmed winners' names.
 * Winners appear ONLY after admin confirmation.
 */
router.get('/board', requireGame, async (req, res, next) => {
  try {
    const game = req.game!;
    const gameId = game._id;
    const draws = await Draw.find({ gameId, isActive: true }).sort({ seq: 1 }).select('seq number').lean();
    const confirmed = await WinEvent.find({ gameId, status: 'confirmed' }).select('playerIds').lean();
    const winnerIds = confirmed.flatMap((e) => e.playerIds.map(String));
    const winners =
      winnerIds.length > 0
        ? await Player.find({ _id: { $in: winnerIds } }).select('serial name').lean()
        : [];
    const drawn = draws.map((d) => ({ seq: d.seq, number: d.number }));
    const last = drawn.length > 0 ? drawn[drawn.length - 1] : null;
    res.json({
      game: { name: game.name, status: game.status, maxNumber: game.maxNumber },
      drawn,
      lastDrawn: last ? { seq: last.seq, number: last.number } : null,
      drawCount: drawn.length,
      winners: winners.map((w) => ({ serial: w.serial, name: w.name })),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
