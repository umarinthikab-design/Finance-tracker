/**
 * In-memory sliding-window rate limiter (stopgap).
 * NOTE: this resets on redeploy/cold start and is per-instance. For real
 * production hardening, replace with a durable limiter (Upstash Redis or
 * Vercel's built-in rate limiting).
 */
export function createRateLimiter(windowMs: number, maxPerWindow: number) {
  const hits = new Map<string, number[]>();
  return function isRateLimited(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= maxPerWindow) {
      hits.set(key, recent);
      return true;
    }
    recent.push(now);
    hits.set(key, recent);
    return false;
  };
}

/** SMS webhook: 30 hits / minute per IP (unchanged from its inline version). */
export const webhookRateLimiter = createRateLimiter(60 * 1000, 30);

/** Login: 10 attempts / minute per IP. */
export const loginRateLimiter = createRateLimiter(60 * 1000, 10);