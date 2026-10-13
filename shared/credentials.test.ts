import { describe, expect, it } from 'vitest';
import { buildVerifyCode, generatePin, isWeakPinExportedForTests, normalizePhone, sanitizeFilename } from './credentials.js';

describe('utilities (05 §2.4)', () => {
  it('phone normalisation', () => {
    expect(normalizePhone('9876543210')).toBe('919876543210');
    expect(normalizePhone('+91 98765 43210')).toBe('919876543210');
    expect(normalizePhone('98765-43210')).toBe('919876543210');
    expect(normalizePhone('(0484) 123456', '91')).toBe('910484123456');
    expect(() => normalizePhone('abc')).toThrow();
    expect(() => normalizePhone('')).toThrow();
    expect(() => normalizePhone('123')).toThrow();
  });

  it('PIN generation: 6 digits, uses crypto, rejects weak patterns', () => {
    for (let i = 0; i < 50; i++) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(isWeakPinExportedForTests(pin)).toBe(false);
    }
    expect(isWeakPinExportedForTests('000000')).toBe(true);
    expect(isWeakPinExportedForTests('123456')).toBe(true);
    expect(isWeakPinExportedForTests('777777')).toBe(true);
  });

  it('PINs carry no hash material (hashing lives server-side)', async () => {
    const pin = generatePin();
    expect(pin).toMatch(/^\d{6}$/);
  });

  it('verifyCode is deterministic per (secret, game, serial, key)', () => {
    const a = buildVerifyCode('s3cret', 'game1', 47, '1-2-3');
    const b = buildVerifyCode('s3cret', 'game1', 47, '1-2-3');
    const c = buildVerifyCode('s3cret', 'game1', 48, '1-2-3');
    expect(a).toBe(b);
    expect(a).toHaveLength(6);
    expect(a).toMatch(/^[A-Z2-7]+$/);
    expect(c).not.toBe(a);
  });

  it('filename sanitiser', () => {
    expect(sanitizeFilename('Rahul', 47)).toBe('047_Rahul');
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j', 1)).not.toMatch(/[/\\:*?"<>|]/);
    // Malayalam-only name → serial fallback, no boxes downstream
    expect(sanitizeFilename('രാഹുൽ', 47)).toBe('047');
    expect(sanitizeFilename('   ', 5)).toBe('005');
  });
});
