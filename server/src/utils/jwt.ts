import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type Role = 'admin' | 'player';

export interface TokenPayload {
  sub: string;
  role: Role;
  gameId: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '12h' });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  if (decoded.role !== 'admin' && decoded.role !== 'player') throw new Error('BAD_ROLE');
  return decoded;
}

export const TOKEN_COOKIE = 'lotto_token';

export function cookieOptions(): { httpOnly: boolean; sameSite: 'lax'; secure: boolean; maxAge: number; path: string } {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  };
}
