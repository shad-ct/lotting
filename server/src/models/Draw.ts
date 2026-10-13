import mongoose, { Schema } from 'mongoose';

export type DrawSource = 'manual' | 'random';

export interface DrawDoc extends mongoose.Document {
  gameId: mongoose.Types.ObjectId;
  seq: number;
  number: number;
  source: DrawSource;
  drawnAt: Date;
  /** Agreed decision: isActive=false on undo (partial unique index uses this, not a null filter). */
  isActive: boolean;
  undoneAt: Date | null;
  undoReason: string | null;
}

const DrawSchema = new Schema<DrawDoc>({
  gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  seq: { type: Number, required: true },
  number: { type: Number, required: true },
  source: { type: String, enum: ['manual', 'random'], required: true },
  drawnAt: { type: Date, default: () => new Date() },
  isActive: { type: Boolean, default: true },
  undoneAt: { type: Date, default: null },
  undoReason: { type: String, default: null },
});

// The database itself rejects a number being drawn twice among active draws.
DrawSchema.index(
  { gameId: 1, number: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
DrawSchema.index({ gameId: 1, seq: 1 }, { unique: true });

export const Draw = mongoose.models.Draw ?? mongoose.model<DrawDoc>('Draw', DrawSchema);
