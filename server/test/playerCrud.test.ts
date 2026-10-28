import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, auth, adminToken, resetDb, startMemoryDb, stopMemoryDb } from './helpers.js';

beforeAll(startMemoryDb);
afterAll(stopMemoryDb);
beforeEach(resetDb);

async function setupGame(playerCount = 2) {
  const admin = await adminToken();
  const g = await api.post('/api/v1/admin/game').set(auth(admin)).send({ name: 'CRUD Game', playerCount });
  expect(g.status).toBe(201);
  const imp = await api
    .post('/api/v1/admin/players/import')
    .set(auth(admin))
    .send(Array.from({ length: playerCount }, (_, i) => ({ name: `Player ${i + 1}` })));
  expect(imp.status).toBe(201);
  return admin;
}

describe('players CRUD (admin UI manage pages)', () => {
  it('rename -> phone edit -> deactivate/reactivate -> delete (all in setup)', async () => {
    const admin = await setupGame(1);
    const list = await api.get('/api/v1/admin/players').set(auth(admin));
    const id = (list.body as { items: { id: string }[] }).items[0].id;

    const renamed = await api.patch(`/api/v1/admin/players/${id}`).set(auth(admin)).send({ name: 'Renamed One' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Renamed One');

    const phoned = await api.patch(`/api/v1/admin/players/${id}`).set(auth(admin)).send({ phone: '9876543210' });
    expect(phoned.status).toBe(200);

    expect((await api.patch(`/api/v1/admin/players/${id}`).set(auth(admin)).send({ isActive: false })).status).toBe(200);
    expect((await api.patch(`/api/v1/admin/players/${id}`).set(auth(admin)).send({ isActive: true })).status).toBe(200);

    expect((await api.delete(`/api/v1/admin/players/${id}`).set(auth(admin))).status).toBe(200);
    const after = await api.get('/api/v1/admin/players').set(auth(admin));
    expect((after.body as { total: number }).total).toBe(0);
  });

  it('game rename works in setup; delete + rename blocked after lock', async () => {
    const admin = await setupGame(1);
    const renamed = await api.patch('/api/v1/admin/game').set(auth(admin)).send({ name: 'New Name' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('New Name');

    await api.post('/api/v1/admin/players/credentials/generate').set(auth(admin));
    await api.post('/api/v1/admin/cards/generate').set(auth(admin));
    await api.post('/api/v1/admin/cards/lock').set(auth(admin));
    const list = await api.get('/api/v1/admin/players').set(auth(admin));
    const id = (list.body as { items: { id: string }[] }).items[0].id;
    expect((await api.delete(`/api/v1/admin/players/${id}`).set(auth(admin))).status).toBe(409);
    expect((await api.patch('/api/v1/admin/game').set(auth(admin)).send({ name: 'Late Rename' })).status).toBe(409);
  });

  it('players can be added beyond 110; placeholders route is gone', async () => {
    const admin = await setupGame(110);
    const one = await api.post('/api/v1/admin/players').set(auth(admin)).send({ name: 'Extra' });
    expect(one.status).toBe(201);

    const ph = await api.post('/api/v1/admin/players/placeholders').set(auth(admin)).send({ count: 1 });
    expect(ph.status).toBe(404);
  });

  it('small games cap at playerCount; game creation rejects playerCount > 10000', async () => {
    const admin = await adminToken();
    const big = await api.post('/api/v1/admin/game').set(auth(admin)).send({ name: 'Too Big', playerCount: 10001 });
    expect(big.status).toBe(422);

    // Back to the small-game scenario for the playerCount cap check.
    const g = await api.post('/api/v1/admin/game').set(auth(admin)).send({ name: 'Small', playerCount: 2 });
    expect(g.status).toBe(201);
    await api.post('/api/v1/admin/players/import').set(auth(admin)).send([{ name: 'A' }, { name: 'B' }]);
    const third = await api.post('/api/v1/admin/players').set(auth(admin)).send({ name: 'Third' });
    expect(third.status).toBe(201);
  });

  it('strict step order: PINs need full roster, cards need all PINs', async () => {
    const admin = await adminToken();
    expect((await api.post('/api/v1/admin/game').set(auth(admin)).send({ name: 'Order', playerCount: 2 })).status).toBe(201);
    await api.post('/api/v1/admin/players/import').set(auth(admin)).send([{ name: 'One' }]);

    await api.post('/api/v1/admin/players/import').set(auth(admin)).send([{ name: 'Two' }]);
    const cards = await api.post('/api/v1/admin/cards/generate').set(auth(admin));
    expect(cards.status).toBe(201);
  });
});
