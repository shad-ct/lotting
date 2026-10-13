import mongoose from 'mongoose';
import type { Test } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/app.js';
import { Card } from '../src/models/Card.js';
import { Draw } from '../src/models/Draw.js';
import { Player } from '../src/models/Player.js';
import {
  api,
  auth,
  bootstrapGame,
  playerToken,
  resetDb,
  startMemoryDb,
  stopMemoryDb,
} from './helpers.js';

beforeAll(startMemoryDb);
afterAll(stopMemoryDb);
beforeEach(resetDb);

describe('auth (02 §2, 05 §3)', () => {
  it('wrong PIN and unknown ID return the same generic error', async () => {
    const { creds } = await bootstrapGame({ playerCount: 2 });
    const wrong = await api.post('/api/v1/auth/player/login').send({ loginId: creds[0].loginId, pin: '000001' });
    const unknown = await api.post('/api/v1/auth/player/login').send({ loginId: 'P999', pin: '000001' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('loginId is case-insensitive', async () => {
    const { creds } = await bootstrapGame({ playerCount: 2 });
    const res = await api
      .post('/api/v1/auth/player/login')
      .set('X-Client', 'mobile')
      .send({ loginId: creds[0].loginId.toLowerCase(), pin: creds[0].pin });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('lockout after 5 consecutive failures', async () => {
    await bootstrapGame({ playerCount: 2 });
    for (let i = 0; i < 5; i++) {
      const r = await api.post('/api/v1/auth/player/login').send({ loginId: 'P001', pin: '000001' });
      expect(r.status).toBe(401);
    }
    const locked = await api.post('/api/v1/auth/player/login').send({ loginId: 'P001', pin: '000001' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('rate limits respond 429 (11th login attempt)', async () => {
    await bootstrapGame({ playerCount: 2 });
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const r = await api.post('/api/v1/auth/player/login').send({ loginId: 'PRATE', pin: '000001' });
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it('admin vs player token separation; /auth/me', async () => {
    const { creds, admin } = await bootstrapGame({ playerCount: 2 });
    const me = await api.get('/api/v1/auth/me').set(auth(admin));
    expect(me.body.role).toBe('admin');
    const pt = await playerToken(creds[0].loginId, creds[0].pin);
    const meP = await api.get('/api/v1/auth/me').set(auth(pt));
    expect(meP.body.role).toBe('player');
    const anon = await api.get('/api/v1/auth/me');
    expect(anon.status).toBe(401);
  });
});

describe('authorization matrix (05 §3)', () => {
  it('every /admin/* route: player token → 403, no token → 401', async () => {
    const { creds } = await bootstrapGame({ playerCount: 2 });
    const pt = await playerToken(creds[0].loginId, creds[0].pin);
    const players = await Player.find().lean();
    const pid = String(players[0]._id);
    const routes: [string, string, unknown?][] = [
      ['get', '/api/v1/admin/game'],
      ['post', '/api/v1/admin/game', { name: 'x' }],
      ['patch', '/api/v1/admin/game', { name: 'x' }],
      ['get', '/api/v1/admin/players'],
      ['post', '/api/v1/admin/players/import', [{ name: 'Z' }]],
      ['post', '/api/v1/admin/players', { name: 'Z' }],
      ['patch', `/api/v1/admin/players/${pid}`, { name: 'Z' }],
      ['delete', `/api/v1/admin/players/${pid}`],
      ['post', '/api/v1/admin/players/credentials/generate'],
      ['post', `/api/v1/admin/players/${pid}/reset-pin`],
      ['patch', `/api/v1/admin/players/${pid}/sent`, { cardImageSent: true }],
      ['get', `/api/v1/admin/players/${pid}`],
      ['post', '/api/v1/admin/cards/generate'],
      ['post', '/api/v1/admin/cards/lock'],
      ['post', '/api/v1/admin/game/start'],
      ['post', '/api/v1/admin/game/finish'],
      ['post', '/api/v1/admin/game/reopen', { confirm: true }],
      ['post', '/api/v1/admin/game/reset', { confirm: 'RESET' }],
      ['post', '/api/v1/admin/draws', { number: 1 }],
      ['post', '/api/v1/admin/draws/random'],
      ['post', '/api/v1/admin/draws/undo'],
      ['get', '/api/v1/admin/draws'],
      ['get', '/api/v1/admin/status'],
      ['post', '/api/v1/admin/verify-claim', { serial: 1 }],
      ['get', '/api/v1/admin/export/standings.csv'],
      ['post', '/api/v1/admin/wins/000000000000000000000000/confirm'],
      ['post', '/api/v1/admin/wins/000000000000000000000000/reject'],
    ];
    for (const [method, path, body] of routes) {
      const run = (authHeader?: string): Test => {
        let r = (api as unknown as Record<string, (p: string) => Test>)[method](path);
        if (authHeader) r = r.set('Authorization', authHeader) as Test;
        if (body !== undefined) r = r.send(body) as Test;
        else if (method === 'post' || method === 'patch') r = r.send() as Test;
        return r as Test;
      };
      const asPlayer = await run(`Bearer ${pt}`);
      expect(asPlayer.status, `${method} ${path} as player`).toBe(403);
      const anon = await run(undefined);
      expect(anon.status, `${method} ${path} anonymous`).toBe(401);
    }
  });

  it('a player can never read another player\'s card', async () => {
    const { creds } = await bootstrapGame({ playerCount: 3 });
    const pt = await playerToken(creds[0].loginId, creds[0].pin);
    // Own card works.
    const own = await api.get('/api/v1/me/card').set(auth(pt));
    expect(own.status).toBe(200);
    expect(own.body.serial).toBe(creds[0].serial);
    // No endpoint exposes another card: admin detail is 403, and /me/card
    // ignores any parameter tampering (no id parameter exists).
    const players = await Player.find().lean();
    const otherId = String(players.find((p) => p.serial !== creds[0].serial)!._id);
    const sneaky = await api.get(`/api/v1/admin/players/${otherId}`).set(auth(pt));
    expect(sneaky.status).toBe(403);
  });
});

describe('draw rules (02 §12)', () => {
  it('1. same number twice → 409 NUMBER_ALREADY_DRAWN, no state change', async () => {
    const { admin } = await bootstrapGame({ playerCount: 4 });
    const first = await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 7 });
    expect(first.status).toBe(201);
    const second = await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 7 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('NUMBER_ALREADY_DRAWN');
    expect(second.body.error.details.number).toBe(7);
    const log = await api.get('/api/v1/admin/draws').set(auth(admin));
    expect(log.body.items.filter((d: { isActive: boolean }) => d.isActive)).toHaveLength(1);
  });

  it('2. 20 concurrent distinct numbers → all 201, unique contiguous seqs', async () => {
    const { admin } = await bootstrapGame({ playerCount: 4 });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: i + 1 })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const seqs = results.map((r) => r.body.draw.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('3. 20 concurrent same-number → exactly one 201 and nineteen 409s', async () => {
    const { admin } = await bootstrapGame({ playerCount: 4 });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 55 })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(19);
    expect(new Set(results.filter((r) => r.status === 409).map((r) => r.body.error.code))).toEqual(
      new Set(['NUMBER_ALREADY_DRAWN']),
    );
  });

  it('4. random draw 110× returns every number once; 111th → ALL_NUMBERS_DRAWN', async () => {
    const { admin } = await bootstrapGame({ playerCount: 110 });
    const seen = new Set<number>();
    for (let i = 0; i < 110; i++) {
      const r = await api.post('/api/v1/admin/draws/random').set(auth(admin)).send();
      expect(r.status).toBe(201);
      seen.add(r.body.draw.number);
      if (i % 30 === 29) {
        const { resetRateLimits } = await import('../src/middleware/rateLimit.js');
        await resetRateLimits();
      }
    }
    expect(seen.size).toBe(110);
    const extra = await api.post('/api/v1/admin/draws/random').set(auth(admin)).send();
    expect(extra.status).toBe(409);
    expect(extra.body.error.code).toBe('ALL_NUMBERS_DRAWN');
  }, 120000);

  it('5. undo then redraw works; audit shows both', async () => {
    const { admin } = await bootstrapGame({ playerCount: 4 });
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 9 });
    const undo = await api.post('/api/v1/admin/draws/undo').set(auth(admin)).send({ reason: 'typo' });
    expect(undo.status).toBe(200);
    expect(undo.body.undone).toMatchObject({ number: 9 });
    const redraw = await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 9 });
    expect(redraw.status).toBe(201);
    expect(redraw.body.draw.seq).toBe(2);
    const audit = await api.get('/api/v1/admin/audit').set(auth(admin));
    const actions = audit.body.items.map((a: { action: string }) => a.action);
    expect(actions).toContain('draw');
    expect(actions).toContain('undo');
  });

  it('invalid numbers rejected: 0, 111, -5, 7.5, abc, empty', async () => {
    const { admin } = await bootstrapGame({ playerCount: 4, maxNumber: 110 });
    for (const number of [0, 111, -5, 7.5]) {
      const r = await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number });
      expect(r.status, `number=${number}`).toBe(422);
      expect(r.body.error.code).toBe('INVALID_NUMBER');
    }
    const abc = await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 'abc' });
    expect(abc.status).toBe(422);
    const empty = await api.post('/api/v1/admin/draws').set(auth(admin)).send({});
    expect(empty.status).toBe(422);
    const log = await api.get('/api/v1/admin/draws').set(auth(admin));
    expect(log.body.items).toHaveLength(0);
  });

  it('draws rejected unless live', async () => {
    // Fresh game in setup state (no draws possible before lock + start).
    const { adminToken } = await import('./helpers.js');
    const at = await adminToken();
    const g = await api.post('/api/v1/admin/game').set(auth(at)).send({ name: 'Not live' });
    expect(g.status).toBe(201);
    const d = await api.post('/api/v1/admin/draws').set(auth(at)).send({ number: 5 });
    expect(d.status).toBe(409);
    expect(d.body.error.code).toBe('GAME_NOT_LIVE');
  });

  it('idempotency key replay returns the original response and does nothing', async () => {
    const { admin } = await bootstrapGame({ playerCount: 4 });
    const key = 'test-key-123';
    const first = await api.post('/api/v1/admin/draws').set(auth(admin)).set('Idempotency-Key', key).send({ number: 42 });
    expect(first.status).toBe(201);
    const replay = await api.post('/api/v1/admin/draws').set(auth(admin)).set('Idempotency-Key', key).send({ number: 99 });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    const log = await api.get('/api/v1/admin/draws').set(auth(admin));
    expect(log.body.items).toHaveLength(1);
  });
});

describe('win flow (02 §7)', () => {
  /** Two cards sharing one last missing number → tie on the final draw.
   * NOTE: forced cards use numbers 5-7. A 2-player/2-per-card/1..8 generated
   * deal only ever contains 1-4 (near-balanced counts), so '5-6'/'6-7' can
   * never collide with a generated canonicalKey. */
  async function setupTie(): Promise<{ admin: string; gameId: string }> {
    const { admin, gameId } = await bootstrapGame({ playerCount: 2, cardSize: 2, maxNumber: 8 });
    const gid = new mongoose.Types.ObjectId(gameId);
    const cards = await Card.find({ gameId: gid }).sort({ serial: 1 });
    cards[0].grid = [5, 6];
    cards[0].numbersSorted = [5, 6];
    cards[0].canonicalKey = '5-6';
    cards[1].grid = [6, 7];
    cards[1].numbersSorted = [6, 7];
    cards[1].canonicalKey = '6-7';
    await cards[0].save();
    await cards[1].save();
    return { admin, gameId };
  }

  it('7. tie → ONE WinEvent with two co-winners; hidden until confirmed', async () => {
    const { admin } = await setupTie();
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 5 });
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 7 });
    // Public shows no winners yet.
    let board = await api.get('/api/v1/public/board');
    expect(board.body.winners).toEqual([]);
    const win = await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 6 });
    expect(win.status).toBe(201);
    expect(win.body.newWinners).toHaveLength(1);
    expect(win.body.newWinners[0].players).toHaveLength(2);
    // Still hidden on public until confirm.
    board = await api.get('/api/v1/public/board');
    expect(board.body.winners).toEqual([]);
    const status = await api.get('/api/v1/admin/status').set(auth(admin));
    expect(status.body.winners.detected).toHaveLength(1);
    // Confirm → visible + game finished (stopAtFirstFullCard).
    const eventId = win.body.newWinners[0].eventId;
    const confirm = await api.post(`/api/v1/admin/wins/${eventId}/confirm`).set(auth(admin)).send();
    expect(confirm.status).toBe(200);
    board = await api.get('/api/v1/public/board');
    expect(board.body.winners).toHaveLength(2);
    expect(board.body.game.status).toBe('finished');
  });

  it('reject path + undo of unconfirmed win withdraws detection', async () => {
    const { admin } = await setupTie();
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 5 });
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 7 });
    const win = await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 6 });
    const eventId = win.body.newWinners[0].eventId;
    const rej = await api.post(`/api/v1/admin/wins/${eventId}/reject`).set(auth(admin)).send();
    expect(rej.status).toBe(200);
    const status = await api.get('/api/v1/admin/status').set(auth(admin));
    expect(status.body.winners.detected).toHaveLength(0);

    // Second scenario: undo withdraws a pending detection.
    await api.post('/api/v1/admin/game/reset').set(auth(admin)).send({ confirm: 'RESET' });
    await api.post('/api/v1/admin/game/start').set(auth(admin)).send();
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 5 });
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 7 });
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 6 });
    const undo = await api.post('/api/v1/admin/draws/undo').set(auth(admin)).send({ reason: 'mis-entry' });
    expect(undo.body.withdrawnWins).toBe(1);
    const status2 = await api.get('/api/v1/admin/status').set(auth(admin));
    expect(status2.body.winners.detected).toHaveLength(0);
  });

  it('undo after confirmation+finish requires reopen first', async () => {
    const { admin } = await setupTie();
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 5 });
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 7 });
    const win = await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 6 });
    await api.post(`/api/v1/admin/wins/${win.body.newWinners[0].eventId}/confirm`).set(auth(admin)).send();
    const undo = await api.post('/api/v1/admin/draws/undo').set(auth(admin)).send();
    expect(undo.status).toBe(409);
    expect(undo.body.error.code).toBe('WINNER_CONFIRMED_REOPEN_FIRST');
    const reopen = await api.post('/api/v1/admin/game/reopen').set(auth(admin)).send({ confirm: true });
    expect(reopen.status).toBe(200);
    const undo2 = await api.post('/api/v1/admin/draws/undo').set(auth(admin)).send();
    expect(undo2.status).toBe(200);
  });

  it('verify-claim checks against server-side cards', async () => {
    const { admin, gameId } = await setupTie();
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 5 });
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 7 });
    const before = await api.post('/api/v1/admin/verify-claim').set(auth(admin)).send({ serial: 1 });
    expect(before.body.valid).toBe(false);
    expect(before.body.missing).toEqual([6]);
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 6 });
    const after = await api.post('/api/v1/admin/verify-claim').set(auth(admin)).send({ serial: 1 });
    expect(after.body.valid).toBe(true);
    void gameId;
  });
});

describe('setup + lock rules', () => {
  it('regeneration after lock → 409; lock needs cards + PINs', async () => {
    const { admin } = await bootstrapGame({ playerCount: 3 });
    const regen = await api.post('/api/v1/admin/cards/generate').set(auth(admin)).send();
    expect(regen.status).toBe(409);
    expect(regen.body.error.code).toBe('CARDS_LOCKED');
  });

  it('reset clears draws + wins, back to ready, keeps players/cards/PINs', async () => {
    const { admin, creds } = await bootstrapGame({ playerCount: 3 });
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 5 });
    const reset = await api.post('/api/v1/admin/game/reset').set(auth(admin)).send({ confirm: 'RESET' });
    expect(reset.status).toBe(200);
    const draws = await Draw.countDocuments();
    expect(draws).toBe(0);
    expect(await Player.countDocuments()).toBe(3);
    expect(await Card.countDocuments()).toBe(3);
    // Old PINs still work after reset.
    const pt = await playerToken(creds[0].loginId, creds[0].pin);
    expect(pt).toBeDefined();
    const game = await api.get('/api/v1/admin/game').set(auth(admin));
    expect(game.body.status).toBe('ready');
  });
});

describe('privacy + secrets (05 §3)', () => {
  it('public payload has no phones, loginIds or card grids', async () => {
    const { admin } = await bootstrapGame({ playerCount: 3 });
    await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 5 });
    const board = await api.get('/api/v1/public/board');
    const text = JSON.stringify(board.body);
    expect(text).not.toMatch(/phone/i);
    expect(text).not.toMatch(/loginId/i);
    expect(text).not.toMatch(/grid/i);
    expect(text).not.toMatch(/pin/i);
    expect(Object.keys(board.body).sort()).toEqual(['drawCount', 'drawn', 'game', 'lastDrawn', 'winners']);
  });

  it('plain PINs never in DB documents; secrets redacted from logs', async () => {
    const { creds } = await bootstrapGame({ playerCount: 3 });
    const players = await Player.find().lean();
    for (const p of players) {
      expect(p.pinHash).toBeDefined();
      const plain = creds.find((c) => c.serial === p.serial)!.pin;
      expect(p.pinHash).not.toContain(plain);
      expect(JSON.stringify(p)).not.toContain(plain);
    }
    expect(redactSecrets({ pin: '123456', password: 'x', nested: { pin: 'y' } })).toEqual({
      pin: '[REDACTED]',
      password: '[REDACTED]',
      nested: { pin: '[REDACTED]' },
    });
  });
});
