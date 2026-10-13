import type { NextFunction, Request, Response } from 'express';
import type { GameDoc } from '../models/Game.js';
import { getCurrentGame } from '../services/progressService.js';
import { err } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      game?: GameDoc;
    }
  }
}

/** Loads the current (latest) game; 404 when none exists yet. */
export async function requireGame(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const game = await getCurrentGame();
  if (!game) return next(err('NO_ACTIVE_GAME', 'No game exists yet', 404));
  req.game = game;
  next();
}
