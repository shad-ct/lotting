import type { Types } from 'mongoose';
import { evaluateRules } from '@lotto/shared/winRules.js';
import type { WinRules } from '@lotto/shared/types.js';
import { WinEvent } from '../models/WinEvent.js';

/**
 * Winner detection + confirmation flow (02 §7).
 * Detection compares rules satisfied before vs after the new draw so each
 * prize is recorded once, to whoever hit it first — ties allowed.
 */

export interface NewWinner {
  serial: number;
  name: string;
  rule: string;
}

/** Which enabled rules each active player newly satisfies because of drawNumber. */
export function detectNewlySatisfied(
  cards: { serial: number; name: string; grid: number[]; isActive?: boolean }[],
  drawnBefore: Set<number>,
  drawnAfter: Set<number>,
  rules: WinRules,
): Map<string, { serial: number; name: string }[]> {
  const byRule = new Map<string, { serial: number; name: string }[]>();
  for (const card of cards) {
    if (!card.isActive) continue;
    const { satisfied: after } = evaluateRules(card.grid, drawnAfter, rules);
    if (after.length === 0) continue;
    const { satisfied: before } = evaluateRules(card.grid, drawnBefore, rules);
    for (const rule of after) {
      if (before.includes(rule)) continue; // already held this prize
      const list = byRule.get(rule) ?? [];
      list.push({ serial: card.serial, name: card.name });
      byRule.set(rule, list);
    }
  }
  return byRule;
}

export async function recordWinEvents(
  gameId: Types.ObjectId,
  drawSeq: number,
  byRule: Map<string, { serial: number; name: string }[]>,
  playerIdBySerial: Map<number, Types.ObjectId>,
): Promise<{ eventId: string; rule: string; placing: number; players: { serial: number; name: string }[] }[]> {
  const existing = await WinEvent.countDocuments({ gameId, status: { $in: ['confirmed', 'pending'] } });
  const created: { eventId: string; rule: string; placing: number; players: { serial: number; name: string }[] }[] = [];
  let offset = 0;
  for (const [rule, players] of byRule) {
    const playerIds = players
      .map((p) => playerIdBySerial.get(p.serial))
      .filter((id): id is Types.ObjectId => id != null);
    if (playerIds.length === 0) continue;
    const ev = await WinEvent.create({
      gameId,
      drawSeq,
      rule,
      playerIds,
      status: 'pending',
      placing: existing + offset + 1,
    });
    created.push({ eventId: String(ev._id), rule, placing: ev.placing, players });
    offset++;
  }
  return created;
}

/** Withdraw pending detections caused by an undone draw. */
export async function withdrawPendingForDraw(gameId: Types.ObjectId, drawSeq: number): Promise<number> {
  const res = await WinEvent.updateMany(
    { gameId, drawSeq, status: 'pending' },
    { $set: { status: 'withdrawn', resolvedAt: new Date() } },
  );
  return res.modifiedCount ?? 0;
}
