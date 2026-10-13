#!/usr/bin/env node
/**
 * One-command backup: dumps all Lotto collections to a timestamped JSON file.
 * Usage: npm run backup [-- outdir]
 * Env: MONGO_URI (defaults to mongodb://localhost:27017/lotto).
 * No external tools needed (pure mongoose).
 */
import mongoose from 'mongoose';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const uri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/lotto';
const outdir = process.argv[2] ?? join(process.cwd(), 'backups');

await mongoose.connect(uri);
const db = mongoose.connection.db;
if (!db) throw new Error('No DB connection');
const dump = {};
for (const name of ['games', 'players', 'cards', 'draws', 'winevents', 'auditlogs', 'adminusers']) {
  try {
    dump[name] = await db.collection(name).find().toArray();
  } catch {
    dump[name] = [];
  }
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(outdir, { recursive: true });
const file = join(outdir, `lotto-backup-${stamp}.json`);
writeFileSync(file, JSON.stringify({ uri: uri.replace(/\/\/.*@/, '//***@'), at: new Date().toISOString(), dump }, null, 1));
const counts = Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length]));
console.log(`Backup written to ${file}`, counts);
await mongoose.disconnect();
