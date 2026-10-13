import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AdminUser } from '../src/models/AdminUser.js';
import { hashSecret } from '../src/utils/password.js';
import { _resetIdempotency } from '../src/services/idempotency.js';
import { _resetLockouts } from '../src/services/lockout.js';
import { _resetPinStore } from '../src/services/pinStore.js';
import { _resetProgressCache } from '../src/services/progressService.js';
import { _resetRateLimitForTests } from './rateLimitHelper.js';

export let mongo: MongoMemoryServer;
export const app = createApp();
export const api = request(app);

export const ADMIN_USER = 'admin';
export const ADMIN_PASS = 'adminpass123';

export async function startMemoryDb(): Promise<void> {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}

export async function stopMemoryDb(): Promise<void> {
  await mongoose.disconnect();
  await mongo.stop();
}

export async function resetDb(): Promise<void> {
  await mongoose.connection.db?.dropDatabase();
  // dropDatabase removes indexes too — rebuild before any test so
  // duplicate-insert assertions never race background index creation.
  const { Card } = await import('../src/models/Card.js');
  const { Draw } = await import('../src/models/Draw.js');
  const { Game } = await import('../src/models/Game.js');
  const { Player } = await import('../src/models/Player.js');
  await Promise.all([Card.syncIndexes(), Draw.syncIndexes(), Game.syncIndexes(), Player.syncIndexes()]);
  _resetIdempotency();
  _resetLockouts();
  _resetPinStore();
  _resetProgressCache();
  await _resetRateLimitForTests();
  await AdminUser.create({ username: ADMIN_USER, passwordHash: await hashSecret(ADMIN_PASS) });
}

export async function adminToken(): Promise<string> {
  const res = await api
    .post('/api/v1/auth/admin/login')
    .set('X-Client', 'mobile')
    .send({ username: ADMIN_USER, password: ADMIN_PASS });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface Bootstrap {
  gameId: string;
  creds: { serial: number; name: string; loginId: string; pin: string }[];
  admin: string;
}

/** Full setup flow: game → players → PINs → cards → lock → start. */
export async function bootstrapGame(opts?: {
  playerCount?: number;
  cardSize?: number;
  maxNumber?: number;
  names?: string[];
}): Promise<Bootstrap> {
  const admin = await adminToken();
  const playerCount = opts?.playerCount ?? 6;
  const body: Record<string, unknown> = { name: 'Test Game' };
  if (opts?.playerCount) body.playerCount = opts.playerCount;
  if (opts?.cardSize) body.cardSize = opts.cardSize;
  if (opts?.maxNumber) body.maxNumber = opts.maxNumber;
  const g = await api.post('/api/v1/admin/game').set(auth(admin)).send(body);
  if (g.status !== 201) throw new Error(`create game failed: ${g.status} ${JSON.stringify(g.body)}`);
  const gameId = g.body.id as string;

  const names = opts?.names ?? Array.from({ length: playerCount }, (_, i) => `Player ${i + 1}`);
  const imp = await api
    .post('/api/v1/admin/players/import')
    .set(auth(admin))
    .send(names.map((name) => ({ name })));
  if (imp.status !== 201) throw new Error(`import failed: ${imp.status} ${JSON.stringify(imp.body)}`);

  const creds = await api.post('/api/v1/admin/players/credentials/generate').set(auth(admin)).send();
  if (creds.status !== 201) throw new Error(`creds failed: ${creds.status} ${JSON.stringify(creds.body)}`);

  const gen = await api.post('/api/v1/admin/cards/generate').set(auth(admin)).send();
  if (gen.status !== 201) throw new Error(`gen cards failed: ${gen.status} ${JSON.stringify(gen.body)}`);

  const lock = await api.post('/api/v1/admin/cards/lock').set(auth(admin)).send();
  if (lock.status !== 200) throw new Error(`lock failed: ${lock.status} ${JSON.stringify(lock.body)}`);

  const start = await api.post('/api/v1/admin/game/start').set(auth(admin)).send();
  if (start.status !== 200) throw new Error(`start failed: ${start.status} ${JSON.stringify(start.body)}`);

  return { gameId, creds: creds.body.items, admin };
}

export async function playerToken(loginId: string, pin: string): Promise<string> {
  const res = await api.post('/api/v1/auth/player/login').set('X-Client', 'mobile').send({ loginId, pin });
  if (res.status !== 200) throw new Error(`player login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}
