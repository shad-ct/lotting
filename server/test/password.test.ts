import { describe, expect, it } from 'vitest';
import { hashBackend, hashSecret, verifySecret } from '../src/utils/password.js';

describe('password hashing (argon2id preferred, bcrypt fallback)', () => {
  it('round trip; hash never contains the plain PIN', async () => {
    const hash = await hashSecret('482910');
    expect(hash).not.toContain('482910');
    expect(await verifySecret(hash, '482910')).toBe(true);
    expect(await verifySecret(hash, '000000')).toBe(false);
    expect(['argon2id', 'bcrypt']).toContain(hashBackend());
  });

  it('bcrypt-prefixed hashes verify via fallback path', async () => {
    const hash = await hashSecret('123789');
    // Force the bcrypt path regardless of backend.
    const bcrypt = (await import('bcryptjs')).default;
    const salt = await bcrypt.genSalt(4);
    const bhash = `bcrypt:${await bcrypt.hash('123789', salt)}`;
    expect(await verifySecret(bhash, '123789')).toBe(true);
    expect(await verifySecret(bhash, 'wrong!')).toBe(false);
    void hash;
  });
});
