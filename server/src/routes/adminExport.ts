import { Router } from 'express';
import { sanitizeFilename } from '@lotto/shared/credentials.js';
import { requireAdmin } from '../middleware/auth.js';
import { requireGame } from '../middleware/requireGame.js';
import { Card } from '../models/Card.js';
import { Draw } from '../models/Draw.js';
import { Player } from '../models/Player.js';
import { env } from '../config/env.js';
import { renderCard, renderUnmarkedCached } from '../services/cardImage/renderCard.js';
import { streamCardsZip } from '../services/cardImage/renderZip.js';
import { buildMessage, buildWhatsappLink } from '../services/cardImage/whatsapp.js';
import { getPins } from '../services/pinStore.js';
import { err } from '../utils/errors.js';

const router = Router();
router.use(requireAdmin);
router.use(requireGame);

function cardInputFor(game: {
  name: string;
  appUrl: string;
}, player: { serial: number; name: string; loginId: string }, card: { grid: number[]; verifyCode: string }) {
  return {
    gameName: game.name,
    serial: player.serial,
    playerName: player.name,
    loginId: player.loginId,
    grid: card.grid as number[],
    verifyCode: card.verifyCode,
    appUrl: game.appUrl || env.APP_URL,
  };
}

async function drawnSetFor(gameId: unknown): Promise<Set<number>> {
  const draws = await Draw.find({ gameId, isActive: true }).select('number').lean();
  return new Set(draws.map((d) => d.number));
}

/** GET /admin/players/:id/card.png — any player's card (admin only). */
router.get('/players/:id/card.png', async (req, res, next) => {
  try {
    const game = req.game!;
    const player = await Player.findOne({ _id: req.params.id, gameId: game._id });
    if (!player) throw err('PLAYER_NOT_FOUND', 'Player not found', 404);
    const card = await Card.findOne({ gameId: game._id, serial: player.serial });
    if (!card) throw err('CARD_NOT_READY', 'Card not generated yet', 409);
    const marked = req.query.marked === '1';
    const buf = marked
      ? renderCard({ ...cardInputFor(game, player, card), drawn: await drawnSetFor(game._id) })
      : renderUnmarkedCached(cardInputFor(game, player, card));
    res.setHeader('Content-Type', 'image/png');
    if (req.query.download === '1') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${sanitizeFilename(player.name, player.serial)}.png"`,
      );
    }
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

/** GET /admin/export/cards.zip — only once status ≥ ready. */
router.get('/export/cards.zip', async (req, res, next) => {
  try {
    const game = req.game!;
    if (game.status === 'setup') throw err('CARDS_NOT_READY', 'Cards are not locked yet', 409);
    const [players, cards] = await Promise.all([
      Player.find({ gameId: game._id }).sort({ serial: 1 }).lean(),
      Card.find({ gameId: game._id }).lean(),
    ]);
    const cardBySerial = new Map(cards.map((c) => [c.serial, c]));
    const entries = players
      .filter((p) => cardBySerial.has(p.serial))
      .map((p) => {
        const c = cardBySerial.get(p.serial)!;
        return {
          serial: p.serial,
          name: p.name,
          input: cardInputFor(game, p, { grid: c.grid as number[], verifyCode: c.verifyCode }),
        };
      });
    await streamCardsZip(res, entries);
  } catch (e) {
    next(e);
  }
});

function credentialsMap(players: { _id: unknown; phone: string | null }[]) {
  const m = new Map<string, string>();
  for (const p of players) if (p.phone) m.set(String(p._id), p.phone);
  return m;
}

/** GET /admin/export/credentials.csv — one-time window (410 after 15 min). */
router.get('/export/credentials.csv', async (req, res, next) => {
  try {
    const game = req.game!;
    const players = await Player.find({ gameId: game._id }).sort({ serial: 1 }).lean();
    const pins = credentialsMap(players);
    const lines = ['serial,name,phone,loginId,pin,whatsappLink'];
    for (const p of players) {
      const pin = pins.get(String(p._id)) ?? '';
      const msg = pin
        ? buildMessage(game.whatsappTemplate, {
            name: p.name,
            gameName: game.name,
            serial: p.serial,
            appUrl: game.appUrl || env.APP_URL,
            loginId: p.loginId,
            pin,
          })
        : '';
      const link = pin ? (buildWhatsappLink(p.phone, msg) ?? '') : '';
      const cell = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
      lines.push([p.serial, cell(p.name), p.phone ?? '', p.loginId, pin, cell(link)].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="credentials.csv"');
    res.send(lines.join('\n'));
  } catch (e) {
    next(e);
  }
});

/** GET /admin/export/credentials.print — printable cut-out slips (same window). */
router.get('/export/credentials.print', async (req, res, next) => {
  try {
    const game = req.game!;
    const players = await Player.find({ gameId: game._id }).sort({ serial: 1 }).lean();
    const pins = credentialsMap(players);
    const esc = (s: string) =>
      String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const slips = players
      .filter((p) => pins.has(String(p._id)))
      .map(
        (p) => `<div class="slip">
  <h2>${esc(game.name)} — Card #${String(p.serial).padStart(3, '0')}</h2>
  <p><strong>${esc(p.name)}</strong></p>
  <p>Live card: ${esc(game.appUrl || env.APP_URL)}</p>
  <p>Login ID: <strong>${esc(p.loginId)}</strong></p>
  <p>PIN: <strong>${esc(pins.get(String(p._id))!)}</strong></p>
</div>`,
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Credential slips</title>
<style>body{font-family:sans-serif}.slip{border:1px dashed #333;padding:16px;margin:16px;page-break-inside:avoid}</style>
</head><body>${slips}</body></html>`);
  } catch (e) {
    next(e);
  }
});

export default router;
