import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { assertProdSecrets, env } from './config/env.js';
import { AdminUser } from './models/AdminUser.js';
import { attachSockets } from './sockets/index.js';
import { hashSecret } from './utils/password.js';

/** Seed ONE admin from env at boot if none exists (01 §2.6). No registration endpoint. */
export async function seedAdmin(): Promise<void> {
  const count = await AdminUser.countDocuments();
  if (count === 0) {
    await AdminUser.create({
      username: env.ADMIN_USERNAME,
      passwordHash: await hashSecret(env.ADMIN_PASSWORD),
    });
    // eslint-disable-next-line no-console
    console.log(`Seeded admin user "${env.ADMIN_USERNAME}"`);
  }
}

async function boot(): Promise<void> {
  assertProdSecrets();
  await connectDb();
  await seedAdmin();
  const app = createApp();
  const httpServer = createServer(app);
  attachSockets(httpServer);
  httpServer.listen(env.PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`lotto server listening on :${env.PORT}`);
  });
}

if (process.env.VITEST == null) {
  boot().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Boot failed:', e);
    process.exit(1);
  });
}

export { createApp };
