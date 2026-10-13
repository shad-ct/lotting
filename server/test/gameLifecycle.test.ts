import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, auth, adminToken, resetDb, startMemoryDb, stopMemoryDb } from './helpers.js';

beforeAll(startMemoryDb);
afterAll(stopMemoryDb);
beforeEach(resetDb);

describe('game lifecycle (post-game restart / new game)', () => {
  it('create blocked while live (409); allowed after finish; data isolated per game', async () => {
    const admin = await adminToken();
    const g1 = await api.post('/api/v1/admin/game').set(auth(admin)).send({ name: 'Game One', playerCount: 2 });
    expect(g1.status).toBe(201);
    await api.post('/api/v1/admin/players/import').set(auth(admin)).send([{ name: 'A' }, { name: 'B' }]);
    await api.post('/api/v1/admin/players/credentials/generate').set(auth(admin));
    await api.post('/api/v1/admin/cards/generate').set(auth(admin));
    await api.post('/api/v1/admin/cards/lock').set(auth(admin));
    await api.post('/api/v1/admin/game/start').set(auth(admin));
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 1 });

    const blocked = await api.post('/api/v1/admin/game').set(auth(admin)).send({ name: 'Game Two' });
    expect(blocked.status).toBe(409);

    const fin = await api.post('/api/v1/admin/game/finish').set(auth(admin));
    expect(fin.status).toBe(200);

    const g2 = await api.post('/api/v1/admin/game').set(auth(admin)).send({ name: 'Game Two', playerCount: 2 });
    expect(g2.status).toBe(201);

    // New game starts empty: no players, no draws — old game data stays under its own game.
    const players = await api.get('/api/v1/admin/players').set(auth(admin));
    expect((players.body as { total: number }).total).toBe(0);
    const draws = await api.get('/api/v1/admin/draws').set(auth(admin));
    expect((draws.body as { items: unknown[] }).items).toHaveLength(0);
  });

  it('finish needs live; reopen needs finished', async () => {
    const admin = await adminToken();
    await api.post('/api/v1/admin/game').set(auth(admin)).send({ name: 'G', playerCount: 1 });
    expect((await api.post('/api/v1/admin/game/finish').set(auth(admin))).status).toBe(409);
    expect((await api.post('/api/v1/admin/game/reopen').set(auth(admin)).send({ confirm: true })).status).toBe(409);
  });
});
