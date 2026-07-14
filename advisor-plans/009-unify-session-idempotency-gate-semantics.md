# Plan 009: Unify the two session idempotency gates to one fail-closed policy

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result. Honor "STOP conditions". This touches a money
> path — the guard test is mandatory. When done, update the status row in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- apps/api/src/middleware/metering.ts apps/api/src/middleware/idempotency.ts apps/api/src/routes/sessions.ts`
> On any change, compare excerpts to live code; mismatch → STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

Two idempotency preflight gates run on the same session routes (`/messages`, `/stream`) with **opposite KV-failure semantics**: `middleware/metering.ts`'s `maybeReplayIdempotentSessionRequest` fails **open** on a KV read error (its own comment admits this "double-decrement[s] the quota pool" on client retry) and then proceeds to `decrementQuota`; `middleware/idempotency.ts`'s `idempotencyPreflight` on the same routes fails **closed** (returns 503). Today the money path is correct **only** because the fail-closed gate 503s first and the metering layer refunds on the ≥400. This is a latent double-charge behind fragile coupling: if anyone removes `idempotencyPreflight` from a route — a reasonable thing to do believing metering already handles idempotency — the double-decrement the metering comment describes goes live, and no test catches it. The invariant should live in one place with one policy.

## Current state

```ts
// middleware/metering.ts:305-346 — FAILS OPEN on KV error (comment admits double-decrement)
async function maybeReplayIdempotentSessionRequest(c, db, profileId): Promise<Response | null> {
  if (!isIdempotentSessionRoute(c.req.path)) return null;
  const key = c.req.header('Idempotency-Key')?.trim();
  if (!key) return null;
  ...
  const kv = c.env?.IDEMPOTENCY_KV;
  if (!kv) return null;
  let existing: string | null = null;
  try {
    existing = await kv.get(buildIdempotencyCacheKey(profileId, 'session', key));
  } catch (error) {
    logger.warn('[metering] Idempotency replay lookup failed', { ... });
    // [CR-2026-05-21-047] ...On KV outage every idempotent session request is
    // processed twice if the client retries — including double-decrementing the
    // quota pool. Emit via safeSend ...
    await safeSend(...);
    // <-- falls through, returns null → caller proceeds to decrementQuota
  }
  ...
}
```

```ts
// middleware/idempotency.ts:65-103 — FAILS CLOSED on KV error (503)
try {
  existing = await kv.get(buildIdempotencyCacheKey(profileId, options.flow, key));
} catch (err) {
  // [BUG-498] KV read failure → degrade safely with 503 + Retry-After.
  // ...Returning 503 is strictly safer — the caller retries the whole request
  // and the idempotency invariant is preserved.
  ...
  c.header('Retry-After', '5');
  return c.json({ code: ERROR_CODES.INTERNAL_ERROR, message: '...retry...' }, 503);
}
```

- Both gates cover the same routes: `metering.ts` `SESSION_MESSAGE_STREAM_PATTERNS` = `/messages`, `/stream`; `routes/sessions.ts:179-183` applies `idempotencyPreflight` to both.
- The metering decrement is only saved today by `shouldRefundAfterHandler(status >= 400)` refunding after the 503 (`metering.ts:911-947`).

Repo convention (`AGENTS.md` "Fix Development Rules"): billing/auth/webhook code must not silently recover without a structured metric/event; both gates already emit — preserve that.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm exec nx run api:typecheck` | exit 0 |
| Metering tests | `cd apps/api && pnpm exec jest --findRelatedTests src/middleware/metering.ts src/middleware/idempotency.ts --no-coverage` | pass |
| Integration | `pnpm exec nx run api:integration-api` | pass |

## Scope

**In scope**:
- `apps/api/src/middleware/metering.ts` — make `maybeReplayIdempotentSessionRequest` fail **closed** on a KV read error (return a 503 the same way `idempotencyPreflight` does, or delegate to the shared decision), instead of falling through to `decrementQuota`. Correct the now-accurate comment.
- The co-located metering/idempotency tests — add the guard test below.

**Out of scope**:
- Removing `idempotencyPreflight` from the session routes — do NOT. Both gates staying is fine; the fix is making their failure policy *consistent* (both fail-closed) so removing either later cannot open a double-charge. If you'd rather consolidate to a single gate, that's a larger refactor — treat it as a follow-up, not this plan.
- The refund logic (`shouldRefundAfterHandler`) — leave it; it's a correct backstop.
- The happy-path replay behavior — unchanged.

## Git workflow

- Branch: `advisor/009-unify-session-idempotency-gate-semantics`.
- Conventional commits, e.g. `fix(api): fail closed on KV error in metering idempotency replay`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Make the metering replay gate fail closed on KV read error

In `maybeReplayIdempotentSessionRequest` (`metering.ts:305-346`), in the `catch (error)` around `kv.get(...)`: after emitting the existing `safeSend`/`logger.warn` (keep them — the metric requirement), return a 503 response (with `Retry-After`, matching `idempotency.ts:96-103`'s shape and `ERROR_CODES.INTERNAL_ERROR`) instead of falling through to `null`. Because the function returns `Response | null`, returning the 503 short-circuits the caller before `decrementQuota` — mirroring the fail-closed gate. Update the `[CR-2026-05-21-047]` comment to state the new behavior (fail-closed, no double-decrement) rather than describing the old double-decrement.

**Verify**: `pnpm exec nx run api:typecheck` → exit 0. Read the caller of `maybeReplayIdempotentSessionRequest` to confirm a returned `Response` is propagated (not ignored) — if it isn't, that's a STOP condition.

### Step 2: Guard test — KV failure never reaches decrementQuota

Add a test (in `metering.test.ts` or `metering.integration.test.ts`) that stubs `IDEMPOTENCY_KV.get` to throw on an idempotent session route and asserts: (a) the response is 503 with `Retry-After`; (b) `decrementQuota` is NOT called (spy/assert on the quota decrement, or assert the quota pool is unchanged in the integration variant); (c) the structured event is still emitted. KV is an external boundary — stubbing it is allowed.

**Verify (red-green-revert)**: test passes; revert the Step-1 change (restore fall-through) → test FAILS (decrementQuota reached / status not 503); restore → passes. Record the loop in the PR.

### Step 3: Full suites

**Verify**: `cd apps/api && pnpm exec jest --findRelatedTests src/middleware/metering.ts --no-coverage` → pass; `pnpm exec nx run api:integration-api` → pass; existing idempotency tests still green.

## Test plan

- **New guard test**: "KV read failure on an idempotent session route → 503, no quota decrement, event emitted". Structural pattern: existing `metering.test.ts` idempotency-replay cases and `middleware/idempotency.test.ts`'s 503-on-KV-error case.
- Verification: the new test plus the full metering + integration suites pass.

## Done criteria

- [ ] `maybeReplayIdempotentSessionRequest` returns a 503 (not `null`) on a KV read error; `decrementQuota` is unreachable on that path.
- [ ] The `[CR-2026-05-21-047]` comment describes the new fail-closed behavior.
- [ ] Guard test exists, passes, and provably fails when the fix is reverted (red-green-revert recorded).
- [ ] The structured metric/event on KV failure is still emitted.
- [ ] `pnpm exec nx run api:typecheck`, `api:lint`, `api:integration-api` pass.
- [ ] Only in-scope files modified (`git status`).
- [ ] `advisor-plans/README.md` status row updated.

## STOP conditions

- The caller of `maybeReplayIdempotentSessionRequest` ignores a returned `Response` (so returning 503 wouldn't short-circuit) — STOP; the fix needs a different shape and you should report the caller wiring.
- Making metering fail-closed causes a legitimate, already-green test to fail because it depended on the fall-through — inspect whether that test encodes the double-charge bug; if it asserts double-processing as "expected", report it rather than preserving it.
- The two gates turn out to already share a helper (recently unified) — then there's nothing to do; report it and mark the finding resolved.

## Maintenance notes

- After this, both session idempotency gates fail closed. A reviewer should reject any future change that reintroduces a fail-open path to `decrementQuota`.
- Deferred (recommended): fold the two gates into a single session-idempotency preflight so the invariant has one home — a larger refactor worth its own plan.
- The refund-on-4xx backstop remains; it's belt-and-suspenders now rather than the sole thing preventing a double-charge.
