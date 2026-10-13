import mongoose, { Schema } from 'mongoose';

export interface AdminUserDoc extends mongoose.Document {
  username: string;
  passwordHash: string;
  createdAt: Date;
}

const AdminUserSchema = new Schema<AdminUserDoc>(
  {
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const AdminUser =
  mongoose.models.AdminUser ?? mongoose.model<AdminUserDoc>('AdminUser', AdminUserSchema);
