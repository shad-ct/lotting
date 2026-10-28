import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, auth, adminToken, playerToken, resetDb, startMemoryDb, stopMemoryDb } from './helpers.js';

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

  it('wipe deletes everything and returns the game to empty setup', async () => {
    const admin = await adminToken();
    expect((await api.post('/api/v1/admin/game').set(auth(admin)).send({ name: 'Wipe Me', playerCount: 2 })).status).toBe(201);
    await api.post('/api/v1/admin/players/import').set(auth(admin)).send([{ name: 'A' }, { name: 'B' }]);
    await api.post('/api/v1/admin/players/credentials/generate').set(auth(admin));
    await api.post('/api/v1/admin/cards/generate').set(auth(admin));

    const wrong = await api.post('/api/v1/admin/game/wipe').set(auth(admin)).send({ confirm: 'RESET' });
    expect(wrong.status).toBe(422);
    const wiped = await api.post('/api/v1/admin/game/wipe').set(auth(admin)).send({ confirm: 'WIPE' });
    expect(wiped.status).toBe(200);

    const game = await api.get('/api/v1/admin/game').set(auth(admin));
    expect((game.body as { status: string }).status).toBe('setup');
    const players = await api.get('/api/v1/admin/players').set(auth(admin));
    expect((players.body as { total: number }).total).toBe(0);
    const audit = await api.get('/api/v1/admin/audit').set(auth(admin));
    expect((audit.body as { items: { action: string }[] }).items.some((a) => a.action === 'wipe')).toBe(true);

    // Game is usable again from scratch.
    const re = await api.post('/api/v1/admin/players/import').set(auth(admin)).send([{ name: 'Fresh' }]);
    expect(re.status).toBe(201);
  });

  it('confirmed winners appear in /me/card (empty before any win)', async () => {
    const admin = await adminToken();
    expect((await api.post('/api/v1/admin/game').set(auth(admin)).send({ name: 'W', playerCount: 1, cardSize: 2, maxNumber: 3 })).status).toBe(201);
    const imp = await api.post('/api/v1/admin/players/import').set(auth(admin)).send([{ name: 'Solo', phone: '9000000000' }]);
    expect(imp.status).toBe(201);
    const list = await api.get('/api/v1/admin/players').set(auth(admin));
    const { loginId } = (list.body as { items: { loginId: string; phone: string | null }[] }).items[0];
    const pin = '919000000000';
    await api.post('/api/v1/admin/cards/generate').set(auth(admin));
    await api.post('/api/v1/admin/cards/lock').set(auth(admin));
    await api.post('/api/v1/admin/game/start').set(auth(admin));

    const pt = await playerToken(loginId, pin);
    const before = await api.get('/api/v1/me/card').set(auth(pt));
    expect(before.status).toBe(200);
    expect((before.body as { winners: unknown[] }).winners).toEqual([]);

    for (const n of [1, 2, 3]) {
      await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: n });
    }
    const status = await api.get('/api/v1/admin/status').set(auth(admin));
    const detected = (status.body as { winners: { detected: { id: string }[] } }).winners.detected;
    expect(detected.length).toBeGreaterThan(0);
    expect((await api.post(`/api/v1/admin/wins/${detected[0].id}/confirm`).set(auth(admin))).status).toBe(200);

    const after = await api.get('/api/v1/me/card').set(auth(pt));
    expect(after.status).toBe(200);
    expect((after.body as { winners: { serial: number; name: string }[] }).winners).toEqual([{ serial: 1, name: 'Solo' }]);
  });
});
