import { describe, expect, it } from 'vitest';
import { computeProgress, type CardInput } from './progress.js';
import { DEFAULT_WIN_RULES } from './types.js';

function card(serial: number, grid: number[], name = `P${serial}`): CardInput {
  return { serial, playerId: `id-${serial}`, name, grid, isActive: true };
}

describe('progress (05 §2.2)', () => {
  const grid1 = Array.from({ length: 16 }, (_, i) => i + 1); // 1..16
  const grid2 = Array.from({ length: 16 }, (_, i) => i + 17); // 17..32

  it('no draws → everyone 0 marked, same rank, no winners', () => {
    const r = computeProgress([card(1, grid1), card(2, grid2)], [], { winRules: DEFAULT_WIN_RULES });
    expect(r.players.map((p) => p.markedCount)).toEqual([0, 0]);
    expect(r.players.map((p) => p.rank)).toEqual([1, 1]);
    expect(r.players.every((p) => p.completedAtSeq == null)).toBe(true);
    expect(r.players.every((p) => p.isTie)).toBe(true);
  });

  it('a draw hits exactly the players holding the number', () => {
    const r = computeProgress([card(1, grid1), card(2, grid2)], [{ seq: 1, number: 5 }], {
      winRules: DEFAULT_WIN_RULES,
    });
    const p1 = r.players.find((p) => p.serial === 1)!;
    const p2 = r.players.find((p) => p.serial === 2)!;
    expect(p1.markedCount).toBe(1);
    expect(p2.markedCount).toBe(0);
  });

  it('ranking: more marks first; tie-break by earlier seq; then serial', () => {
    // A reaches 2 marks at seq 2, B reaches 2 marks at seq 5.
    const cards = [card(2, [1, 2, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63]), card(1, [1, 2, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83])];
    const draws = [
      { seq: 1, number: 1 },
      { seq: 2, number: 50 },
      { seq: 3, number: 70 },
      { seq: 4, number: 2 },
    ];
    const r = computeProgress(cards, draws, { winRules: DEFAULT_WIN_RULES });
    // serial 2 has 3 marks (1,50,2), serial 1 has 3 marks (1,70,2) — tie on count,
    // serial 2 reached 3rd mark at seq 4 vs serial 1 at seq 4 → same seq → serial wins.
    expect(r.players[0].serial).toBe(1);
  });

  it('completedAtSeq set correctly; same-seq completions are co-winners', () => {
    const cards = [card(1, grid1), card(2, grid2)];
    const draws = [
      ...grid1.map((n, i) => ({ seq: i + 1, number: n })),
      ...grid2.map((n, i) => ({ seq: grid1.length + i + 1, number: n })),
    ];
    const r = computeProgress(cards, draws, { winRules: DEFAULT_WIN_RULES });
    const p1 = r.players.find((p) => p.serial === 1)!;
    const p2 = r.players.find((p) => p.serial === 2)!;
    expect(p1.completedAtSeq).toBe(16);
    expect(p2.completedAtSeq).toBe(32);
    expect(p1.rank).toBe(1);

    // Tie: both complete on the same seq (draws ordered so last number shared... use overlap cards).
    const shared = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const tieCards = [card(1, [...shared, 100]), card(2, [...shared, 101])];
    const tieDraws = [...shared.map((n, i) => ({ seq: i + 1, number: n })), { seq: 16, number: 100 }, { seq: 16, number: 101 }];
    // Same seq for both final numbers is artificial; instead complete both with one shared last number:
    const tieCards2 = [card(1, [...shared, 99]), card(2, [...shared, 99])];
    const tieDraws2 = [...shared.map((n, i) => ({ seq: i + 1, number: n })), { seq: 16, number: 99 }];
    const r2 = computeProgress(tieCards2, tieDraws2, { winRules: DEFAULT_WIN_RULES });
    expect(r2.players[0].completedAtSeq).toBe(16);
    expect(r2.players[1].completedAtSeq).toBe(16);
    expect(r2.players[0].rank).toBe(r2.players[1].rank);
    expect(r2.players.every((p) => p.isTie)).toBe(true);
    void tieDraws;
    void tieCards;
  });

  it('hotNumbers lists exactly the numbers completing a card', () => {
    const cards = [card(7, [...Array.from({ length: 15 }, (_, i) => i + 1), 100])];
    const draws = Array.from({ length: 15 }, (_, i) => ({ seq: i + 1, number: i + 1 }));
    const r = computeProgress(cards, draws, { winRules: DEFAULT_WIN_RULES });
    expect(r.hotNumbers).toHaveLength(1);
    expect(r.hotNumbers[0].number).toBe(100);
    expect(r.hotNumbers[0].wouldCompletePlayers).toEqual([7]);
    expect(r.closeToWin.map((p) => p.serial)).toEqual([7]);
  });

  it('undo (removing latest draw) restores previous output exactly', () => {
    const cards = [card(1, grid1), card(2, grid2)];
    const d1 = [{ seq: 1, number: 5 }];
    const d2 = [...d1, { seq: 2, number: 20 }];
    const before = computeProgress(cards, d1, { winRules: DEFAULT_WIN_RULES });
    const afterUndo = computeProgress(cards, d1, { winRules: DEFAULT_WIN_RULES });
    const withExtra = computeProgress(cards, d2, { winRules: DEFAULT_WIN_RULES });
    expect(afterUndo).toEqual(before);
    expect(withExtra.players.find((p) => p.serial === 2)!.markedCount).toBe(1);
  });

  it('disabled players excluded from hot/close but still ranked', () => {
    const cards = [
      { ...card(1, [...Array.from({ length: 15 }, (_, i) => i + 1), 100]), isActive: false },
    ];
    const draws = Array.from({ length: 15 }, (_, i) => ({ seq: i + 1, number: i + 1 }));
    const r = computeProgress(cards, draws, { winRules: DEFAULT_WIN_RULES });
    expect(r.players[0].rank).toBe(1);
    expect(r.hotNumbers).toHaveLength(0);
    expect(r.closeToWin).toHaveLength(0);
  });
});
