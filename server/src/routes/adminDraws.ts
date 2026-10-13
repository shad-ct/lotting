import { Router } from 'express';
import { drawSchema, undoSchema } from '@lotto/shared/schemas.js';
import { requireAdmin } from '../middleware/auth.js';
import { requireGame } from '../middleware/requireGame.js';
import { drawLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import { Draw } from '../models/Draw.js';
import { getIdempotentResponse, setIdempotentResponse } from '../services/idempotency.js';
import { manualDraw, randomDraw, undoLastDraw } from '../services/drawService.js';

const router = Router();
router.use(requireAdmin);
router.use(requireGame);

function idempotencyKey(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const h = req.headers['idempotency-key'];
  const key = Array.isArray(h) ? h[0] : h;
  return typeof key === 'string' && key.length > 0 && key.length <= 128 ? key : null;
}

router.post('/draws', drawLimiter, validateBody(drawSchema), async (req, res, next) => {
  try {
    const key = idempotencyKey(req);
    if (key) {
      const replay = getIdempotentResponse(req.auth!.sub, key);
      if (replay) {
        res.status(replay.status).json(replay.body);
        return;
      }
    }
    const result = await manualDraw(req.game!, (req.body as { number: number }).number);
    if (key) setIdempotentResponse(req.auth!.sub, key, 201, result);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/draws/random', drawLimiter, async (req, res, next) => {
  try {
    const key = idempotencyKey(req);
    if (key) {
      const replay = getIdempotentResponse(req.auth!.sub, key);
      if (replay) {
        res.status(replay.status).json(replay.body);
        return;
      }
    }
    const result = await randomDraw(req.game!);
    if (key) setIdempotentResponse(req.auth!.sub, key, 201, result);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/draws/undo', drawLimiter, validateBody(undoSchema), async (req, res, next) => {
  try {
    const result = await undoLastDraw(req.game!, (req.body as { reason?: string }).reason);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/draws', async (req, res, next) => {
  try {
    const items = await Draw.find({ gameId: req.game!._id }).sort({ seq: 1 }).lean();
    res.json({
      items: items.map((d) => ({
        seq: d.seq,
        number: d.number,
        source: d.source,
        drawnAt: d.drawnAt,
        isActive: d.isActive,
        undoneAt: d.undoneAt,
        undoReason: d.undoReason,
      })),
      total: items.length,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
