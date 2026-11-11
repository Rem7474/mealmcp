import { TooManyRequestsError } from '../domain/errors.js';

/**
 * Tiny in-memory sliding-window limiter for login and registration attempts.
 * Fine for a single-process self-hosted app; resets on restart.
 */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Records an attempt and throws when the key has made too many in the window. */
    hit(key: string) {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        throw new TooManyRequestsError('Too many attempts, try again later');
      }
      recent.push(now);
      hits.set(key, recent);
      // Opportunistic cleanup so the map cannot grow without bound.
      if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    },
    /** Forget a key, e.g. after a successful login. */
    reset(key: string) {
      hits.delete(key);
    },
  };
}
