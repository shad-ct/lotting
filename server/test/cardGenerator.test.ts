import { describe, expect, it } from 'vitest';
import { generateCards } from '../../server/src/services/cardGenerator.js';

const DEFAULT_CONFIG = { playerCount: 110, cardSize: 16, maxNumber: 110 };

function occurrences(cards: number[][], maxNumber: number): number[] {
  const counts = new Array<number>(maxNumber).fill(0);
  for (const card of cards) for (const n of card) counts[n - 1]++;
  return counts;
}

describe('cardGenerator (05 §2.1)', () => {
  it('110 cards, each length 16, distinct ints in 1..110', () => {
    const { cards } = generateCards(DEFAULT_CONFIG, 'seed-acceptance-1');
    expect(cards).toHaveLength(110);
    for (const card of cards) {
      expect(card).toHaveLength(16);
      expect(new Set(card).size).toBe(16);
      for (const n of card) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(110);
      }
    }
  });

  it('all canonical keys distinct', () => {
    const { cards } = generateCards(DEFAULT_CONFIG, 'seed-keys');
    const keys = cards.map((c) => [...c].sort((a, b) => a - b).join('-'));
    expect(new Set(keys).size).toBe(110);
  });

  it('balanced: every number appears exactly 16 times', () => {
    const { cards } = generateCards(DEFAULT_CONFIG, 'seed-balanced');
    const counts = occurrences(cards, 110);
    for (const c of counts) expect(c).toBe(16);
  });

  it('deterministic: same seed → deep-equal; different seed → different', () => {
    const a = generateCards(DEFAULT_CONFIG, 'same-seed');
    const b = generateCards(DEFAULT_CONFIG, 'same-seed');
    expect(a.cards).toEqual(b.cards);
    const c = generateCards(DEFAULT_CONFIG, 'different-seed');
    expect(c.cards).not.toEqual(a.cards);
  });

  it('200 seeds all satisfy properties within budget', () => {
    const start = Date.now();
    for (let s = 0; s < 200; s++) {
      const { cards } = generateCards(DEFAULT_CONFIG, `loop-${s}`);
      expect(cards).toHaveLength(110);
      const keys = new Set(cards.map((c) => [...c].sort((x, y) => x - y).join('-')));
      expect(keys.size).toBe(110);
      for (const c of occurrences(cards, 110)) expect(c).toBe(16);
    }
    expect(Date.now() - start).toBeLessThan(120_000);
  });

  it('single generation completes in under 2 seconds', () => {
    const start = Date.now();
    generateCards(DEFAULT_CONFIG, 'perf-check');
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('non-integer quotient: near-balanced counts differ by ≤ 1', () => {
    const { cards } = generateCards({ playerCount: 100, cardSize: 15, maxNumber: 110 }, 'near-balanced');
    const counts = occurrences(cards, 110);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('overlap cap 10: no pair exceeds it', () => {
    const { cards } = generateCards({ ...DEFAULT_CONFIG, maxOverlap: 10 }, 'overlap-cap');
    const sets = cards.map((c) => new Set(c));
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        let overlap = 0;
        for (const x of sets[i]) if (sets[j].has(x)) overlap++;
        expect(overlap).toBeLessThanOrEqual(10);
      }
    }
  });

  it('impossible config (cardSize > maxNumber) throws', () => {
    expect(() => generateCards({ playerCount: 5, cardSize: 20, maxNumber: 10 }, 'x')).toThrow();
  });

  it('invalid maxOverlap (< 0 or >= cardSize) throws INVALID_MAX_OVERLAP', () => {
    expect(() => generateCards({ ...DEFAULT_CONFIG, maxOverlap: -1 }, 'x')).toThrow('INVALID_MAX_OVERLAP');
    expect(() => generateCards({ ...DEFAULT_CONFIG, maxOverlap: 16 }, 'x')).toThrow('INVALID_MAX_OVERLAP');
  });

  it('tight overlap cap forces repair: 20×6/30 with cap 2 ends ≤ 2', () => {
    for (let s = 0; s < 5; s++) {
      const { cards } = generateCards({ playerCount: 20, cardSize: 6, maxNumber: 30, maxOverlap: 2 }, `tight-cap-${s}`);
      const sets = cards.map((c) => new Set(c));
      for (let i = 0; i < sets.length; i++) {
        for (let j = i + 1; j < sets.length; j++) {
          let overlap = 0;
          for (const x of sets[i]) if (sets[j].has(x)) overlap++;
          expect(overlap).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('small-combination space (9×3/6): uniqueness fix keeps all keys distinct', () => {
    for (let s = 0; s < 10; s++) {
      const { cards } = generateCards({ playerCount: 9, cardSize: 3, maxNumber: 6 }, `tight-unique-${s}`);
      expect(cards).toHaveLength(9);
      const keys = cards.map((c) => [...c].sort((a, b) => a - b).join('-'));
      expect(new Set(keys).size).toBe(9);
      for (const card of cards) expect(new Set(card).size).toBe(3);
    }
  });
});
