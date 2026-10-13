import { describe, expect, it } from 'vitest';
import { evaluateRules } from './winRules.js';
import { DEFAULT_WIN_RULES } from './types.js';

// 4x4 grid:
//  1  2  3  4
//  5  6  7  8
//  9 10 11 12
// 13 14 15 16
const GRID = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

describe('winRules engine (05 §2.3)', () => {
  it('fullCard', () => {
    const full = new Set(GRID);
    expect(evaluateRules(GRID, full, DEFAULT_WIN_RULES).satisfied).toContain('fullCard');
    const partial = new Set(GRID.slice(0, 15));
    expect(evaluateRules(GRID, partial, DEFAULT_WIN_RULES).satisfied).not.toContain('fullCard');
  });

  it('anyRow', () => {
    const rules = { ...DEFAULT_WIN_RULES, anyRow: { enabled: true } };
    expect(evaluateRules(GRID, new Set([1, 2, 3, 4]), rules).satisfied).toContain('anyRow');
    expect(evaluateRules(GRID, new Set([1, 2, 3, 5]), rules).satisfied).not.toContain('anyRow');
  });

  it('anyColumn', () => {
    const rules = { ...DEFAULT_WIN_RULES, anyColumn: { enabled: true } };
    expect(evaluateRules(GRID, new Set([1, 5, 9, 13]), rules).satisfied).toContain('anyColumn');
    expect(evaluateRules(GRID, new Set([1, 5, 9, 14]), rules).satisfied).not.toContain('anyColumn');
  });

  it('fourCorners', () => {
    const rules = { ...DEFAULT_WIN_RULES, fourCorners: { enabled: true } };
    expect(evaluateRules(GRID, new Set([1, 4, 13, 16]), rules).satisfied).toContain('fourCorners');
    expect(evaluateRules(GRID, new Set([1, 4, 13]), rules).satisfied).not.toContain('fourCorners');
  });

  it('diagonals', () => {
    const rules = { ...DEFAULT_WIN_RULES, diagonals: { enabled: true } };
    expect(evaluateRules(GRID, new Set([1, 6, 11, 16]), rules).satisfied).toContain('diagonals');
    expect(evaluateRules(GRID, new Set([4, 7, 10, 13]), rules).satisfied).toContain('diagonals');
    expect(evaluateRules(GRID, new Set([1, 6, 11]), rules).satisfied).not.toContain('diagonals');
  });

  it('firstToMarks', () => {
    const rules = { ...DEFAULT_WIN_RULES, firstToMarks: { enabled: true, marks: 8 } };
    expect(evaluateRules(GRID, new Set([1, 2, 3, 4, 5, 6, 7, 8]), rules).satisfied).toContain(
      'firstToMarks',
    );
    expect(evaluateRules(GRID, new Set([1, 2, 3]), rules).satisfied).not.toContain('firstToMarks');
  });

  it('needed counts report distance to completion', () => {
    const rules = { ...DEFAULT_WIN_RULES, anyRow: { enabled: true } };
    const ev = evaluateRules(GRID, new Set([1, 2, 3]), rules);
    expect(ev.neededByRule.anyRow).toBe(1);
    expect(ev.neededByRule.fullCard).toBe(13);
  });
});
