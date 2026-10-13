import mongoose, { Schema } from 'mongoose';

export type WinEventStatus = 'pending' | 'confirmed' | 'rejected' | 'withdrawn';

export interface WinEventDoc extends mongoose.Document {
  gameId: mongoose.Types.ObjectId;
  drawSeq: number;
  rule: string;
  playerIds: mongoose.Types.ObjectId[];
  status: WinEventStatus;
  placing: number;
  detectedAt: Date;
  confirmedAt: Date | null;
  resolvedAt: Date | null;
}

const WinEventSchema = new Schema<WinEventDoc>(
  {
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
    drawSeq: { type: Number, required: true },
    rule: { type: String, default: 'fullCard' },
    playerIds: { type: [Schema.Types.ObjectId], ref: 'Player', required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'rejected', 'withdrawn'],
      default: 'pending',
    },
    placing: { type: Number, default: 1 },
    detectedAt: { type: Date, default: () => new Date() },
    confirmedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: false },
);

WinEventSchema.index({ gameId: 1, drawSeq: 1 });

export const WinEvent =
  mongoose.models.WinEvent ?? mongoose.model<WinEventDoc>('WinEvent', WinEventSchema);
