import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';

dotenv.config();

const app = express();
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  }),
);

app.get('/api/v1/health', (_req, res) => {
  res.json({ ok: true, service: 'lotto-server', phase: 'scaffold' });
});

// Placeholder router mount points (Phases 1-3 will fill these in):
// - /api/v1/auth/*, /api/v1/public/*, /api/v1/me/*, /api/v1/admin/*

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
});

const PORT = Number(process.env.PORT ?? 3001);
if (process.env.VITEST == null) {
  app.listen(PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`lotto server (scaffold) listening on :${PORT}`);
  });
}

export default app;
