import mongoose, { Schema } from 'mongoose';

export interface PlayerDoc extends mongoose.Document {
  gameId: mongoose.Types.ObjectId;
  serial: number;
  name: string;
  phone: string | null;
  loginId: string;
  pinHash: string | null;
  pinResetAt: Date | null;
  cardId: mongoose.Types.ObjectId | null;
  cardImageSentAt: Date | null;
  credentialsSentAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PlayerSchema = new Schema<PlayerDoc>(
  {
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
    serial: { type: Number, required: true },
    name: { type: String, required: true },
    phone: { type: String, default: null },
    loginId: { type: String, required: true },
    pinHash: { type: String, default: null },
    pinResetAt: { type: Date, default: null },
    cardId: { type: Schema.Types.ObjectId, ref: 'Card', default: null },
    cardImageSentAt: { type: Date, default: null },
    credentialsSentAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PlayerSchema.index({ gameId: 1, serial: 1 }, { unique: true });
// Case-insensitive loginId per game (collation strength 2).
PlayerSchema.index({ gameId: 1, loginId: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Player = mongoose.models.Player ?? mongoose.model<PlayerDoc>('Player', PlayerSchema);
