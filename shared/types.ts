/**
 * Shared domain types. Single source of truth for Game/Player/Card/Draw/WinEvent
 * shapes used by server, web and (later) Flutter via OpenAPI.
 * Game flags include the Phase-0 agreed additions:
 * showExactRankToPlayers, closeThreshold, maxOverlap, defaultCountryCode,
 * appUrl, whatsappTemplate, includeInactiveInRank.
 */

export type GameStatus = 'setup' | 'ready' | 'live' | 'finished';

export type GameMode = 'housefull' | 'cross';

export interface WinRules {
  fullCard: { enabled: boolean };
  anyRow: { enabled: boolean };
  anyColumn: { enabled: boolean };
  fourCorners: { enabled: boolean };
  diagonals: { enabled: boolean };
  firstToMarks: { enabled: boolean; marks: number };
  stopAtFirstFullCard: boolean;
}

export const DEFAULT_WIN_RULES: WinRules = {
  fullCard: { enabled: true },
  anyRow: { enabled: false },
  anyColumn: { enabled: false },
  fourCorners: { enabled: false },
  diagonals: { enabled: true },
  firstToMarks: { enabled: false, marks: 8 },
  stopAtFirstFullCard: false, // game now continues until maxPrizePlaces confirmed winners
};

/** Win rules preset for Cross mode (any complete row or column). */
export const CROSS_WIN_RULES: WinRules = {
  fullCard: { enabled: false },
  anyRow: { enabled: true },
  anyColumn: { enabled: true },
  fourCorners: { enabled: false },
  diagonals: { enabled: true },
  firstToMarks: { enabled: false, marks: 8 },
  stopAtFirstFullCard: false,
};

export const DEFAULT_WHATSAPP_TEMPLATE =
  'Hi {{name}}! Your {{gameName}} card is #{{serial}}.\n' +
  'Live card: {{appUrl}}\n' +
  'Login ID: {{loginId}}\n' +
  'PIN: {{pin}}\n' +
  'Your card image is attached. Numbers are marked live in the app.';

export interface GenerationStats {
  seed: string;
  perNumberCounts: { min: number; max: number };
  maxPairwiseOverlap: number;
  meanPairwiseOverlap: number;
  attemptsUsed: number;
  generatedAt: string;
}

export interface GameConfig {
  name: string;
  maxNumber: number;
  cardSize: number;
  playerCount: number;
  winRules: WinRules;
  gameMode: GameMode;
  maxPrizePlaces: number;
  showExactRankToPlayers: boolean;
  closeThreshold: number;
  maxOverlap: number | null;
  defaultCountryCode: string;
  appUrl: string;
  whatsappTemplate: string;
  includeInactiveInRank: boolean;
}

export type DrawSource = 'manual' | 'random';

export interface DrawRef {
  seq: number;
  number: number;
}

export type WinEventStatus = 'pending' | 'confirmed' | 'rejected' | 'withdrawn';

export interface RankBucket {
  label: string;
}

export function rankBucket(rank: number, total: number): string {
  if (rank <= 10) return 'Top 10';
  const pct = (rank / Math.max(1, total)) * 100;
  if (pct <= 25) return 'Top 25%';
  if (pct <= 50) return 'Top 50%';
  return 'In the game';
}
