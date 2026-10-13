/**
 * Password / PIN hashing. argon2id preferred, bcryptjs fallback.
 * The fallback activates only if the argon2 native module cannot load —
 * the project was able to build argon2, so argon2id is expected in practice.
 */
import bcrypt from 'bcryptjs';

type Argon2Module = typeof import('argon2');

let argon2: Argon2Module | null = null;
let argon2LoadFailed = false;

async function getArgon2(): Promise<Argon2Module | null> {
  if (argon2) return argon2;
  if (argon2LoadFailed) return null;
  try {
    const mod = await import('argon2');
    argon2 = mod.default ?? mod;
    return argon2;
  } catch {
    argon2LoadFailed = true;
    return null;
  }
}

export function hashBackend(): 'argon2id' | 'bcrypt' {
  if (argon2LoadFailed) return 'bcrypt';
  return 'argon2id';
}

export async function hashSecret(plain: string): Promise<string> {
  const a2 = await getArgon2();
  if (a2) {
    return a2.hash(plain, { type: a2.argon2id });
  }
  const salt = await bcrypt.genSalt(12);
  return `bcrypt:${await bcrypt.hash(plain, salt)}`;
}

export async function verifySecret(hash: string, plain: string): Promise<boolean> {
  if (hash.startsWith('bcrypt:')) {
    return bcrypt.compare(plain, hash.slice('bcrypt:'.length));
  }
  const a2 = await getArgon2();
  if (a2) {
    try {
      return await a2.verify(hash, plain);
    } catch {
      return false;
    }
  }
  return false;
}

export const hashPin = hashSecret;
export const verifyPin = verifySecret;
export const hashPassword = hashSecret;
export const verifyPassword = verifySecret;
