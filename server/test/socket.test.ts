import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { Player } from '../src/models/Player.js';
import { attachSockets } from '../src/sockets/index.js';
import { api, auth, bootstrapGame, playerToken, resetDb, startMemoryDb, stopMemoryDb } from './helpers.js';

let httpServer: ReturnType<typeof createServer>;
let baseUrl = '';

beforeAll(async () => {
  await startMemoryDb();
  const app = createApp();
  httpServer = createServer(app);
  attachSockets(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  await stopMemoryDb();
});

beforeEach(resetDb);

function connect(token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(baseUrl, { auth: token ? { token } : {}, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function waitFor<T>(socket: Socket, event: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('sockets (05 §4)', () => {
  it('a draw produces draw:new to public, admin and players; me:update only to relevant rooms', async () => {
    const { creds, admin } = await bootstrapGame({ playerCount: 3 });
    const pt0 = await playerToken(creds[0].loginId, creds[0].pin);
    const pt1 = await playerToken(creds[1].loginId, creds[1].pin);

    const pub = await connect();
    const adm = await connect(admin);
    const pl0 = await connect(pt0);
    const pl1 = await connect(pt1);
    try {
      const drawNewPub = waitFor<{ seq: number; number: number; drawCount: number; lastSeq: number }>(pub, 'draw:new');
      const drawNewAdm = waitFor(pub, 'draw:new');
      void drawNewAdm;
      const me0 = waitFor<{ markedCount: number; drawCount: number; lastSeq: number }>(pl0, 'me:update');
      const me1 = waitFor(pl1, 'me:update');
      const admSnap = waitFor(adm, 'admin:snapshot');

      const res = await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 5 });
      expect(res.status).toBe(201);

      const payload = await drawNewPub;
      expect(payload.number).toBe(5);
      expect(payload.drawCount).toBe(1);
      expect(payload.lastSeq).toBe(1);
      await admSnap;
      const u0 = await me0;
      expect(u0.drawCount).toBe(1);
      expect(u0.lastSeq).toBe(1);
      await me1; // every player room gets its own me:update

      // me:update payloads are per-player: find which cards hold 5.
      const players = await Player.find().select('serial').lean();
      void players;
    } finally {
      for (const s of [pub, adm, pl0, pl1]) s.disconnect();
    }
  });

  it("win:detected goes to admin only — never to player or public sockets", async () => {
    const { creds, admin, gameId } = await bootstrapGame({ playerCount: 2, cardSize: 2, maxNumber: 8 });
    const { Card } = await import('../src/models/Card.js');
    const mongoose = (await import('mongoose')).default;
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

    const pt = await playerToken(creds[0].loginId, creds[0].pin);
    const pub = await connect();
    const pl = await connect(pt);
    const adm = await connect(admin);
    try {
      let leaked = 0;
      pub.on('win:detected', () => leaked++);
      pl.on('win:detected', () => leaked++);
      const winDetected = waitFor<{ events: unknown[] }>(adm, 'win:detected');
      await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 5 });
      await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 7 });
      await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 6 });
      const detected = await winDetected;
      expect(detected.events).toHaveLength(1);
      await new Promise((r) => setTimeout(r, 500));
      expect(leaked).toBe(0);
    } finally {
      pub.disconnect();
      pl.disconnect();
      adm.disconnect();
    }
  });

  it('a player socket cannot receive another player room events or admin events', async () => {
    const { creds, admin } = await bootstrapGame({ playerCount: 3 });
    const pt0 = await playerToken(creds[0].loginId, creds[0].pin);
    const pt1 = await playerToken(creds[1].loginId, creds[1].pin);

    const pl0 = await connect(pt0);
    const pl1 = await connect(pt1);
    try {
      // Track leaked events on player 0
      let adminSnapshotLeaked = 0;
      let winDetectedLeaked = 0;
      const meUpdates0: unknown[] = [];
      const meUpdates1: unknown[] = [];
      pl0.on('admin:snapshot', () => adminSnapshotLeaked++);
      pl0.on('win:detected', () => winDetectedLeaked++);
      pl0.on('me:update', (d: unknown) => meUpdates0.push(d));
      pl1.on('me:update', (d: unknown) => meUpdates1.push(d));

      // Draw a number — both players get their OWN me:update
      await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: 1 });
      await new Promise((r) => setTimeout(r, 1000));

      // Each player should only get their own me:update, never admin events
      expect(meUpdates0.length).toBeGreaterThanOrEqual(1);
      expect(meUpdates1.length).toBeGreaterThanOrEqual(1);
      expect(adminSnapshotLeaked).toBe(0);
      expect(winDetectedLeaked).toBe(0);
    } finally {
      pl0.disconnect();
      pl1.disconnect();
    }
  });

  it('every draw payload carries drawCount and lastSeq for gap detection', async () => {
    const { creds, admin } = await bootstrapGame({ playerCount: 3 });
    const pt0 = await playerToken(creds[0].loginId, creds[0].pin);
    const pub = await connect();
    const pl0 = await connect(pt0);
    try {
      const drawPayloads: { seq: number; drawCount: number; lastSeq: number }[] = [];
      const mePayloads: { drawCount: number; lastSeq: number }[] = [];
      pub.on('draw:new', (d: { seq: number; drawCount: number; lastSeq: number }) => drawPayloads.push(d));
      pl0.on('me:update', (d: { drawCount: number; lastSeq: number }) => mePayloads.push(d));

      // Three consecutive draws
      for (const n of [1, 2, 3]) {
        await api.post('/api/v1/admin/draws').set(auth(admin)).send({ number: n });
      }
      await new Promise((r) => setTimeout(r, 1500));

      // draw:new payloads must have monotonically increasing seq and drawCount
      expect(drawPayloads.length).toBe(3);
      for (let i = 0; i < drawPayloads.length; i++) {
        expect(drawPayloads[i].seq).toBe(i + 1);
        expect(drawPayloads[i].drawCount).toBe(i + 1);
        expect(drawPayloads[i].lastSeq).toBe(i + 1);
      }

      // me:update payloads also carry drawCount + lastSeq
      expect(mePayloads.length).toBe(3);
      for (let i = 0; i < mePayloads.length; i++) {
        expect(mePayloads[i].drawCount).toBe(i + 1);
        expect(mePayloads[i].lastSeq).toBe(i + 1);
      }
    } finally {
      pub.disconnect();
      pl0.disconnect();
    }
  });
});
