import { createHmac, randomInt } from 'node:crypto';
import type { GameConfig } from './types.js';

/**
 * Credential + phone + filename helpers (pure, testable, no DB).
 * crypto is used for ALL randomness here — never Math.random.
 */

const WEAK_PINS = new Set(['000000', '123456', '654321', '012345', '123123', '121212']);

function isWeakPin(pin: string): boolean {
  if (WEAK_PINS.has(pin)) return true;
  const digits = pin.split('').map(Number);
  // All digits identical (000000, 777777, ...)
  if (digits.every((d) => d === digits[0])) return true;
  // Strictly ascending or descending runs (e.g. 234567, 987654)
  let asc = true;
  let desc = true;
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== (digits[i - 1] + 1) % 10) asc = false;
    if (digits[i] !== (digits[i - 1] + 9) % 10) desc = false;
  }
  if (asc || desc) return true;
  return false;
}

/** Secure random 6-digit PIN with weak-pattern rejection. */
export function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!isWeakPin(pin)) return pin;
  }
}

export function isWeakPinExportedForTests(pin: string): boolean {
  return isWeakPin(pin);
}

/**
 * Normalise a phone number to digits-with-country-code.
 * - strips spaces, dashes, brackets
 * - keeps a leading +country code when present
 * - bare 10-digit numbers get `defaultCountryCode` prepended
 * Returns digits only (E.164 without the +). Throws on garbage.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountryCode = '91'): string {
  if (raw == null) throw new Error('PHONE_REQUIRED');
  const trimmed = String(raw).trim();
  if (!trimmed) throw new Error('PHONE_REQUIRED');
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (hasPlus) {
    if (digits.length < 7 || digits.length > 15) throw new Error('INVALID_PHONE');
    return digits;
  }
  const cc = defaultCountryCode.replace(/\D/g, '');
  if (digits.length === 10) return cc + digits;
  if (digits.length > 10 && digits.length <= 15) return digits;
  throw new Error('INVALID_PHONE');
}

export function toE164(digits: string): string {
  return '+' + digits;
}

/**
 * verifyCode = first 6 chars of uppercase base32 of
 * HMAC-SHA256(secret, `${gameId}:${serial}:${canonicalKey}`).
 * Printed on the card image; used by POST /admin/verify-claim.
 */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bitsLeft = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      bitsLeft -= 5;
      out += BASE32[(buffer >> bitsLeft) & 31];
    }
  }
  if (bitsLeft > 0) out += BASE32[(buffer << (5 - bitsLeft)) & 31];
  return out;
}

export function buildVerifyCode(
  secret: string,
  gameId: string,
  serial: number,
  canonicalKey: string,
  length = 6,
): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(`${gameId}:${serial}:${canonicalKey}`);
  const digest = hmac.digest();
  return base32Encode(digest).slice(0, length).toUpperCase();
}

/** Canonical key for a card: sorted numbers joined with '-'. */
export function canonicalKeyFor(numbers: number[]): string {
  return [...numbers].sort((a, b) => a - b).join('-');
}

/**
 * Safe download filename `<serial3>_<name>.png` fragment.
 * Strips / \ : * ? " < > |, collapses whitespace, falls back to the
 * zero-padded serial when nothing ASCII-readable remains
 * (e.g. Malayalam-only names).
 */
export function sanitizeFilename(name: string, serial: number): string {
  const serialPart = String(serial).padStart(3, '0');
  const cleaned = String(name ?? '')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '_')
    .slice(0, 60)
    .replace(/^_+|_+$/g, '');
  const hasAscii = /[A-Za-z0-9]/.test(cleaned);
  if (!cleaned || !hasAscii) return serialPart;
  return `${serialPart}_${cleaned}`;
}

/** Default loginId for a serial: P + zero-padded (P001). */
export function defaultLoginId(serial: number): string {
  return 'P' + String(serial).padStart(3, '0');
}

export function defaultCountryCodeFor(_game?: Pick<GameConfig, 'defaultCountryCode'>): string {
  return _game?.defaultCountryCode ?? '91';
}
