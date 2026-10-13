import { CARD_SIZE, GRID_COLS, GRID_ROWS } from './constants.js';
import type { WinRules } from './types.js';

/**
 * Config-driven win-rule engine (01 §6).
 * Each rule is a pure `(grid, drawnSet) => satisfied` plus a
 * `needed(...)` count used for "closest to winning" ranking.
 * Grid is row-major, GRID_ROWS x GRID_COLS.
 */

export type RuleName =
  | 'fullCard'
  | 'anyRow'
  | 'anyColumn'
  | 'fourCorners'
  | 'diagonals'
  | 'firstToMarks';

export const ALL_RULE_NAMES: RuleName[] = [
  'fullCard',
  'anyRow',
  'anyColumn',
  'fourCorners',
  'diagonals',
  'firstToMarks',
];

function rows(grid: number[]): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) out.push(grid.slice(r * GRID_COLS, r * GRID_COLS + GRID_COLS));
  return out;
}

function columns(grid: number[]): number[][] {
  const out: number[][] = [];
  for (let c = 0; c < GRID_COLS; c++) {
    const col: number[] = [];
    for (let r = 0; r < GRID_ROWS; r++) col.push(grid[r * GRID_COLS + c]);
    out.push(col);
  }
  return out;
}

function corners(grid: number[]): number[] {
  return [
    grid[0],
    grid[GRID_COLS - 1],
    grid[(GRID_ROWS - 1) * GRID_COLS],
    grid[GRID_ROWS * GRID_COLS - 1],
  ];
}

function diagonals(grid: number[]): number[][] {
  const d1: number[] = [];
  const d2: number[] = [];
  for (let i = 0; i < GRID_ROWS; i++) {
    d1.push(grid[i * GRID_COLS + i]);
    d2.push(grid[i * GRID_COLS + (GRID_COLS - 1 - i)]);
  }
  return [d1, d2];
}

export function ruleSatisfied(
  rule: RuleName,
  grid: number[],
  drawnSet: Set<number>,
  rules: WinRules,
): boolean {
  switch (rule) {
    case 'fullCard':
      return grid.every((n) => drawnSet.has(n));
    case 'anyRow':
      return rows(grid).some((row) => row.every((n) => drawnSet.has(n)));
    case 'anyColumn':
      return columns(grid).some((col) => col.every((n) => drawnSet.has(n)));
    case 'fourCorners':
      return corners(grid).every((n) => drawnSet.has(n));
    case 'diagonals':
      return diagonals(grid).some((d) => d.every((n) => drawnSet.has(n)));
    case 'firstToMarks': {
      const marks = grid.filter((n) => drawnSet.has(n)).length;
      return marks >= rules.firstToMarks.marks;
    }
  }
}

/** How many more numbers are needed to satisfy the rule (0 = satisfied). */
export function ruleNeeded(
  rule: RuleName,
  grid: number[],
  drawnSet: Set<number>,
  rules: WinRules,
): number {
  const missing = (cells: number[]) => cells.filter((n) => !drawnSet.has(n)).length;
  switch (rule) {
    case 'fullCard':
      return missing(grid);
    case 'anyRow':
      return Math.min(...rows(grid).map(missing));
    case 'anyColumn':
      return Math.min(...columns(grid).map(missing));
    case 'fourCorners':
      return missing(corners(grid));
    case 'diagonals':
      return Math.min(...diagonals(grid).map(missing));
    case 'firstToMarks': {
      const marks = grid.filter((n) => drawnSet.has(n)).length;
      return Math.max(0, rules.firstToMarks.marks - marks);
    }
  }
}

export function isRuleEnabled(rule: RuleName, rules: WinRules): boolean {
  switch (rule) {
    case 'fullCard':
      return rules.fullCard.enabled;
    case 'anyRow':
      return rules.anyRow.enabled;
    case 'anyColumn':
      return rules.anyColumn.enabled;
    case 'fourCorners':
      return rules.fourCorners.enabled;
    case 'diagonals':
      return rules.diagonals.enabled;
    case 'firstToMarks':
      return rules.firstToMarks.enabled;
  }
}

export interface RuleEvaluation {
  satisfied: RuleName[];
  neededByRule: Record<RuleName, number>;
}

/** Run every ENABLED rule; returns satisfied list + needed counts. */
export function evaluateRules(grid: number[], drawnSet: Set<number>, rules: WinRules): RuleEvaluation {
  const satisfied: RuleName[] = [];
  const neededByRule = {} as Record<RuleName, number>;
  for (const name of ALL_RULE_NAMES) {
    if (!isRuleEnabled(name, rules)) continue;
    neededByRule[name] = ruleNeeded(name, grid, drawnSet, rules);
    if (neededByRule[name] === 0 && ruleSatisfied(name, grid, drawnSet, rules)) {
      satisfied.push(name);
    }
  }
  return { satisfied, neededByRule };
}

export function validateGrid(grid: number[], maxNumber: number): void {
  if (!Array.isArray(grid) || grid.length !== CARD_SIZE) {
    throw new Error(`GRID_MUST_HAVE_${CARD_SIZE}_NUMBERS`);
  }
  const seen = new Set<number>();
  for (const n of grid) {
    if (!Number.isInteger(n) || n < 1 || n > maxNumber) throw new Error('INVALID_NUMBER');
    if (seen.has(n)) throw new Error('DUPLICATE_NUMBER_IN_CARD');
    seen.add(n);
  }
}
