import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Card } from '../src/models/Card.js';
import { Draw } from '../src/models/Draw.js';
import { Game } from '../src/models/Game.js';
import { Player } from '../src/models/Player.js';
import { assertRegenerable, CardLockError } from '../src/services/cardPersistence.js';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // Unique/partial indexes build in the background by default; sync them
  // first so duplicate-insert assertions never race index creation.
  await Promise.all([
    Card.syncIndexes(),
    Draw.syncIndexes(),
    Game.syncIndexes(),
    Player.syncIndexes(),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('models + indexes (01 §8, agreed decisions)', () => {
  it('duplicate ACTIVE draw rejected by DB index; re-insert after undo succeeds', async () => {
    const game = await Game.create({ name: 'idx-test' });
    const gid = game._id;
    await Draw.create({ gameId: gid, seq: 1, number: 42, source: 'manual', isActive: true });
    // Duplicate active insert must fail (partial unique index on isActive:true).
    await expect(
      Draw.create({ gameId: gid, seq: 2, number: 42, source: 'manual', isActive: true }),
    ).rejects.toThrow();
    // Undo (isActive=false) then redraw same number works.
    await Draw.updateOne(
      { gameId: gid, number: 42, isActive: true },
      { $set: { isActive: false, undoneAt: new Date(), undoReason: 'test' } },
    );
    const redraw = await Draw.create({
      gameId: gid,
      seq: 3,
      number: 42,
      source: 'manual',
      isActive: true,
    });
    expect(redraw.seq).toBe(3);
  });

  it('unique canonicalKey per game', async () => {
    const game = await Game.create({ name: 'card-uniq' });
    const gid = game._id;
    await Card.create({
      gameId: gid,
      serial: 1,
      grid: Array.from({ length: 16 }, (_, i) => i + 1),
      numbersSorted: Array.from({ length: 16 }, (_, i) => i + 1),
      canonicalKey: '1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-16',
      verifyCode: 'ABC123',
    });
    await expect(
      Card.create({
        gameId: gid,
        serial: 2,
        grid: Array.from({ length: 16 }, (_, i) => i + 1),
        numbersSorted: Array.from({ length: 16 }, (_, i) => i + 1),
        canonicalKey: '1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-16',
        verifyCode: 'XYZ789',
      }),
    ).rejects.toThrow();
  });

  it('regeneration blocked after lock (409 CARDS_LOCKED)', async () => {
    const game = await Game.create({ name: 'lock-test', status: 'setup' });
    await assertRegenerable(game._id); // ok in setup
    await Game.updateOne({ _id: game._id }, { $set: { status: 'ready', cardsLockedAt: new Date() } });
    await expect(assertRegenerable(game._id)).rejects.toMatchObject({ code: 'CARDS_LOCKED' });
    await expect(assertRegenerable(game._id)).rejects.toBeInstanceOf(CardLockError);
  });

  it('Player loginId unique case-insensitively per game', async () => {
    const game = await Game.create({ name: 'login-uniq' });
    await Player.create({ gameId: game._id, serial: 1, name: 'A', loginId: 'P001' });
    await expect(
      Player.create({ gameId: game._id, serial: 2, name: 'B', loginId: 'p001' }),
    ).rejects.toThrow();
  });

  it('plain PINs exist nowhere: Player has pinHash only', () => {
    const paths = Object.keys(Player.schema.paths);
    expect(paths).toContain('pinHash');
    expect(paths.some((p) => /plainpin|^pin$/i.test(p))).toBe(false);
  });
});
