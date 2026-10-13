import mongoose from 'mongoose';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { API, auth, adminToken, adminUiLogin, playerUiLogin } from './helpers.js';
import { Card } from '../server/dist/models/Card.js';

/**
 * Tie + undo + refresh scenarios (05 §5). Builds its own small game through
 * the API (finishing any previous game first), forces cards via the compiled
 * server models (same technique as the API tests), then drives the UI.
 */

async function finishCurrentGame(request: APIRequestContext, admin: string): Promise<void> {
  const status = (await (await request.get(`${API}/admin/status`, { headers: auth(admin) })).json()) as {
    game: { status: string };
  };
  if (status.game.status === 'live') {
    // Draw every remaining number to force completion, confirm, finish.
    const board = (await (await request.get(`${API}/public/board`)).json()) as {
      game: { maxNumber: number };
      drawn: { number: number }[];
    };
    const drawn = new Set(board.drawn.map((d) => d.number));
    for (let n = 1; n <= board.game.maxNumber; n++) {
      if (!drawn.has(n)) await request.post(`${API}/admin/draws`, { headers: auth(admin), data: { number: n } });
    }
    const st = (await (await request.get(`${API}/admin/status`, { headers: auth(admin) })).json()) as {
      winners: { detected: { id: string }[] };
    };
    for (const w of st.winners.detected) {
      await request.post(`${API}/admin/wins/${w.id}/confirm`, { headers: auth(admin) });
    }
  }
}

async function newSmallGame(request: APIRequestContext): Promise<string> {
  const admin = await adminToken(request);
  let g = await request.post(`${API}/admin/game`, {
    headers: auth(admin),
    data: { name: 'E2E Small', playerCount: 2, cardSize: 2, maxNumber: 8 },
  });
  if (g.status() === 409) {
    await finishCurrentGame(request, admin);
    g = await request.post(`${API}/admin/game`, {
      headers: auth(admin),
      data: { name: 'E2E Small', playerCount: 2, cardSize: 2, maxNumber: 8 },
    });
  }
  expect(g.status()).toBe(201);
  const { id } = (await g.json()) as { id: string };
  await request.post(`${API}/admin/players/import`, {
    headers: auth(admin),
    data: [{ name: 'Tie One' }, { name: 'Tie Two' }],
  });
  await request.post(`${API}/admin/players/credentials/generate`, { headers: auth(admin) });
  await request.post(`${API}/admin/cards/generate`, { headers: auth(admin) });
  await request.post(`${API}/admin/cards/lock`, { headers: auth(admin) });
  await request.post(`${API}/admin/game/start`, { headers: auth(admin) });
  // Force the tie: [5,6] vs [6,7]; generated 2-card deals only contain 1-4.
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect('mongodb://localhost:27017/lotto_e2e');
  }
  const gid = new mongoose.Types.ObjectId(id);
  const cards = await Card.find({ gameId: gid }).sort({ serial: 1 });
  cards[0].grid = [5, 6];
  cards[0].numbersSorted = [5, 6];
  cards[0].canonicalKey = '5-6';
  cards[1].grid = [6, 7];
  cards[1].numbersSorted = [6, 7];
  cards[1].canonicalKey = '6-7';
  await cards[0].save();
  await cards[1].save();
  return admin;
}

test('tie: co-winners in modal + banner; undo; refresh restores state', async ({ browser, request }) => {
  const admin = await newSmallGame(request);

  const adminCtx = await browser.newContext();
  const publicCtx = await browser.newContext();
  const playerCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  const publicPage = await publicCtx.newPage();
  const playerPage = await playerCtx.newPage();

  await adminUiLogin(adminPage);
  await adminPage.goto('/admin');
  await publicPage.goto('/');

  // Fresh PIN for player one (reset-pin reveals a new one-time PIN).
  const players = (await (
    await request.get(`${API}/admin/players`, { headers: auth(admin) })
  ).json()) as { items: { id: string; loginId: string }[] };
  const reset = (await (
    await request.post(`${API}/admin/players/${players.items[0].id}/reset-pin`, { headers: auth(admin) })
  ).json()) as { loginId: string; pin: string };
  await playerUiLogin(playerPage, reset.loginId, reset.pin);

  // Mistaken entry then undo, all through the draw-console UI.
  // NOTE: the header mini draw box also has a "Draw" button, so scope to main.
  const drawBtn = adminPage.locator('main').getByRole('button', { name: 'Draw', exact: true });
  await adminPage.goto('/admin/draw');
  await adminPage.getByLabel('Number to draw').fill('5');
  await drawBtn.click();
  await adminPage.getByRole('button', { name: 'Draw it' }).click();
  await expect(publicPage.getByText('Draw #1').first()).toBeVisible({ timeout: 15000 });
  await adminPage.getByRole('button', { name: /Undo draw/ }).click();
  await adminPage.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(publicPage.getByText('Drawn 0 / 8').first()).toBeVisible({ timeout: 15000 });
  // Redraw works after undo — seq keeps increasing (never reused), so Draw #2.
  await adminPage.getByLabel('Number to draw').fill('5');
  await drawBtn.click();
  await adminPage.getByRole('button', { name: 'Draw it' }).click();
  await expect(publicPage.getByText('Draw #2').first()).toBeVisible({ timeout: 15000 });

  // Complete the tie via API, watch the UI.
  await request.post(`${API}/admin/draws`, { headers: auth(admin), data: { number: 7 } });
  await request.post(`${API}/admin/draws`, { headers: auth(admin), data: { number: 6 } });
  await adminPage.goto('/admin');
  await expect(adminPage.getByRole('alertdialog')).toBeVisible({ timeout: 15000 });
  await expect(adminPage.getByRole('alertdialog').getByText('Tie One')).toBeVisible();
  await expect(adminPage.getByRole('alertdialog').getByText('Tie Two')).toBeVisible();
  await expect(publicPage.getByText('Winner:', { exact: false })).toHaveCount(0);
  await adminPage.getByRole('button', { name: 'Confirm winner(s)' }).click();
  await adminPage.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(publicPage.getByText('Tie One').first()).toBeVisible({ timeout: 15000 });
  await expect(publicPage.getByText('Tie Two').first()).toBeVisible({ timeout: 15000 });

  // Refresh mid-game: player state is restored from the server.
  await playerPage.reload();
  await expect(playerPage.getByText(/marked/).first()).toBeVisible({ timeout: 15000 });

  await mongoose.disconnect().catch(() => {});
  await adminCtx.close();
  await publicCtx.close();
  await playerCtx.close();
});
