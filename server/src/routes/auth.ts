import { Router } from 'express';
import { z } from 'zod';
import { AdminUser } from '../models/AdminUser.js';
import { Player } from '../models/Player.js';
import { isLocked, recordFailure, recordSuccess } from '../services/lockout.js';
import { getCurrentGame } from '../services/progressService.js';
import { err } from '../utils/errors.js';
import { cookieOptions, signToken, TOKEN_COOKIE } from '../utils/jwt.js';
import { verifySecret } from '../utils/password.js';
import { validateBody } from '../middleware/validate.js';
import { loginLimiter } from '../middleware/rateLimit.js';

const router = Router();

const GENERIC = 'Invalid credentials';

const adminLoginSchema = z.object({ username: z.string(), password: z.string() }).strict();
const playerLoginSchema = z.object({ loginId: z.string(), pin: z.string() }).strict();

function wantsTokenBody(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const h = req.headers['x-client'];
  return (Array.isArray(h) ? h[0] : h)?.toLowerCase() === 'mobile';
}

async function currentGameIdFor(playerGameId: string): Promise<string> {
  const game = await getCurrentGame();
  return game ? String(game._id) : playerGameId;
}

router.post('/admin/login', loginLimiter, validateBody(adminLoginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    const key = `admin:${username}`;
    if (isLocked(key)) {
      throw err('ACCOUNT_LOCKED', 'Too many failed attempts, try again later', 429);
    }
    const admin = await AdminUser.findOne({ username });
    const ok = admin ? await verifySecret(admin.passwordHash, password) : false;
    if (!admin || !ok) {
      recordFailure(key);
      throw err('INVALID_CREDENTIALS', GENERIC, 401);
    }
    recordSuccess(key);
    const game = await getCurrentGame();
    const token = signToken({ sub: String(admin._id), role: 'admin', gameId: game ? String(game._id) : '' });
    res.cookie(TOKEN_COOKIE, token, cookieOptions());
    res.json({ role: 'admin', ...(wantsTokenBody(req) ? { token } : {}) });
  } catch (e) {
    next(e);
  }
});

router.post('/player/login', loginLimiter, validateBody(playerLoginSchema), async (req, res, next) => {
  try {
    const { loginId, pin } = req.body as { loginId: string; pin: string };
    const key = `player:${loginId}`;
    if (isLocked(key)) {
      throw err('ACCOUNT_LOCKED', 'Too many failed attempts, try again later', 429);
    }
    // Case-insensitive loginId; same generic error for unknown id vs wrong PIN.
    const player = await Player.findOne({ loginId: { $regex: `^${escapeRegExp(loginId)}$`, $options: 'i' } });
    const ok = player?.pinHash ? await verifySecret(player.pinHash, pin) : false;
    if (!player || !ok) {
      recordFailure(key);
      throw err('INVALID_CREDENTIALS', GENERIC, 401);
    }
    recordSuccess(key);
    const gameId = await currentGameIdFor(String(player.gameId));
    const token = signToken({ sub: String(player._id), role: 'player', gameId });
    res.cookie(TOKEN_COOKIE, token, cookieOptions());
    res.json({
      role: 'player',
      player: { serial: player.serial, name: player.name },
      ...(wantsTokenBody(req) ? { token } : {}),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/me', async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required', details: {} } });
    return;
  }
  if (req.auth.role === 'player') {
    const player = await Player.findById(req.auth.playerId).select('serial name loginId').lean();
    res.json({ role: 'player', player });
    return;
  }
  res.json({ role: 'admin' });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
  res.json({ ok: true });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default router;
