import { MemoryStore, rateLimit } from 'express-rate-limit';

const loginStore = new MemoryStore();
const drawStore = new MemoryStore();
const generalStore = new MemoryStore();

/** Login: 10 attempts / 15 min / IP+loginId (02 §1). */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  store: loginStore,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body as { loginId?: string; username?: string };
    const id = String(body?.loginId ?? body?.username ?? '').toLowerCase();
    return `${req.ip ?? 'unknown'}:${id}`;
  },
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later', details: {} } });
  },
});

/** Draw endpoints: 30 / min (02 §1). */
export const drawLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  store: drawStore,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', details: {} } });
  },
});

/** Everything else: generous. */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  store: generalStore,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', details: {} } });
  },
});

/** Test hook: clear all in-memory rate-limit counters. */
export async function resetRateLimits(): Promise<void> {
  await Promise.all([loginStore.resetAll(), drawStore.resetAll(), generalStore.resetAll()]);
}
