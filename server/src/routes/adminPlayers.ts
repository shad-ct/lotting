import { Router } from 'express';
import {
  importPlayersSchema,
  createPlayerSchema,
  sentFlagsSchema,
  updatePlayerSchema,
} from '@lotto/shared/schemas.js';
import { normalizePhone } from '@lotto/shared/credentials.js';
import { hashSecret } from '../utils/password.js';
import { requireAdmin } from '../middleware/auth.js';
import { requireGame } from '../middleware/requireGame.js';
import { validateBody } from '../middleware/validate.js';
import { Card } from '../models/Card.js';
import { Draw } from '../models/Draw.js';
import { Player } from '../models/Player.js';
import { addPlayers, parsePlayerCsv } from '../services/gameService.js';
import { getProgress } from '../services/progressService.js';
import { err } from '../utils/errors.js';

const router = Router();
router.use(requireAdmin);

/** List players (basic rows for setup/management). */
router.get('/players', requireGame, async (req, res, next) => {
  try {
    const items = await Player.find({ gameId: req.game!._id }).sort({ serial: 1 }).lean();
    res.json({
      items: items.map((p) => ({
        id: String(p._id),
        serial: p.serial,
        name: p.name,
        phone: p.phone,
        loginId: p.loginId,
        isActive: p.isActive,
        hasPin: p.pinHash != null,
        hasCard: p.cardId != null,
        cardImageSentAt: p.cardImageSentAt,
        credentialsSentAt: p.credentialsSentAt,
      })),
      total: items.length,
    });
  } catch (e) {
    next(e);
  }
});

/** CSV import: accepts JSON array [{name, phone?}] OR {csv: "name,phone\n..."}. */
router.post('/players/import', requireGame, async (req, res, next) => {
  try {
    if (req.game!.status !== 'setup') throw err('GAME_LOCKED', 'Players can only be imported while in setup', 409);
    let inputs: { name?: string; phone?: string | null }[];
    if (typeof (req.body as { csv?: unknown })?.csv === 'string') {
      inputs = parsePlayerCsv((req.body as { csv: string }).csv);
    } else {
      const parsed = importPlayersSchema.safeParse(req.body);
      if (!parsed.success) {
        throw err('VALIDATION_ERROR', 'Body must be [{name, phone?}] or {csv: "..."}', 422, {
          issues: parsed.error.issues,
        });
      }
      inputs = parsed.data;
    }
    const result = await addPlayers(req.game!, inputs as { name?: string; phone?: string | null }[]);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/players', requireGame, validateBody(createPlayerSchema), async (req, res, next) => {
  try {
    if (req.game!.status !== 'setup') throw err('GAME_LOCKED', 'Players can only be added while in setup', 409);
    const result = await addPlayers(req.game!, [req.body as { name?: string; phone?: string }]);
    res.status(201).json(result.players[0]);
  } catch (e) {
    next(e);
  }
});

router.patch('/players/:id', requireGame, validateBody(updatePlayerSchema), async (req, res, next) => {
  try {
    const player = await Player.findOne({ _id: req.params.id, gameId: req.game!._id });
    if (!player) throw err('PLAYER_NOT_FOUND', 'Player not found', 404);
    const body = req.body as { name?: string; phone?: string | null; loginId?: string; isActive?: boolean };
    if (body.name != null) player.name = body.name;
    if (body.phone !== undefined) {
      const normalized = body.phone ? normalizePhone(body.phone, req.game!.defaultCountryCode) : null;
      player.phone = normalized;
      player.pinHash = normalized ? await hashSecret(normalized) : null;
    }
    if (body.loginId != null) player.loginId = body.loginId;
    if (body.isActive !== undefined) player.isActive = body.isActive;
    try {
      await player.save();
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw err('DUPLICATE_LOGIN_ID', 'Login ID already exists', 409);
      throw e;
    }
    res.json({ id: String(player._id), serial: player.serial, name: player.name, loginId: player.loginId });
  } catch (e) {
    next(e);
  }
});

router.delete('/players/:id', requireGame, async (req, res, next) => {
  try {
    if (req.game!.status !== 'setup') throw err('GAME_LOCKED', 'Players can only be deleted while in setup', 409);
    const player = await Player.findOneAndDelete({ _id: req.params.id, gameId: req.game!._id });
    if (!player) throw err('PLAYER_NOT_FOUND', 'Player not found', 404);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Sent-flag tracking for the distribution flow. */
router.patch('/players/:id/sent', requireGame, validateBody(sentFlagsSchema), async (req, res, next) => {
  try {
    const player = await Player.findOne({ _id: req.params.id, gameId: req.game!._id });
    if (!player) throw err('PLAYER_NOT_FOUND', 'Player not found', 404);
    const body = req.body as { cardImageSent?: boolean; credentialsSent?: boolean };
    if (body.cardImageSent !== undefined) player.cardImageSentAt = body.cardImageSent ? new Date() : null;
    if (body.credentialsSent !== undefined) player.credentialsSentAt = body.credentialsSent ? new Date() : null;
    await player.save();
    res.json({ id: String(player._id), cardImageSentAt: player.cardImageSentAt, credentialsSentAt: player.credentialsSentAt });
  } catch (e) {
    next(e);
  }
});

/** Full player detail: card grid, marked/remaining, per-number draw seq history. */
router.get('/players/:id', requireGame, async (req, res, next) => {
  try {
    const player = await Player.findOne({ _id: req.params.id, gameId: req.game!._id }).lean();
    if (!player) throw err('PLAYER_NOT_FOUND', 'Player not found', 404);
    const card = await Card.findOne({ gameId: req.game!._id, serial: player.serial }).lean();
    const draws = await Draw.find({ gameId: req.game!._id, isActive: true }).select('seq number').lean();
    const seqByNumber = new Map(draws.map((d) => [d.number, d.seq]));
    const { progress } = await getProgress(req.game!);
    const me = progress.players.find((p) => p.serial === player.serial) ?? null;
    res.json({
      id: String(player._id),
      serial: player.serial,
      name: player.name,
      phone: player.phone,
      loginId: player.loginId,
      isActive: player.isActive,
      cardImageSentAt: player.cardImageSentAt,
      credentialsSentAt: player.credentialsSentAt,
      card: card ? { grid: card.grid, verifyCode: card.verifyCode } : null,
      marked: me?.marked ?? [],
      remaining: me?.remaining ?? [],
      markedCount: me?.markedCount ?? 0,
      remainingCount: me?.remainingCount ?? 0,
      rank: me?.rank ?? null,
      completedAtSeq: me?.completedAtSeq ?? null,
      markHistory: (card?.grid as number[] | undefined)?.map((n) => ({ number: n, seq: seqByNumber.get(n) ?? null })) ?? [],
    });
  } catch (e) {
    next(e);
  }
});

export default router;
