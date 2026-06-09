// ---------------------------------------------------------------------------
// Shared in-memory sliding-window rate limiter.
//
// Previously this windowed-`Map` pattern was duplicated across two route files
// (`routes/consent.ts` and `routes/feedback.ts`) and a third route
// (`routes/consent-web.ts`) imported the consent route's copy directly —
// route-to-route coupling of stateful business logic. This service is the
// single home for the algorithm; routes construct a limiter and call it.
//
// [BUG-99 / SEC-03 — ACCEPTED LIMITATION] On Cloudflare Workers each isolate
// keeps its own `Map`, so the effective ceiling is `max × N isolates` per
// window and state resets on cold start. This is defense-in-depth, not a
// load-bearing global control. Moving to a Workers-durable backing store
// (KV / Durable Object) is tracked separately and is out of scope here — this
// extraction only consolidates the duplicated in-process implementation.
// ---------------------------------------------------------------------------

export interface SlidingWindowRateLimiterOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum allowed events per key within the window. */
  max: number;
  /** Hard cap on distinct keys retained; LRU eviction past this size. */
  maxEntries: number;
}

export interface SlidingWindowRateLimiter {
  /**
   * Records an attempt for `key` and returns `true` when the key is already at
   * or over its limit for the current window (i.e. the request should be
   * blocked). On a non-blocked call the current timestamp is recorded.
   */
  isLimited(key: string): boolean;
  /** Clears all state. Intended for tests. */
  reset(): void;
}

/**
 * Builds an in-memory sliding-window rate limiter. The eviction policy is
 * LRU-by-touch: every `isLimited` call moves the key to the insertion-order
 * tail (delete-before-set), so `keys().next().value` is the genuine
 * least-recently-touched key when the map is full and a NEW key arrives.
 */
export function createSlidingWindowRateLimiter(
  options: SlidingWindowRateLimiterOptions,
): SlidingWindowRateLimiter {
  const { windowMs, max, maxEntries } = options;
  const timestamps = new Map<string, number[]>();

  function isLimited(key: string): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;
    const existing = timestamps.get(key);
    const recent = (existing ?? []).filter((t) => t > cutoff);

    // [CR-2026-05-21-094] LRU touch: delete before re-set so the key moves to
    // the insertion-order tail. This makes keys().next().value the true
    // least-recently-touched key rather than the first-ever inserted one.
    if (existing !== undefined) {
      timestamps.delete(key);
    }

    const isNewKey = recent.length === 0;
    if (isNewKey && timestamps.size >= maxEntries) {
      const oldest = timestamps.keys().next().value;
      if (oldest !== undefined) timestamps.delete(oldest);
    }

    if (recent.length >= max) {
      timestamps.set(key, recent);
      return true;
    }

    recent.push(now);
    timestamps.set(key, recent);
    return false;
  }

  function reset(): void {
    timestamps.clear();
  }

  return { isLimited, reset };
}

/**
 * [BUG-648 / FCR-2026-05-23-L2.M2.5] Extract the canonical client IP for
 * rate-limiting. Prefer Cloudflare's `cf-connecting-ip` (always the real
 * client at the edge), then fall back to the FIRST token of
 * `x-forwarded-for`. Using the entire XFF header verbatim as the bucket key
 * lets an attacker rotating intermediate proxies produce a fresh bucket per
 * chain and bypass the per-IP limit. We deliberately use the LEFTMOST token
 * (the original client) rather than the rightmost, because at the Cloudflare
 * edge `cf-connecting-ip` is already the trusted value when present; the XFF
 * fallback only fires in non-CF environments (local dev, tests). The first
 * token is what RFC 7239 defines as the originating client.
 */
export function resolveRateLimitIp(
  cfConnectingIp: string | null | undefined,
  xForwardedFor: string | null | undefined,
): string {
  const cf = cfConnectingIp?.trim();
  if (cf) return cf;
  const xff = xForwardedFor?.trim();
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}
