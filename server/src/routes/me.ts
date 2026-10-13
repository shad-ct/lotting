import { Router } from 'express';
import { rankBucket } from '@lotto/shared/types.js';
import { Card } from '../models/Card.js';
import { Draw } from '../models/Draw.js';
import { Player } from '../models/Player.js';
import { WinEvent } from '../models/WinEvent.js';
import { requirePlayer } from '../middleware/auth.js';
import { renderCard, renderUnmarkedCached } from '../services/cardImage/renderCard.js';
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
    // Confirmed winners (if any) — same public info as the board banner,
    // so every logged-in player sees who won.
    const confirmed = await WinEvent.find({ gameId, status: 'confirmed' }).select('playerIds').lean();
    const winnerIds = confirmed.flatMap((e) => e.playerIds.map(String));
    const winners =
      winnerIds.length > 0
        ? await Player.find({ _id: { $in: winnerIds } }).select('serial name').lean()
        : [];
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
      winners: winners.map((w) => ({ serial: w.serial, name: w.name })),
    });
  } catch (e) {
    next(e);
  }
});

/** GET /me/card/image — the caller's own card PNG (?marked=1 for live marks). */
router.get('/card/image', requirePlayer, async (req, res, next) => {
  try {
    const player = await Player.findById(req.auth!.playerId);
    if (!player) throw err('UNAUTHORIZED', 'Player not found', 401);
    const gameId = player.gameId;
    const { Game } = await import('../models/Game.js');
    const game = await Game.findById(gameId);
    if (!game) throw err('NO_ACTIVE_GAME', 'No game exists yet', 404);
    const card = await Card.findOne({ gameId, serial: player.serial });
    if (!card) throw err('CARD_NOT_READY', 'Card not generated yet', 409);
    const base = {
      gameName: game.name,
      serial: player.serial,
      playerName: player.name,
      loginId: player.loginId,
      grid: card.grid as number[],
      verifyCode: card.verifyCode,
      appUrl: game.appUrl || '',
    };
    const buf =
      req.query.marked === '1'
        ? renderCard({
            ...base,
            drawn: new Set(
              (await Draw.find({ gameId, isActive: true }).select('number').lean()).map((d) => d.number),
            ),
          })
        : renderUnmarkedCached(base);
    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

export default router;
