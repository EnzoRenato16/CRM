/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Enough to blunt online brute-force (login) and cost/DoS abuse (query) for a
 * single-instance reference app. In production behind multiple instances, back
 * this with a shared store (Redis / Upstash) so the window is global.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Returns whether `key` is within `limit` hits per `windowMs`. Every call that
 * returns ok=true consumes one slot.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Best-effort client IP from common proxy headers, for keying limits. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

// Opportunistic cleanup so the map cannot grow without bound.
function sweep(): void {
  const now = Date.now();
  for (const [key, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(key);
  }
}
const timer = setInterval(sweep, 60_000);
// Do not keep the process alive just for the sweeper.
(timer as unknown as { unref?: () => void }).unref?.();
