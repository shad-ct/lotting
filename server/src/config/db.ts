import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDb(uri: string = env.MONGO_URI): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(uri);
}
