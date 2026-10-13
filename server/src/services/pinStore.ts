/**
 * One-time PIN window (03 §5, used by Phase 2 credential routes + Phase 3 exports).
 * Plain PINs live ONLY here, in memory, for 15 minutes — never in the DB or logs.
 */
const WINDOW_MS = 15 * 60 * 1000;

interface Window {
  pins: Map<string, string>;
  expiresAt: number;
}

const windows = new Map<string, Window>();

export function storePins(gameId: string, pins: Map<string, string>): void {
  windows.set(gameId, { pins, expiresAt: Date.now() + WINDOW_MS });
}

export function addPin(gameId: string, playerId: string, pin: string): void {
  const existing = windows.get(gameId);
  if (existing && Date.now() <= existing.expiresAt) {
    existing.pins.set(playerId, pin);
    return;
  }
  windows.set(gameId, { pins: new Map([[playerId, pin]]), expiresAt: Date.now() + WINDOW_MS });
}

/** Returns null when no window exists or it has expired. */
export function getPins(gameId: string): Map<string, string> | null {
  const w = windows.get(gameId);
  if (!w) return null;
  if (Date.now() > w.expiresAt) {
    windows.delete(gameId);
    return null;
  }
  return w.pins;
}

export function getPin(gameId: string, playerId: string): string | null {
  return getPins(gameId)?.get(playerId) ?? null;
}

/** Drop one game's PIN window (used by full wipe). */
export function clearPins(gameId: string): void {
  windows.delete(gameId);
}

/** Test hook: force-expire a window. */
export function _expireWindow(gameId: string): void {
  const w = windows.get(gameId);
  if (w) w.expiresAt = Date.now() - 1;
}

export function _resetPinStore(): void {
  windows.clear();
}
