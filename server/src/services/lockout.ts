/** Brute-force guard: 5 consecutive failures for a loginId → 5-minute cooldown. In-memory (single instance, see README). */
const failures = new Map<string, { count: number; lockedUntil: number }>();

const MAX_FAILURES = 5;
const COOLDOWN_MS = 5 * 60 * 1000;

export function isLocked(key: string): boolean {
  const entry = failures.get(key.toLowerCase());
  if (!entry) return false;
  if (Date.now() >= entry.lockedUntil && entry.count < MAX_FAILURES) return false;
  if (Date.now() < entry.lockedUntil) return true;
  failures.delete(key.toLowerCase());
  return false;
}

export function recordFailure(key: string): void {
  const k = key.toLowerCase();
  const entry = failures.get(k) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) entry.lockedUntil = Date.now() + COOLDOWN_MS;
  failures.set(k, entry);
}

export function recordSuccess(key: string): void {
  failures.delete(key.toLowerCase());
}

/** Test hook. */
export function _resetLockouts(): void {
  failures.clear();
}
