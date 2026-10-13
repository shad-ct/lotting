import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRID_COLS, GRID_ROWS } from '@lotto/shared/constants.js';
import { THEME_VERSION, theme } from './theme.js';

export interface CardRenderInput {
  gameName: string;
  serial: number;
  playerName: string;
  loginId: string;
  grid: number[];
  verifyCode: string;
  appUrl: string;
  /** Numbers currently drawn (for the ?marked=1 variant). */
  drawn?: Set<number> | number[];
}

let fontsRegistered = false;

/** Register the BUNDLED fonts (never rely on system fonts). */
export function registerFonts(): void {
  if (fontsRegistered) return;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', '..', '..', 'assets', 'fonts'),
    join(process.cwd(), 'server', 'assets', 'fonts'),
    join(process.cwd(), 'assets', 'fonts'),
  ];
  const dir = candidates.find((d) => existsSync(join(d, 'NotoSans.ttf')));
  if (!dir) throw new Error('Bundled fonts not found (server/assets/fonts)');
  GlobalFonts.registerFromPath(join(dir, 'NotoSans.ttf'), 'LottoNoto');
  GlobalFonts.registerFromPath(join(dir, 'NotoSansMalayalam.ttf'), 'LottoNotoML');
  fontsRegistered = true;
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Fit a name: shrink first, then ellipsis (spec 03 §2: shrink before truncating). */
export function fitName(ctx: SKRSContext2D, name: string, maxWidth: number): { text: string; size: number } {
  let size = theme.playerNameMax;
  const setFont = (s: number) => {
    ctx.font = `600 ${s}px ${theme.fontFamily}`;
  };
  setFont(size);
  while (size > theme.playerNameMin && ctx.measureText(name).width > maxWidth) {
    size -= 4;
    setFont(size);
  }
  if (ctx.measureText(name).width <= maxWidth) return { text: name, size };
  let text = name;
  while (text.length > 4 && ctx.measureText(text + '…').width > maxWidth) {
    text = text.slice(0, -1);
  }
  return { text: text + '…', size };
}

/**
 * Pure render: (cardData, options) => PNG Buffer. Deterministic — same input
 * yields byte-identical output (no timestamps or randomness inside).
 */
export function renderCard(input: CardRenderInput): Buffer {
  registerFonts();
  if (input.grid.length !== GRID_ROWS * GRID_COLS) throw new Error('GRID_MUST_HAVE_16_NUMBERS');

  const { width: W, height: H } = theme;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const drawn = input.drawn instanceof Set ? input.drawn : new Set(input.drawn ?? []);
  const markedCount = input.grid.filter((n) => drawn.has(n)).length;
  const showMarks = drawn.size > 0;

  // Background + header band.
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = theme.headerBand;
  ctx.fillRect(0, 0, W, theme.headerBandHeight);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.font = `700 ${theme.gameNameSize}px ${theme.fontFamily}`;
  ctx.fillText(input.gameName.toUpperCase().slice(0, 30), W / 2, 78);
  ctx.fillStyle = '#BDBDBD';
  ctx.font = `400 ${theme.taglineSize}px ${theme.fontFamily}`;
  ctx.fillText('Numbers 1–110 · one card per player', W / 2, 148);

  // Player block (fixed positions keep layout deterministic).
  const serialLabel = `CARD #${String(input.serial).padStart(3, '0')}`;
  const SERIAL_Y = 285;
  const NAME_Y = 363;
  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'center';
  ctx.font = `700 76px ${theme.fontFamily}`;
  ctx.fillText(serialLabel, W / 2, SERIAL_Y);

  const nameFit = fitName(ctx, input.playerName, W - theme.margin * 2);
  ctx.font = `600 ${nameFit.size}px ${theme.fontFamily}`;
  ctx.fillStyle = theme.ink;
  ctx.fillText(nameFit.text, W / 2, NAME_Y);

  // Grid — sized to fit the 1350px height with footer room.
  const gridTop = 425;
  const footerReserve = 170;
  const cellByWidth = (W - theme.margin * 2 - theme.gridGap * (GRID_COLS - 1)) / GRID_COLS;
  const cellByHeight =
    (theme.height - gridTop - footerReserve - theme.gridGap * (GRID_ROWS - 1)) / GRID_ROWS;
  const cellSize = Math.floor(Math.min(cellByWidth, cellByHeight));
  const gridWidth = GRID_COLS * cellSize + (GRID_COLS - 1) * theme.gridGap;
  const gridLeft = Math.round((W - gridWidth) / 2);
  for (let i = 0; i < input.grid.length; i++) {
    const r = Math.floor(i / GRID_COLS);
    const c = i % GRID_COLS;
    const x = gridLeft + c * (cellSize + theme.gridGap);
    const y = gridTop + r * (cellSize + theme.gridGap);
    const n = input.grid[i];
    const isMarked = showMarks && drawn.has(n);

    roundRect(ctx, x, y, cellSize, cellSize, theme.cellRadius);
    if (isMarked) {
      ctx.fillStyle = theme.accent;
      ctx.fill();
      // Check ring + hand-drawn tick (grayscale-visible; no glyph dependency).
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 6;
      const cx = x + cellSize - 34;
      const cy = y + 34;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy + 1);
      ctx.lineTo(cx - 2, cy + 8);
      ctx.lineTo(cx + 10, cy - 8);
      ctx.stroke();
    } else {
      ctx.fillStyle = theme.cellFill;
      ctx.fill();
      ctx.strokeStyle = theme.cellStroke;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Number, centered, tabular-ish large bold.
    ctx.textAlign = 'center';
    ctx.font = `700 ${theme.cellNumberSize}px ${theme.fontFamily}`;
    ctx.fillStyle = isMarked ? theme.accentInk : theme.ink;
    ctx.fillText(String(n), x + cellSize / 2, y + cellSize / 2 + 4);
    // Faux-bold for extra punch on marked cells (variable font, grayscale-safe).
    if (isMarked) {
      ctx.fillText(String(n), x + cellSize / 2 + 1.5, y + cellSize / 2 + 4);
    }
  }

  // Footer.
  const footerTop = gridTop + GRID_ROWS * cellSize + (GRID_ROWS - 1) * theme.gridGap + 36;
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.muted;
  ctx.font = `400 26px ${theme.fontFamily}`;
  ctx.fillText(`Verify: ${input.verifyCode}    Login ID: ${input.loginId}`, W / 2, footerTop);
  ctx.font = `400 22px ${theme.fontFamily}`;
  ctx.fillText('Numbers will be marked live in the app', W / 2, footerTop + 36);
  ctx.fillText(input.appUrl, W / 2, footerTop + 66);
  if (showMarks) {
    ctx.fillStyle = theme.accent;
    ctx.font = `700 26px ${theme.fontFamily}`;
    ctx.fillText(`${markedCount} / ${input.grid.length} marked`, W / 2, footerTop + 100);
  }

  return canvas.toBuffer('image/png');
}

/** Cache for UNMARKED pngs (never change after lock): key verifyCode+theme. */
const unmarkedCache = new Map<string, Buffer>();
const MAX_CACHE = 200;

export function renderUnmarkedCached(input: Omit<CardRenderInput, 'drawn'>): Buffer {
  const key = `${input.verifyCode}:v${THEME_VERSION}`;
  const hit = unmarkedCache.get(key);
  if (hit) return hit;
  const buf = renderCard(input);
  if (unmarkedCache.size >= MAX_CACHE) {
    const oldest = unmarkedCache.keys().next();
    if (!oldest.done) unmarkedCache.delete(oldest.value);
  }
  unmarkedCache.set(key, buf);
  return buf;
}

/** Test hook: expose which numbers the renderer places, in grid order. */
export function placedNumbers(input: CardRenderInput): number[] {
  return [...input.grid];
}
