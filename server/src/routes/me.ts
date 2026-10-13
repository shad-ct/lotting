import { Router } from 'express';
import { rankBucket } from '@lotto/shared/types.js';
import { Card } from '../models/Card.js';
import { Player } from '../models/Player.js';
import { requirePlayer } from '../middleware/auth.js';
import { getProgress } from '../services/progressService.js';
import { err } from '../utils/errors.js';

const router = Router();

/** GET /me/card — the caller's own card only (player derived from token). */
router.get('/card', requirePlayer, async (req, res, next) => {
  try {
    const player = await Player.findById(req.auth!.playerId);
    if (!player) throw err('UNAUTHORIZED', 'Player not found', 401);
    const gameId = player.gameId;
    const { Game } = await import('../models/Game.js');
    const game = await Game.findById(gameId);
    if (!game) throw err('NO_ACTIVE_GAME', 'No game exists yet', 404);
    const card = await Card.findOne({ gameId, serial: player.serial });
    if (!card) throw err('CARD_NOT_READY', 'Card not generated yet', 409);

    const { progress } = await getProgress(game);
    const me = progress.players.find((p) => p.serial === player.serial);
    if (!me) throw err('CARD_NOT_READY', 'Card not generated yet', 409);

    const totalPlayers = progress.players.length;
    res.json({
      serial: player.serial,
      name: player.name,
      grid: card.grid,
      marked: me.marked,
      markedCount: me.markedCount,
      remaining: me.remaining,
      remainingCount: me.remainingCount,
      rank: game.showExactRankToPlayers ? me.rank : null,
      rankLabel: game.showExactRankToPlayers ? `#${me.rank}` : rankBucket(me.rank, totalPlayers),
      totalPlayers,
      isWinner: me.completedAtSeq != null,
      completedAtSeq: me.completedAtSeq,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
