/**
 * Idempotency-Key handling for draw routes (02 §4.4). In-memory, last ~200 keys,
 * TTL 10 min. A repeated key returns the original response and does nothing.
 * Single-instance (see README).
 */
interface Entry {
  status: number;
  body: unknown;
  expiresAt: number;
}

const MAX_KEYS = 200;
const TTL_MS = 10 * 60 * 1000;

const store = new Map<string, Entry>();

function scopeKey(adminSub: string, key: string): string {
  return `${adminSub}:${key}`;
}

export function getIdempotentResponse(adminSub: string, key: string): Entry | null {
  const entry = store.get(scopeKey(adminSub, key));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(scopeKey(adminSub, key));
    return null;
  }
  return entry;
}

export function setIdempotentResponse(adminSub: string, key: string, status: number, body: unknown): void {
  if (store.size >= MAX_KEYS) {
    const oldest = store.keys().next();
    if (!oldest.done) store.delete(oldest.value);
  }
  store.set(scopeKey(adminSub, key), { status, body, expiresAt: Date.now() + TTL_MS });
}

/** Test hook. */
export function _resetIdempotency(): void {
  store.clear();
}
