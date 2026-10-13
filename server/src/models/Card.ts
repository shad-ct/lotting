import mongoose, { Schema } from 'mongoose';

export interface CardDoc extends mongoose.Document {
  gameId: mongoose.Types.ObjectId;
  serial: number;
  grid: number[];
  numbersSorted: number[];
  canonicalKey: string;
  verifyCode: string;
  createdAt: Date;
}

const CardSchema = new Schema<CardDoc>(
  {
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
    serial: { type: Number, required: true },
    grid: { type: [Number], required: true },
    numbersSorted: { type: [Number], required: true },
    canonicalKey: { type: String, required: true },
    verifyCode: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

CardSchema.index({ gameId: 1, serial: 1 }, { unique: true });
CardSchema.index({ gameId: 1, canonicalKey: 1 }, { unique: true });

export const Card = mongoose.models.Card ?? mongoose.model<CardDoc>('Card', CardSchema);
