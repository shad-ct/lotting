/** Shared E2E helpers: API bootstrap + login against the Playwright servers. */
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API = 'http://localhost:3001/api/v1';
export const ADMIN_USER = 'e2e_admin';
export const ADMIN_PASS = 'e2e-pass-123';

export async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/admin/login`, {
    headers: { 'X-Client': 'mobile' },
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { token: string };
  return body.token;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface Cred { serial: number; name: string; loginId: string; pin: string }

export async function bootstrap110(request: APIRequestContext): Promise<{ admin: string; creds: Cred[] }> {
  const admin = await adminToken(request);
  const g = await request.post(`${API}/admin/game`, { headers: auth(admin), data: { name: 'E2E Game' } });
  expect(g.status()).toBe(201);
  const names = Array.from({ length: 110 }, (_, i) => `E2E Player ${String(i + 1).padStart(3, '0')}`);
  const imp = await request.post(`${API}/admin/players/import`, {
    headers: auth(admin),
    data: names.map((name) => ({ name })),
  });
  expect(imp.status()).toBe(201);
  const creds = await request.post(`${API}/admin/players/credentials/generate`, { headers: auth(admin) });
  expect(creds.status()).toBe(201);
  const gen = await request.post(`${API}/admin/cards/generate`, { headers: auth(admin) });
  expect(gen.status()).toBe(201);
  expect(await (await request.post(`${API}/admin/cards/lock`, { headers: auth(admin) })).status()).toBe(200);
  expect(await (await request.post(`${API}/admin/game/start`, { headers: auth(admin) })).status()).toBe(200);
  return { admin, creds: ((await creds.json()) as { items: Cred[] }).items };
}

export async function adminUiLogin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.locator('input').nth(0).fill(ADMIN_USER);
  await page.locator('input').nth(1).fill(ADMIN_PASS);
  await page.getByRole('button', { name: 'Log in' }).click();
  // NOTE: must be an EXACT match — /admin/login itself contains "/admin/".
  await expect(page).toHaveURL('/admin', { timeout: 15000 });
  await expect(page.getByText('dashboard', { exact: false }).first()).toBeVisible({ timeout: 15000 });
}

export async function playerUiLogin(page: Page, loginId: string, pin: string): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('P047').fill(loginId);
  await page.getByPlaceholder('6-digit PIN').fill(pin);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/my-card', { timeout: 15000 });
}

export function shuffled110(): number[] {
  // Deterministic shuffle (mulberry32) — no Math.random, reproducible runs.
  let a = 42;
  const rng = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = Array.from({ length: 110 }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
