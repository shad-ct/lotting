import { describe, expect, it } from 'vitest';
import { CARD_SIZE, GRID_COLS, GRID_ROWS, MAX_NUMBER, PLAYER_COUNT_DEFAULT } from './constants';

describe('scaffold', () => {
  it('shared constants match 01_DATA_AND_CARD_GENERATION.md section 1', () => {
    expect(MAX_NUMBER).toBe(110);
    expect(CARD_SIZE).toBe(16);
    expect(GRID_ROWS).toBe(4);
    expect(GRID_COLS).toBe(4);
    expect(PLAYER_COUNT_DEFAULT).toBe(110);
    expect(GRID_ROWS * GRID_COLS).toBe(CARD_SIZE);
  });
});
