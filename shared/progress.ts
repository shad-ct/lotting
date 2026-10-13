import type { DrawRef } from './types.js';
import { evaluateRules } from './winRules.js';
import type { WinRules } from './types.js';

/**
 * Progress engine (01 §7, 02 §5). PURE: derives everything from
 * (cards, activeDraws). The server never stores marks/ranks/winners.
 */

export interface CardInput {
  serial: number;
  playerId: string;
  name: string;
  grid: number[];
  isActive?: boolean;
}

export interface PlayerProgress {
  serial: number;
  playerId: string;
  name: string;
  markedCount: number;
  remainingCount: number;
  marked: number[];
  remaining: number[];
  completedAtSeq: number | null;
  reachedCountAtSeq: number[];
  rank: number;
  isTie: boolean;
  prizesWon: string[];
  isActive: boolean;
}

export interface HotNumber {
  number: number;
  wouldCompleteCount: number;
  wouldCompletePlayers: number[];
}

export interface ProgressResult {
  players: PlayerProgress[];
  histogram: Record<number, number>;
  closeToWin: PlayerProgress[];
  hotNumbers: HotNumber[];
}

export interface ComputeOptions {
  winRules: WinRules;
  closeThreshold?: number;
  includeInactiveInRank?: boolean;
  hotLimit?: number;
}

/**
 * reachedCountAtSeq[k] = seq at which the k-th mark arrived (0 for k=0).
 * Computed by sorting the draw-seq of each card number ascending.
 */
function reachedCounts(grid: number[], seqByNumber: Map<number, number>): number[] {
  const seqs = grid.map((n) => seqByNumber.get(n)).filter((s): s is number => s != null);
  seqs.sort((a, b) => a - b);
  const out: number[] = new Array(grid.length + 1).fill(0);
  out[0] = 0;
  for (let k = 1; k <= grid.length; k++) {
    out[k] = k <= seqs.length ? seqs[k - 1] : 0;
  }
  return out;
}

export function computeProgress(
  cards: CardInput[],
  activeDraws: DrawRef[],
  opts: ComputeOptions,
): ProgressResult {
  const closeThreshold = opts.closeThreshold ?? 3;
  const includeInactive = opts.includeInactiveInRank ?? true;
  const hotLimit = opts.hotLimit ?? 10;

  const drawnSet = new Set(activeDraws.map((d) => d.number));
  const seqByNumber = new Map<number, number>();
  for (const d of activeDraws) {
    const prev = seqByNumber.get(d.number);
    if (prev == null || d.seq < prev) seqByNumber.set(d.number, d.seq);
  }

  const interim: PlayerProgress[] = cards.map((card) => {
    const marked = card.grid.filter((n) => drawnSet.has(n));
    const remaining = card.grid.filter((n) => !drawnSet.has(n));
    const reached = reachedCounts(card.grid, seqByNumber);
    const completedAtSeq = remaining.length === 0 && card.grid.length > 0 ? reached[card.grid.length] : null;
    const { satisfied } = evaluateRules(card.grid, drawnSet, opts.winRules);
    return {
      serial: card.serial,
      playerId: card.playerId,
      name: card.name,
      markedCount: marked.length,
      remainingCount: remaining.length,
      marked: [...marked].sort((a, b) => a - b),
      remaining: [...remaining].sort((a, b) => a - b),
      completedAtSeq,
      reachedCountAtSeq: reached,
      rank: 0,
      isTie: false,
      prizesWon: satisfied,
      isActive: card.isActive ?? true,
    };
  });

  // Ranking: markedCount desc, then earliest seq reaching that count, then serial.
  const ranked = [...interim].sort((a, b) => {
    if (b.markedCount !== a.markedCount) return b.markedCount - a.markedCount;
    const aSeq = a.reachedCountAtSeq[a.markedCount] ?? 0;
    const bSeq = b.reachedCountAtSeq[b.markedCount] ?? 0;
    if (aSeq !== bSeq) return aSeq - bSeq;
    return a.serial - b.serial;
  });

  // Competition ranking ("1,2,2,4"): same (markedCount, reachedSeq) share a rank.
  let currentRank = 0;
  let prevKey: string | null = null;
  const rankGroupSize = new Map<number, number>();
  ranked.forEach((p, idx) => {
    const key = `${p.markedCount}:${p.reachedCountAtSeq[p.markedCount] ?? 0}`;
    if (key !== prevKey) {
      currentRank = idx + 1;
      prevKey = key;
    }
    p.rank = currentRank;
  });
  for (const p of ranked) {
    rankGroupSize.set(p.rank, (rankGroupSize.get(p.rank) ?? 0) + 1);
  }
  for (const p of ranked) {
    p.isTie = (rankGroupSize.get(p.rank) ?? 0) > 1;
  }

  const histogram: Record<number, number> = {};
  for (const p of interim) {
    histogram[p.markedCount] = (histogram[p.markedCount] ?? 0) + 1;
  }

  const closeToWin = ranked.filter(
    (p) => p.isActive && p.remainingCount > 0 && p.remainingCount <= closeThreshold,
  );

  // hotNumbers: undrawn numbers that complete someone's card (remaining == {x}).
  const drawnNums = new Set(activeDraws.map((d) => d.number));
  const byNumber = new Map<number, number[]>();
  for (const p of ranked) {
    if (!p.isActive) continue;
    if (p.remainingCount !== 1) continue;
    const x = p.remaining[0];
    if (drawnNums.has(x)) continue;
    const list = byNumber.get(x) ?? [];
    list.push(p.serial);
    byNumber.set(x, list);
  }
  const hotNumbers: HotNumber[] = [...byNumber.entries()]
    .map(([number, serials]) => ({
      number,
      wouldCompleteCount: serials.length,
      wouldCompletePlayers: serials.sort((a, b) => a - b),
    }))
    .sort((a, b) => b.wouldCompleteCount - a.wouldCompleteCount || a.number - b.number)
    .slice(0, hotLimit);

  void includeInactive;
  return { players: ranked, histogram, closeToWin, hotNumbers };
}
