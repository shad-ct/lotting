/** Typed fetch wrapper. Cookies (auth) are same-origin; throws coded errors. */
export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;
  constructor(shape: ApiErrorShape, status: number) {
    super(shape.message);
    this.code = shape.code;
    this.status = status;
    this.details = shape.details ?? {};
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const shape = (data as { error?: ApiErrorShape })?.error ?? { code: 'UNKNOWN', message: `HTTP ${res.status}` };
    throw new ApiError(shape, res.status);
  }
  return data as T;
}

export function friendlyMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'NUMBER_ALREADY_DRAWN':
        return `Already drawn (draw #${String((e.details as { seq?: number }).seq ?? '?')})`;
      case 'INVALID_NUMBER':
        return 'Enter a number 1–110';
      case 'GAME_NOT_LIVE':
        return 'Game is not live — start it from Setup first';
      case 'NOTHING_TO_UNDO':
        return 'Nothing to undo';
      case 'INVALID_CREDENTIALS':
        return 'Invalid credentials';
      case 'ACCOUNT_LOCKED':
        return 'Too many attempts — try again in a few minutes';
      case 'PINS_NO_LONGER_AVAILABLE':
        return 'PIN window expired — use Reset PIN per player';
      case 'CARDS_LOCKED':
        return "Cards are locked and can't be changed";
      default:
        return e.message;
    }
  }
  return 'Something went wrong';
}
