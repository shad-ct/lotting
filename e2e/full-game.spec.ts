import { expect, test } from '@playwright/test';
import { API, auth, bootstrap110, adminUiLogin, playerUiLogin, shuffled110 } from './helpers.js';

/**
 * Full-game rehearsal (05 §5): 110 players, all 110 numbers drawn in a random
 * order (mix of manual + random API draws) while admin/public/player windows
 * are open. The three views must agree (sampled every 10th draw). First
 * completion → admin modal, public hidden until confirm, then banner.
 */
test('full 110-number game across three windows', async ({ browser, request }) => {
  const { admin, creds } = await bootstrap110(request);

  const adminCtx = await browser.newContext();
  const publicCtx = await browser.newContext();
  const playerCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  const publicPage = await publicCtx.newPage();
  const playerPage = await playerCtx.newPage();

  await adminUiLogin(adminPage);
  await adminPage.goto('/admin');
  await expect(adminPage.getByText('dashboard', { exact: false }).first()).toBeVisible({ timeout: 15000 });
  await publicPage.goto('/');
  await expect(publicPage.getByText('Last drawn')).toBeVisible({ timeout: 15000 });
  await playerUiLogin(playerPage, creds[0].loginId, creds[0].pin);
  await expect(playerPage.getByText(`Card #${String(creds[0].serial).padStart(3, '0')}`)).toBeVisible();

  const order = shuffled110();
  let firstWinAt = -1;
  for (let i = 0; i < order.length; i++) {
    // Mix of manual and random draws (random pick may differ from order —
    // that is fine; we track the authoritative board from the API).
    let res;
    if (i % 3 === 2) {
      res = await request.post(`${API}/admin/draws/random`, { headers: auth(admin), data: {} });
    } else {
      // Skip numbers already drawn by an earlier random pick.
      const board = (await (await request.get(`${API}/public/board`)).json()) as {
        drawn: { number: number }[];
      };
      const drawn = new Set(board.drawn.map((d) => d.number));
      const next = order.find((n) => !drawn.has(n));
      if (next == null) break;
      res = await request.post(`${API}/admin/draws`, { headers: auth(admin), data: { number: next } });
    }
    expect(res.status()).toBe(201);

    if ((i + 1) % 10 === 0 || i === order.length - 1) {
      const board = (await (await request.get(`${API}/public/board`)).json()) as {
        drawCount: number;
        lastDrawn: { number: number } | null;
      };
      // Public board agrees (allow a beat for sockets).
      await expect(publicPage.getByText(`Drawn ${board.drawCount} / 110`).first()).toBeVisible({ timeout: 15000 });
      if (board.lastDrawn) {
        await expect(publicPage.getByText(`Draw #${board.drawCount}`).first()).toBeVisible({ timeout: 15000 });
      }
      // Player card agrees with the API.
      const me = (await (
        await request.post(`${API}/auth/player/login`, {
          headers: { 'X-Client': 'mobile' },
          data: { loginId: creds[0].loginId, pin: creds[0].pin },
        })
      ).json()) as { token: string };
      const card = (await (
        await request.get(`${API}/me/card`, { headers: auth(me.token) })
      ).json()) as { markedCount: number };
      await expect(playerPage.getByText(`${card.markedCount} / 16 marked`)).toBeVisible({ timeout: 15000 });
    }

    // First completion → modal on admin, hidden on public.
    const status = (await (await request.get(`${API}/admin/status`, { headers: auth(admin) })).json()) as {
      winners: { detected: { players: { name: string }[] }[] };
    };
    if (firstWinAt < 0 && status.winners.detected.length > 0) {
      firstWinAt = i + 1;
      await expect(adminPage.getByRole('alertdialog')).toBeVisible({ timeout: 15000 });
      const names = status.winners.detected[0].players.map((p) => p.name);
      for (const n of names) await expect(adminPage.getByRole('alertdialog').getByText(n, { exact: false }).first()).toBeVisible();
      await expect(publicPage.getByText('Winner:', { exact: false })).toHaveCount(0);
      // Confirm the first winner via the modal.
      await adminPage.getByRole('button', { name: 'Confirm winner(s)' }).click();
      await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(publicPage.getByText(/Winner/, { exact: false }).first()).toBeVisible({ timeout: 15000 });
      break; // game finishes on first full-card confirm (stopAtFirstFullCard)
    }
  }
  expect(firstWinAt).toBeGreaterThan(0);

  await adminCtx.close();
  await publicCtx.close();
  await playerCtx.close();
});
