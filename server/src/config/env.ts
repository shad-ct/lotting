import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v == null || v === '') throw new Error(`Missing env ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3001),
  MONGO_URI: process.env.MONGO_URI ?? 'mongodb://localhost:27017/lotto',
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '12h',
  CARD_HMAC_SECRET: process.env.CARD_HMAC_SECRET ?? 'dev-only-hmac-change-me',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME ?? 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? 'change-me',
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  APP_URL: process.env.APP_URL ?? 'http://localhost:5173',
  DEFAULT_COUNTRY_CODE: process.env.DEFAULT_COUNTRY_CODE ?? '91',
  /** Test-only: E2E disables rate limiters (they are covered by API tests). */
  DISABLE_RATE_LIMITS: process.env.DISABLE_RATE_LIMITS === '1',
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
};

export function assertProdSecrets(): void {
  if (!env.isProd) return;
  for (const k of ['JWT_SECRET', 'CARD_HMAC_SECRET', 'ADMIN_PASSWORD'] as const) {
    if (required(k).startsWith('dev-only') || required(k) === 'change-me') {
      throw new Error(`Refusing production boot with default ${k}`);
    }
  }
}
