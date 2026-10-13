import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { optionalAuth } from './middleware/auth.js';
import adminDraws from './routes/adminDraws.js';
import adminGame from './routes/adminGame.js';
import adminPlayers from './routes/adminPlayers.js';
import adminStatus from './routes/adminStatus.js';
import adminWins from './routes/adminWins.js';
import auth from './routes/auth.js';
import me from './routes/me.js';
import pub from './routes/public.js';
import { errorHandler } from './utils/errors.js';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(generalLimiter);
  app.use(optionalAuth);

  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true, service: 'lotto-server' });
  });

  app.use('/api/v1/auth', auth);
  app.use('/api/v1/public', pub);
  app.use('/api/v1/me', me);
  app.use('/api/v1/admin', adminGame);
  app.use('/api/v1/admin', adminPlayers);
  app.use('/api/v1/admin', adminDraws);
  app.use('/api/v1/admin', adminStatus);
  app.use('/api/v1/admin', adminWins);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found', details: {} } });
  });
  app.use(errorHandler);
  return app;
}

/** Redact PINs/passwords from objects before logging (no secrets in logs). */
export function redactSecrets(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(redactSecrets);
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = /pin|password/i.test(k) ? '[REDACTED]' : redactSecrets(v);
    }
    return out;
  }
  return obj;
}
