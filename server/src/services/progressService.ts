import type { Types } from 'mongoose';
import { computeProgress, type CardInput, type ProgressResult } from '@lotto/shared/progress.js';
import type { WinRules } from '@lotto/shared/types.js';
import { Card } from '../models/Card.js';
import { Draw } from '../models/Draw.js';
import { Game, type GameDoc } from '../models/Game.js';
import { Player } from '../models/Player.js';

/**
 * Progress service: loads cards + active draws and runs the pure engine.
 * Recomputes from scratch every draw (110×16 is microseconds) with an
 * in-memory cache keyed by (gameId, lastActiveSeq).
 */
const cache = new Map<string, { lastSeq: number; result: ProgressResult }>();

export interface GameContext {
  game: GameDoc;
  cards: CardInput[];
  draws: { seq: number; number: number }[];
  lastSeq: number;
}

export async function getCurrentGame(): Promise<GameDoc | null> {
  return Game.findOne().sort({ createdAt: -1 });
}

export async function loadContext(game: GameDoc): Promise<GameContext> {
  const gameId = game._id as Types.ObjectId;
  const [players, cards, draws] = await Promise.all([
    Player.find({ gameId }).select('_id serial name cardId isActive').lean(),
    Card.find({ gameId }).select('serial grid').lean(),
    Draw.find({ gameId, isActive: true }).sort({ seq: 1 }).select('seq number').lean(),
  ]);
  const cardBySerial = new Map(cards.map((c) => [c.serial, c.grid as number[]]));
  const playerByCard = new Map<string, { serial: number; name: string; isActive: boolean }>();
  for (const p of players) {
    if (p.cardId) playerByCard.set(String(p.cardId), { serial: p.serial, name: p.name, isActive: p.isActive });
  }
  // Cards are the unit of progress; join player meta via serial.
  const cardInputs: CardInput[] = [];
  const cardsDocs = await Card.find({ gameId }).select('serial grid').lean();
  const playerBySerial = new Map(players.map((p) => [p.serial, p]));
  for (const c of cardsDocs) {
    const p = playerBySerial.get(c.serial);
    cardInputs.push({
      serial: c.serial,
      playerId: p ? String(p._id) : `unassigned-${c.serial}`,
      name: p?.name ?? `Card ${c.serial}`,
      grid: c.grid as number[],
      isActive: p?.isActive ?? true,
    });
  }
  void cardBySerial;
  void playerByCard;
  const lastSeq = draws.length === 0 ? 0 : Math.max(...draws.map((d) => d.seq));
  return { game, cards: cardInputs, draws, lastSeq };
}

function winRulesOf(game: GameDoc): WinRules {
  const w = (game.winRules ?? {}) as Partial<WinRules>;
  return {
    fullCard: w.fullCard ?? { enabled: true },
    anyRow: w.anyRow ?? { enabled: false },
    anyColumn: w.anyColumn ?? { enabled: false },
    fourCorners: w.fourCorners ?? { enabled: false },
    diagonals: w.diagonals ?? { enabled: false },
    firstToMarks: w.firstToMarks ?? { enabled: false, marks: 8 },
    stopAtFirstFullCard: w.stopAtFirstFullCard ?? true,
  };
}

export async function getProgress(game: GameDoc): Promise<{ ctx: GameContext; progress: ProgressResult }> {
  const ctx = await loadContext(game);
  const key = `${String(game._id)}:${ctx.lastSeq}`;
  const cached = cache.get(key);
  if (cached && cached.lastSeq === ctx.lastSeq) return { ctx, progress: cached.result };
  const progress = computeProgress(ctx.cards, ctx.draws, {
    winRules: winRulesOf(game),
    closeThreshold: game.closeThreshold ?? 3,
    includeInactiveInRank: game.includeInactiveInRank ?? true,
    hotLimit: 10,
  });
  cache.set(key, { lastSeq: ctx.lastSeq, result: progress });
  if (cache.size > 50) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return { ctx, progress };
}

export function _resetProgressCache(): void {
  cache.clear();
}

export { winRulesOf };
