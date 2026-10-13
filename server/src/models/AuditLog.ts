import mongoose, { Schema } from 'mongoose';

export interface AuditLogDoc extends mongoose.Document {
  gameId: mongoose.Types.ObjectId | null;
  at: Date;
  actor: string;
  action: string;
  payload: unknown;
}

const AuditLogSchema = new Schema<AuditLogDoc>({
  gameId: { type: Schema.Types.ObjectId, ref: 'Game', default: null, index: true },
  at: { type: Date, default: () => new Date() },
  actor: { type: String, default: 'admin' },
  action: {
    type: String,
    enum: ['draw', 'undo', 'reset_pin', 'lock_cards', 'start', 'finish', 'reopen', 'reset', 'wipe', 'regenerate_cards', 'confirm_win', 'reject_win'],
    required: true,
  },
  payload: { type: Schema.Types.Mixed, default: {} },
});

export const AuditLog =
  mongoose.models.AuditLog ?? mongoose.model<AuditLogDoc>('AuditLog', AuditLogSchema);
