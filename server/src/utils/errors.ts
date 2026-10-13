import type { NextFunction, Request, Response } from 'express';

/** Stable error codes — the Flutter app switches on these, never rename. */
export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const err = (
  code: string,
  message: string,
  status = 400,
  details: Record<string, unknown> = {},
): ApiError => new ApiError(code, message, status, details);

export function errorHandler(
  e: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (e instanceof ApiError) {
    res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } });
    return;
  }
  if ((e as { code?: number }).code === 11000) {
    res.status(409).json({
      error: { code: 'DUPLICATE', message: 'Duplicate value', details: { key: (e as { keyValue?: unknown }).keyValue ?? {} } },
    });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', e);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error', details: {} } });
}

export function isDuplicateKeyError(e: unknown): boolean {
  return (e as { code?: number }).code === 11000;
}
