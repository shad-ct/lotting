import type { NextFunction, Request, Response } from 'express';
import { Player } from '../models/Player.js';
import { err } from '../utils/errors.js';
import { TOKEN_COOKIE, verifyToken, type Role } from '../utils/jwt.js';

export interface AuthInfo {
  role: Role;
  sub: string;
  gameId: string;
  playerId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthInfo;
    }
  }
}

function tokenFromRequest(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const found = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${TOKEN_COOKIE}=`));
    if (found) return decodeURIComponent(found.slice(TOKEN_COOKIE.length + 1));
  }
  return null;
}

/** Attaches req.auth when a valid token is present; otherwise leaves it unset. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = tokenFromRequest(req);
    if (!token) return next();
    const payload = verifyToken(token);
    req.auth = {
      role: payload.role,
      sub: payload.sub,
      gameId: payload.gameId,
      playerId: payload.role === 'player' ? payload.sub : undefined,
    };
    next();
  } catch {
    next();
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(err('UNAUTHORIZED', 'Authentication required', 401));
  if (req.auth.role !== 'admin') return next(err('FORBIDDEN', 'Admin access required', 403));
  next();
}

export async function requirePlayer(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.auth) return next(err('UNAUTHORIZED', 'Authentication required', 401));
  if (req.auth.role !== 'player' || !req.auth.playerId) {
    return next(err('FORBIDDEN', 'Player access required', 403));
  }
  // Derive the player from the token — never from a URL parameter.
  const player = await Player.findById(req.auth.playerId);
  if (!player) return next(err('UNAUTHORIZED', 'Player not found', 401));
  next();
}
