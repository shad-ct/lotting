import { Router } from 'express';
import { verifyClaimSchema } from '@lotto/shared/schemas.js';
import { requireAdmin } from '../middleware/auth.js';
import { requireGame } from '../middleware/requireGame.js';
import { validateBody } from '../middleware/validate.js';
import { Card } from '../models/Card.js';
import { Draw } from '../models/Draw.js';
import { Player } from '../models/Player.js';
import { WinEvent } from '../models/WinEvent.js';
import { getProgress } from '../services/progressService.js';
import { err } from '../utils/errors.js';

const router = Router();
router.use(requireAdmin);
router.use(requireGame);

/** GET /admin/status — the whole dashboard snapshot in one call (02 §6). */
router.get('/status', async (req, res, next) => {
  try {
    const game = req.game!;
    const gameId = game._id;
    const full = req.query.full === '1';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'rank';

    const { ctx, progress } = await getProgress(game);
    const players = await Player.find({ gameId }).lean();
    const bySerial = new Map(players.map((p) => [p.serial, p]));

    let rows = progress.players.map((p) => {
      const doc = bySerial.get(p.serial);
      return {
        id: doc ? String(doc._id) : null,
        serial: p.serial,
        name: p.name,
        loginId: doc?.loginId ?? null,
        phone: doc?.phone ?? null,
        isActive: p.isActive,
        markedCount: p.markedCount,
        remainingCount: p.remainingCount,
        rank: p.rank,
        isTie: p.isTie,
        completedAtSeq: p.completedAtSeq,
        ...(p.remainingCount <= 5 || full ? { remainingNumbers: p.remaining } : {}),
        cardImageSentAt: doc?.cardImageSentAt ?? null,
        credentialsSentAt: doc?.credentialsSentAt ?? null,
      };
    });

    if (q) {
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(q) || String(r.serial).includes(q),
      );
    }
    const sorters: Record<string, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
      rank: (a, b) => a.rank - b.rank || a.serial - b.serial,
      serial: (a, b) => a.serial - b.serial,
      name: (a, b) => a.name.localeCompare(b.name),
      marks: (a, b) => b.markedCount - a.markedCount || a.rank - b.rank,
    };
    rows.sort(sorters[sort] ?? sorters.rank);

    const confirmedEvents = await WinEvent.find({ gameId, status: 'confirmed' }).lean();
    const pendingEvents = await WinEvent.find({ gameId, status: 'pending' }).lean();
    const playerById = new Map(players.map((p) => [String(p._id), p]));
    const shapeEvent = (e: (typeof confirmedEvents)[number]) => ({
      id: String(e._id),
      rule: e.rule,
      placing: e.placing,
      drawSeq: e.drawSeq,
      status: e.status,
      players: e.playerIds.map((id: unknown) => {
        const p = playerById.get(String(id));
        return { serial: p?.serial ?? null, name: p?.name ?? 'Unknown' };
      }),
    });

    const lastDraw = ctx.draws.length > 0 ? ctx.draws[ctx.draws.length - 1] : null;
    res.json({
      game: {
        id: String(gameId),
        name: game.name,
        status: game.status,
        maxNumber: game.maxNumber,
        cardSize: game.cardSize,
        startedAt: game.startedAt,
      },
      drawn: {
        count: ctx.draws.length,
        remaining: game.maxNumber - ctx.draws.length,
        lastDrawn: lastDraw ? { seq: lastDraw.seq, number: lastDraw.number } : null,
        sequence: ctx.draws.map((d) => d.number),
      },
      players: rows,
      leaderboard: rows.slice(0, 10),
      closeToWin: progress.closeToWin.map((p) => ({
        serial: p.serial,
        name: p.name,
        remainingCount: p.remainingCount,
        remaining: p.remaining,
      })),
      hotNumbers: progress.hotNumbers,
      histogram: progress.histogram,
      winners: {
        detected: pendingEvents.map(shapeEvent),
        confirmed: confirmedEvents.map(shapeEvent),
        prizes: [...pendingEvents, ...confirmedEvents].map(shapeEvent),
      },
      generationStats: game.generationStats,
    });
  } catch (e) {
    next(e);
  }
});

/** POST /admin/verify-claim — physical "HOUSIE!" check against server-side cards. */
router.post('/verify-claim', validateBody(verifyClaimSchema), async (req, res, next) => {
  try {
    const game = req.game!;
    const gameId = game._id;
    const body = req.body as { serial?: number; verifyCode?: string; loginId?: string };
    let card = null;
    if (body.serial != null) {
      card = await Card.findOne({ gameId, serial: body.serial }).lean();
    } else if (body.verifyCode != null) {
      card = await Card.findOne({ gameId, verifyCode: body.verifyCode.toUpperCase() }).lean();
    } else if (body.loginId != null) {
      const player = await Player.findOne({
        gameId,
        loginId: { $regex: `^${body.loginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      }).lean();
      if (player) card = await Card.findOne({ gameId, serial: player.serial }).lean();
    }
    if (!card) throw err('CARD_NOT_FOUND', 'No card matches that claim', 404);
    const draws = await Draw.find({ gameId, isActive: true }).select('number').lean();
    const drawnSet = new Set(draws.map((d) => d.number));
    const grid = card.grid as number[];
    const missing = grid.filter((n) => !drawnSet.has(n));
    const player = await Player.findOne({ gameId, serial: card.serial }).select('name serial').lean();
    res.json({
      valid: missing.length === 0,
      serial: card.serial,
      name: player?.name ?? null,
      grid,
      drawn: grid.filter((n) => drawnSet.has(n)),
      missing,
      message:
        missing.length === 0
          ? 'All 16 numbers drawn — valid claim'
          : `Missing ${missing.length}: ${missing.join(', ')}`,
    });
  } catch (e) {
    next(e);
  }
});

/** GET /admin/export/standings.csv — rank table as CSV. */
router.get('/export/standings.csv', async (req, res, next) => {
  try {
    const { progress } = await getProgress(req.game!);
    const lines = ['serial,name,markedCount,remainingCount,rank,isTie,completedAtSeq'];
    for (const p of progress.players) {
      const name = `"${p.name.replace(/"/g, '""')}"`;
      lines.push(`${p.serial},${name},${p.markedCount},${p.remainingCount},${p.rank},${p.isTie},${p.completedAtSeq ?? ''}`);
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="standings.csv"');
    res.send(lines.join('\n'));
  } catch (e) {
    next(e);
  }
});

export default router;
