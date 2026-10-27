import mongoose, { Schema } from 'mongoose';
import { CARD_SIZE, MAX_NUMBER, PLAYER_COUNT_DEFAULT } from '@lotto/shared/constants.js';
import { DEFAULT_WIN_RULES, DEFAULT_WHATSAPP_TEMPLATE } from '@lotto/shared/types.js';

export type GameStatus = 'setup' | 'ready' | 'live' | 'finished';

export interface GameDoc extends mongoose.Document {
  name: string;
  status: GameStatus;
  maxNumber: number;
  cardSize: number;
  playerCount: number;
  gameMode: 'housefull' | 'cross';
  maxPrizePlaces: number;
  winRules: object;
  cardsLockedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  generationSeed: string | null;
  generationStats: object | null;
  showExactRankToPlayers: boolean;
  closeThreshold: number;
  maxOverlap: number | null;
  defaultCountryCode: string;
  appUrl: string;
  whatsappTemplate: string;
  includeInactiveInRank: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WinRulesSchema = new Schema(
  {
    fullCard: { type: { enabled: { type: Boolean, default: true } }, default: {} },
    anyRow: { type: { enabled: { type: Boolean, default: false } }, default: {} },
    anyColumn: { type: { enabled: { type: Boolean, default: false } }, default: {} },
    fourCorners: { type: { enabled: { type: Boolean, default: false } }, default: {} },
    diagonals: { type: { enabled: { type: Boolean, default: false } }, default: {} },
    firstToMarks: {
      type: { enabled: { type: Boolean, default: false }, marks: { type: Number, default: 8 } },
      default: {},
    },
    stopAtFirstFullCard: { type: Boolean, default: true },
  },
  { _id: false },
);

const GameSchema = new Schema<GameDoc>(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['setup', 'ready', 'live', 'finished'],
      default: 'setup',
      index: true,
    },
    maxNumber: { type: Number, default: MAX_NUMBER },
    cardSize: { type: Number, default: CARD_SIZE },
    playerCount: { type: Number, default: PLAYER_COUNT_DEFAULT },
    gameMode: { type: String, enum: ['housefull', 'cross'], default: 'housefull' },
    maxPrizePlaces: { type: Number, default: 3 },
    winRules: { type: WinRulesSchema, default: () => ({ ...DEFAULT_WIN_RULES }) },
    cardsLockedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    generationSeed: { type: String, default: null },
    generationStats: { type: Schema.Types.Mixed, default: null },
    showExactRankToPlayers: { type: Boolean, default: false },
    closeThreshold: { type: Number, default: 3 },
    maxOverlap: { type: Number, default: null },
    defaultCountryCode: { type: String, default: '91' },
    appUrl: { type: String, default: '' },
    whatsappTemplate: { type: String, default: DEFAULT_WHATSAPP_TEMPLATE },
    includeInactiveInRank: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Game = mongoose.models.Game ?? mongoose.model<GameDoc>('Game', GameSchema);
export { DEFAULT_WIN_RULES };
