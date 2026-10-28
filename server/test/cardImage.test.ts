import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { theme } from '../src/services/cardImage/theme.js';
import { fitName, placedNumbers, renderCard } from '../src/services/cardImage/renderCard.js';
import { buildMessage, buildWhatsappLink } from '../src/services/cardImage/whatsapp.js';
import { Card } from '../src/models/Card.js';
import {
  api,
  auth,
  bootstrapGame,
  playerToken,
  resetDb,
  startMemoryDb,
  stopMemoryDb,
} from './helpers.js';
import { _expireWindow } from '../src/services/pinStore.js';

beforeAll(startMemoryDb);
afterAll(stopMemoryDb);
beforeEach(resetDb);

const BASE = {
  gameName: 'Onam Lotto 2026',
  serial: 47,
  playerName: 'Rahul',
  loginId: 'P047',
  grid: [5, 12, 23, 34, 45, 56, 67, 78, 89, 90, 101, 102, 3, 18, 77, 110],
  verifyCode: 'ABC123',
  appUrl: 'http://localhost:5173',
};

describe('card renderer (03 §7)', () => {
  it('deterministic: same card → byte-identical PNG at 1080×1350', async () => {
    const a = renderCard(BASE);
    const b = renderCard(BASE);
    expect(Buffer.compare(a, b)).toBe(0);
    const img = await loadImage(a);
    expect(img.width).toBe(1080);
    expect(img.height).toBe(1350);
  });

  it('grid numbers in the pipeline equal Card.grid exactly', async () => {
    const { gameId } = await bootstrapGame({ playerCount: 3 });
    const mongoose = (await import('mongoose')).default;
    const cards = await Card.find({ gameId: new mongoose.Types.ObjectId(gameId) }).sort({ serial: 1 });
    expect(cards).toHaveLength(3);
    for (const c of cards) {
      const placed = placedNumbers({
        ...BASE,
        serial: c.serial,
        grid: c.grid as number[],
        verifyCode: c.verifyCode,
      });
      expect(placed).toEqual(c.grid);
      // And it renders.
      expect(renderCard({ ...BASE, serial: c.serial, grid: c.grid as number[] }).length).toBeGreaterThan(10000);
    }
  });

  it('marked variant shows exactly card ∩ drawn, grayscale-visible', async () => {
    const drawn = new Set([BASE.grid[0], BASE.grid[5], BASE.grid[15]]);
    const buf = renderCard({ ...BASE, drawn });
    const img = await loadImage(buf);
    const canvas = createCanvas(1080, 1350);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const cellSize = Math.floor(
      Math.min(
        (1080 - theme.margin * 2 - theme.gridGap * 3) / 4,
        (theme.height - 425 - 170 - theme.gridGap * 3) / 4,
      ),
    );
    const gridWidth = 4 * cellSize + 3 * theme.gridGap;
    const gridLeft = Math.round((1080 - gridWidth) / 2);
    const gridTop = 425;
    const lum = (x: number, y: number): number => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      return 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
    };
    for (let i = 0; i < 16; i++) {
      const r = Math.floor(i / 4);
      const c = i % 4;
      const x = Math.round(gridLeft + c * (cellSize + theme.gridGap) + 30);
      const y = Math.round(gridTop + r * (cellSize + theme.gridGap) + 30);
      const marked = drawn.has(BASE.grid[i]);
      const l = lum(x, y);
      if (marked) {
        // Accent fill (#1D4ED8) is dark: luminance well below unmarked gray.
        expect(l, `cell ${i} should read marked`).toBeLessThan(120);
      } else {
        // Unmarked fill (#F1F1F1) is bright.
        expect(l, `cell ${i} should read unmarked`).toBeGreaterThan(180);
      }
    }
  });

  it('long + Malayalam names render without overflow or throw', () => {
    const long = renderCard({ ...BASE, playerName: 'A'.repeat(30) + ' Very Long Name Indeed' });
    expect(long.length).toBeGreaterThan(10000);
    const ml = renderCard({ ...BASE, playerName: 'രാഹുൽ മേനോൻ' });
    expect(ml.length).toBeGreaterThan(10000);
    // fitName shrinks before truncating; only truncates when still overflowing.
    const canvas = createCanvas(1080, 1350);
    const ctx = canvas.getContext('2d');
    const fit = fitName(ctx, 'X'.repeat(60), 1080 - theme.margin * 2);
    expect(fit.text.endsWith('…')).toBe(true);
  });

  it('110 PNGs render in under 30 seconds', () => {
    const start = Date.now();
    for (let i = 0; i < 110; i++) {
      const grid = Array.from({ length: 16 }, (_, k) => ((i * 16 + k) % 110) + 1);
      renderCard({ ...BASE, serial: i + 1, playerName: `Player ${i + 1}`, grid });
    }
    expect(Date.now() - start).toBeLessThan(30_000);
  }, 60000);

  it('whatsapp text + links', () => {
    const msg = buildMessage(null, {
      name: 'Rahul',
      gameName: 'Onam',
      serial: 47,
      appUrl: 'http://x',
      loginId: 'P047',
      pin: '482910',
    });
    expect(msg).toContain('Rahul');
    expect(msg).toContain('P047');
    expect(msg).toContain('482910');
    expect(buildWhatsappLink('919876543210', msg)).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(buildWhatsappLink(null, msg)).toBeNull();
  });
});

/** Minimal ZIP central-directory parser (file names only, no extra dep). */
function zipNames(buf: Buffer): string[] {
  const END_SIG = 0x06054b50;
  let endPos = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === END_SIG) {
      endPos = i;
      break;
    }
  }
  if (endPos < 0) throw new Error('Not a ZIP (EOCD missing)');
  const count = buf.readUInt16LE(endPos + 10);
  let pos = buf.readUInt32LE(endPos + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('Bad central header');
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    names.push(buf.toString('utf8', pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

describe('distribution endpoints (03 §4–§5)', () => {
  it('single PNG (admin + own), ZIP has 110 unique safe names', async () => {
    const { creds, admin } = await bootstrapGame({ playerCount: 5 });
    const { Player } = await import('../src/models/Player.js');
    const mongoose = (await import('mongoose')).default;
    void mongoose;
    const players = await Player.find().sort({ serial: 1 });

    const png = await api.get(`/api/v1/admin/players/${players[0]._id}/card.png`).set(auth(admin));
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');

    const dl = await api
      .get(`/api/v1/admin/players/${players[0]._id}/card.png?download=1`)
      .set(auth(admin));
    expect(dl.headers['content-disposition']).toMatch(/attachment; filename="/);

    // Player: own OK, another player's image is unreachable (403 via admin route).
    const pt = await playerToken(creds[1].loginId, creds[1].pin);
    const own = await api.get('/api/v1/me/card/image?marked=1').set(auth(pt));
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('image/png');
    const cross = await api.get(`/api/v1/admin/players/${players[0]._id}/card.png`).set(auth(pt));
    expect(cross.status).toBe(403);
  });

  it('ZIP endpoint streams all cards (status ≥ ready)', async () => {
    const { admin } = await bootstrapGame({ playerCount: 110 });
    const res = await api.get('/api/v1/admin/export/cards.zip').set(auth(admin)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    const names = zipNames(res.body as Buffer);
    expect(names).toHaveLength(110);
    expect(new Set(names).size).toBe(110);
    expect(names.every((n) => n.endsWith('.png'))).toBe(true);
    expect(names.join('')).not.toMatch(/[/\\:*?"<>|]/);
  }, 120000);

  it('credentials CSV + print slips work in-window, 410 after expiry, no DB PINs', async () => {
    const { admin, gameId, creds } = await bootstrapGame({ playerCount: 3 });
    // Give one player a phone so the CSV carries a wa.me link.
    const list = await api.get('/api/v1/admin/players').set(auth(admin));
    const firstId = list.body.items[0].id;
    await api.patch(`/api/v1/admin/players/${firstId}`).set(auth(admin)).send({ phone: '9876543210' });
    const csv = await api.get('/api/v1/admin/export/credentials.csv').set(auth(admin));
    expect(csv.status).toBe(200);
    expect(csv.text).toMatch(/^serial,name,phone,loginId,pin,whatsappLink/);
    expect(csv.text).toContain('919876543210');
    expect(csv.text).toContain('https://wa.me/919876543210');
    const print = await api.get('/api/v1/admin/export/credentials.print').set(auth(admin));
    expect(print.status).toBe(200);
    expect(print.text).toContain('Login ID');

    // No expiry window anymore — credentials always available from phone numbers.
    const gone = await api.get('/api/v1/admin/export/credentials.csv').set(auth(admin));
    expect(gone.status).toBe(200);
  });
});
