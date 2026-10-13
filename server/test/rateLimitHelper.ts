import { resetRateLimits } from '../src/middleware/rateLimit.js';

/** Test-only hook: reset express-rate-limit counters between tests. */
export async function _resetRateLimitForTests(): Promise<void> {
  await resetRateLimits();
}
