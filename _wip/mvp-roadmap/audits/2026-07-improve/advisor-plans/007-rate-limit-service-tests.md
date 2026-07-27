# Plan 007: Add unit tests for the sliding-window rate limiter and IP resolver

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result. Honor "STOP conditions". When done, update the
> status row in `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/rate-limit.ts`
> On any change, compare the excerpt to live code; mismatch → STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

`services/rate-limit.ts` is an abuse-prevention primitive used by four routes (`consent.ts`, `family-join.ts`, `feedback.ts`, `consent-web.ts`) and has **zero tests**. The sliding-window arithmetic (window eviction, the `>= max` boundary, LRU eviction) and `resolveRateLimitIp`'s header-precedence parsing are pure, fully unit-testable logic. A window-eviction or off-by-one bug degrades the limiter to a silent no-op — and it guards exactly the consent and family-join paths where you least want that. It is also security-relevant: `resolveRateLimitIp` deliberately uses the leftmost XFF token to stop an attacker rotating proxies from minting a fresh bucket per request; that guarantee is untested.

## Current state

The whole module is pure (no I/O). Exports: `createSlidingWindowRateLimiter(options)` → `{ isLimited(key), reset() }`, and `resolveRateLimitIp(cfConnectingIp, xForwardedFor)`.

```ts
// services/rate-limit.ts — key behaviors to pin
export function createSlidingWindowRateLimiter(options: {
  windowMs: number; max: number; maxEntries: number;
}): { isLimited(key: string): boolean; reset(): void } {
  const timestamps = new Map<string, number[]>();
  function isLimited(key: string): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;
    const recent = (timestamps.get(key) ?? []).filter((t) => t > cutoff);
    // LRU touch: delete-before-set moves key to insertion-order tail
    // ...
    const isNewKey = recent.length === 0;
    if (isNewKey && timestamps.size >= maxEntries) {
      const oldest = timestamps.keys().next().value;  // evict LRU
      if (oldest !== undefined) timestamps.delete(oldest);
    }
    if (recent.length >= max) { timestamps.set(key, recent); return true; }  // blocked, does NOT record
    recent.push(now); timestamps.set(key, recent); return false;             // allowed, records
  }
  // reset(): timestamps.clear()
}

export function resolveRateLimitIp(cfConnectingIp, xForwardedFor): string {
  const cf = cfConnectingIp?.trim();
  if (cf) return cf;                              // 1. cf-connecting-ip wins
  const xff = xForwardedFor?.trim();
  if (xff) { const first = xff.split(',')[0]?.trim(); if (first) return first; } // 2. leftmost XFF
  return 'unknown';                              // 3. fallback
}
```

Important behavioral details to encode as tests:
- `isLimited` returns `true` when already at/over `max` for the window and **does not** record the blocked call.
- On an allowed call it records `now`. So with `max: N`, the first N calls return `false`, the (N+1)th returns `true` (within `windowMs`).
- After `windowMs` elapses (fake timers), old timestamps age out of `recent` and the key is allowed again.
- LRU eviction only fires for a NEW key when `size >= maxEntries`; it evicts `keys().next().value` (least-recently-touched, because of delete-before-set).
- `resolveRateLimitIp`: cf beats xff; leftmost XFF token used; whitespace trimmed; both absent/empty → `'unknown'`.

Repo conventions:
- Co-located test, no `__tests__/`. Pure-function test with `jest.useFakeTimers()` for the time-window cases (the limiter uses `Date.now()`).
- Model after an existing pure-service test, e.g. `services/billing/billing-pricing.test.ts` or `services/age-utils.test.ts`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm exec nx run api:typecheck` | exit 0 |
| Run new test | `cd apps/api && pnpm exec jest --findRelatedTests src/services/rate-limit.ts --no-coverage` | pass |
| Confirm none today | `rg -l 'rate-limit' apps/api/src --glob '*.test.ts'` | (before) no result |

## Scope

**In scope**:
- `apps/api/src/services/rate-limit.test.ts` (create).

**Out of scope**:
- `apps/api/src/services/rate-limit.ts` — do NOT modify. Test-only. If a test exposes a real bug (e.g. eviction is wrong), STOP and report; don't fix here.
- The four consumer routes — their integration is out of scope (plan 006 covers family-join's route-level rate-limit behavior).
- The BUG-99 per-isolate distributed-state limitation — accepted and documented; do not test or "fix" it.

## Git workflow

- Branch: `advisor/007-rate-limit-service-tests`.
- Conventional commits, e.g. `test(api): cover sliding-window rate limiter and IP resolver`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: `createSlidingWindowRateLimiter` window + boundary tests

Create `apps/api/src/services/rate-limit.test.ts`. With `jest.useFakeTimers()` and a limiter `{ windowMs: 1000, max: 3, maxEntries: 100 }`:
- First 3 `isLimited('a')` calls → `false`; 4th → `true` (boundary).
- After `jest.advanceTimersByTime(1001)`, `isLimited('a')` → `false` again (window reset).
- A blocked call does not consume budget: after tripping the limit, advancing past the window frees exactly the aged calls (assert the count arithmetic).
- `reset()` clears all state (tripped key becomes allowed immediately).
- Distinct keys have independent budgets (`'a'` tripped does not block `'b'`).

### Step 2: LRU eviction test

With `{ windowMs: 60000, max: 5, maxEntries: 2 }`: touch keys `'a'` then `'b'` (fills to maxEntries), then a new key `'c'` → the least-recently-touched key is evicted. Verify by asserting the evicted key's budget was reset (it behaves as new again) while the retained key's budget persists. Include a case that touching `'a'` again before adding `'c'` makes `'b'` the eviction victim (proves LRU-by-touch, not FIFO).

### Step 3: `resolveRateLimitIp` precedence tests

- cf present → returns cf (trimmed), ignoring xff.
- cf absent, xff `"1.1.1.1, 2.2.2.2"` → returns `"1.1.1.1"` (leftmost).
- cf absent, xff with leading spaces `" 3.3.3.3 , 4.4.4.4"` → returns `"3.3.3.3"` (trimmed).
- both absent/empty/whitespace → `"unknown"`.
- cf empty string but xff present → falls through to xff (empty is falsy after trim).

**Verify (all steps)**: `cd apps/api && pnpm exec jest --findRelatedTests src/services/rate-limit.ts --no-coverage` → pass; `pnpm exec nx run api:typecheck` → exit 0.

## Test plan

Steps 1–3 are the test plan. Structural pattern: `services/age-utils.test.ts` (pure) + any suite using `jest.useFakeTimers()`. New tests only; the "regression protection" is the coverage of the boundary/eviction/precedence logic.

## Done criteria

- [ ] `apps/api/src/services/rate-limit.test.ts` exists with window-boundary, window-reset, LRU-eviction (incl. touch-order), `reset()`, and `resolveRateLimitIp` precedence cases.
- [ ] `cd apps/api && pnpm exec jest --findRelatedTests src/services/rate-limit.ts --no-coverage` passes.
- [ ] `pnpm exec nx run api:typecheck` exits 0.
- [ ] No internal mocks (the module is pure; nothing to mock).
- [ ] Only `rate-limit.test.ts` added (`git status`).
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md` status row updated.

## STOP conditions

- The eviction test shows `keys().next().value` does NOT evict the least-recently-touched key (LRU claim in the code comment is wrong) — STOP and report a real bug.
- The `>= max` boundary behaves off-by-one vs. the comment (e.g. allows max+1) — STOP and report.
- `Date.now()` isn't controllable by `jest.useFakeTimers()` in this project's jest config — check the config; if timers are real, use a small real `windowMs` and `await` real delays only as a last resort, and note it.

## Maintenance notes

- If the limiter ever moves to a Workers-durable backing store (KV/Durable Object, the tracked BUG-99 follow-up), these unit tests still validate the in-process algorithm but new integration tests will be needed for the distributed path.
- Reviewer should confirm the tests assert the *no-record-on-block* behavior — it's the subtle correctness property most likely to regress.
