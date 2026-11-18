import { TooManyRequestsError } from '../domain/errors.js';

/** The most keys a limiter remembers: beyond it the oldest go, so random keys cannot grow the memory without end. */
const MAX_KEYS = 5000;

/**
 * Tiny in-memory sliding-window limiter for login, registration and other sensitive attempts.
 * Fine for a single-process self-hosted app; resets on restart.
 */
export function createRateLimiter(max: number, windowMs: number, message = 'Too many attempts, try again later') {
  const hits = new Map<string, number[]>();
  const recent = (key: string, now: number) => (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  const sweep = (now: number) => {
    if (hits.size <= MAX_KEYS) return;
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    // Still too many (a flood of fresh keys): a Map keeps insertion order, so the oldest are dropped first.
    for (const k of hits.keys()) {
      if (hits.size <= MAX_KEYS) break;
      hits.delete(k);
    }
  };

  const limiter = {
    /** Throws when the key already made `max` attempts in the window; does not record anything. */
    check(key: string) {
      const now = Date.now();
      const r = recent(key, now);
      if (r.length) hits.set(key, r);
      else hits.delete(key);
      if (r.length >= max) throw new TooManyRequestsError(message);
    },
    /** Records an attempt (typically a failed one). */
    record(key: string) {
      const now = Date.now();
      const r = recent(key, now);
      // Re-inserting moves the key to the end: the least recently active keys are the first to be dropped.
      hits.delete(key);
      hits.set(key, [...r, now]);
      sweep(now);
    },
    /** Records an attempt and throws when the key has made too many in the window. */
    hit(key: string) {
      limiter.check(key);
      limiter.record(key);
    },
    /** Forget a key, e.g. after a successful login. */
    reset(key: string) {
      hits.delete(key);
    },
  };
  return limiter;
}
