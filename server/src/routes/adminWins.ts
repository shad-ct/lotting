import { Router } from 'express';
import type { Types } from 'mongoose';
import { requireAdmin } from '../middleware/auth.js';
import { requireGame } from '../middleware/requireGame.js';
import { confirmWin, rejectWin } from '../services/drawService.js';

const router = Router();
router.use(requireAdmin);
router.use(requireGame);

router.post('/wins/:id/confirm', async (req, res, next) => {
  try {
    const result = await confirmWin(req.game!._id as Types.ObjectId, req.params.id);
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

router.post('/wins/:id/reject', async (req, res, next) => {
  try {
    await rejectWin(req.game!._id as Types.ObjectId, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
