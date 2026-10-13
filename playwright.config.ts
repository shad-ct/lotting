import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 240_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: 'server',
      port: 3001,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        ...process.env,
        PORT: '3001',
        MONGO_URI: 'mongodb://localhost:27017/lotto_e2e',
        JWT_SECRET: 'e2e-jwt-secret-0123456789abcdef',
        CARD_HMAC_SECRET: 'e2e-hmac-secret-0123456789abcdef',
        ADMIN_USERNAME: 'e2e_admin',
        ADMIN_PASSWORD: 'e2e-pass-123',
        WEB_ORIGIN: 'http://localhost:5173',
        APP_URL: 'http://localhost:5173',
        DISABLE_RATE_LIMITS: '1',
      } as Record<string, string>,
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      cwd: 'web',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
