import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { err } from '../utils/errors.js';

/** Zod body validation. Schemas are .strict() — unknown fields are rejected. */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(
        err('VALIDATION_ERROR', 'Invalid request body', 422, {
          issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        }),
      );
    }
    req.body = parsed.data;
    next();
  };
}
