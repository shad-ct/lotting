/** Shared response shapes (mirror docs/openapi.yaml). */
export interface BoardData {
  game: { name: string; status: string; maxNumber: number };
  drawn: { seq: number; number: number }[];
  lastDrawn: { seq: number; number: number } | null;
  drawCount: number;
  winners: { serial: number; name: string }[];
}

export interface MyCardData {
  serial: number;
  name: string;
  grid: number[];
  marked: number[];
  markedCount: number;
  remaining: number[];
  remainingCount: number;
  rank: number | null;
  rankLabel: string;
  totalPlayers: number;
  isWinner: boolean;
  completedAtSeq: number | null;
}

export interface StatusPlayer {
  id: string | null;
  serial: number;
  name: string;
  loginId: string | null;
  phone: string | null;
  isActive: boolean;
  markedCount: number;
  remainingCount: number;
  rank: number;
  isTie: boolean;
  completedAtSeq: number | null;
  remainingNumbers?: number[];
  cardImageSentAt: string | null;
  credentialsSentAt: string | null;
}

export interface WinEventShape {
  id: string;
  rule: string;
  placing: number;
  drawSeq: number;
  status: string;
  players: { serial: number | null; name: string }[];
}

export interface StatusData {
  game: { id: string; name: string; status: string; maxNumber: number; cardSize: number; startedAt: string | null };
  drawn: { count: number; remaining: number; lastDrawn: { seq: number; number: number } | null; sequence: number[] };
  players: StatusPlayer[];
  leaderboard: StatusPlayer[];
  closeToWin: { serial: number; name: string; remainingCount: number; remaining: number[] }[];
  hotNumbers: { number: number; wouldCompleteCount: number; wouldCompletePlayers: number[] }[];
  histogram: Record<string, number>;
  winners: { detected: WinEventShape[]; confirmed: WinEventShape[]; prizes: WinEventShape[] };
  generationStats: unknown;
}

export interface MeData {
  role: 'admin' | 'player';
  player?: { serial: number; name: string; loginId: string };
}
