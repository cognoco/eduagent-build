# Plan 005: Clamp day-of-month in billing/quota cycle-reset date math

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result. Honor "STOP conditions". When done, update the
> status row in `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/billing/`
> On any change to the cited files, compare excerpts to live code; mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: none (but 002 ensures these tests run in CI)
- **Category**: bug
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

`nextMonthlyReset()` and ~8 sibling sites compute the next quota/subscription reset with a bare `date.setMonth(date.getMonth() + 1)` and no day-of-month clamp. JavaScript's `setMonth` overflows short months: a window anchored on Jan 31 becomes "Feb 31", which rolls forward to **Mar 3**. For any subscription or quota window provisioned on the 29th–31st, the learner gets an over-granted window (extra days before reset) or a skipped reset, and the locally-computed `cycleResetAt` silently diverges from the Stripe billing period it is meant to mirror. It affects every anchor day 29–31 landing in a short month — a recurring, silent correctness bug on a money path.

## Current state

The shared helper (both quota-provision paths use it):

```ts
// services/billing/billing-shared.ts:38-42
export function nextMonthlyReset(now: Date): Date {
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);   // <-- no clamp
  return cycleResetAt;
}
```

All monthly `setMonth(+1)` sites (verified — the daily `setUTCDate(+1)` sites are correct and OUT of scope):

- `services/billing/billing-shared.ts:40` — the shared helper (route others through it).
- `services/billing/quota-reconcile.ts:27` — a SECOND, duplicate inline `setMonth(+1)` on the cycle-reconcile path.
- `services/billing/billing-v2/subscription-core-v2.ts:174, 483, 558, 645` — subscription creation / reset computations.
- `services/billing/billing-v2/revenuecat-v2.ts:418`.
- `services/billing/billing-v2/top-up-v2.ts:82` — `expiresAt.setMonth(expiresAt.getMonth() + TOP_UP_EXPIRY_MONTHS)` (credit expiry; same overflow class, multi-month offset).

Repo conventions:
- Tests are co-located (`*.test.ts` next to source). There is an existing integration test that itself uses the naive pattern as a fixture: `services/billing/quota-reconcile.integration.test.ts:73` (`d.setMonth(d.getMonth() + 1)`) — this is a test's own expected-value computation; updating it to match clamped behavior may be required (see STOP conditions).
- Prefer a single day-clamped helper over editing 8 call sites divergently. Existing shared home: `billing/billing-shared.ts`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm exec nx run api:typecheck` | exit 0 |
| Lint | `pnpm exec nx run api:lint` | exit 0 |
| Billing unit tests | `cd apps/api && pnpm exec jest --findRelatedTests src/services/billing/billing-shared.ts src/services/billing/quota-reconcile.ts --no-coverage` | pass |
| Integration | `pnpm exec nx run api:integration-api` | pass |
| Find sites | `rg -n 'setMonth\(' apps/api/src/services/billing` | the sites above |

## Suggested executor toolkit

- Load `tech-drizzle-atomicity` only if you touch persistence; this fix is pure date math, so likely not needed.

## Scope

**In scope**:
- `apps/api/src/services/billing/billing-shared.ts` — add a day-clamped `addMonthsClamped(date, n)` util and make `nextMonthlyReset` use it.
- `apps/api/src/services/billing/quota-reconcile.ts` — replace its inline `setMonth(+1)` with the helper.
- `apps/api/src/services/billing/billing-v2/subscription-core-v2.ts` (4 sites), `revenuecat-v2.ts:418`, `top-up-v2.ts:82` — route through the helper (`addMonthsClamped(base, 1)`, and `addMonthsClamped(base, TOP_UP_EXPIRY_MONTHS)` for top-up).
- Co-located test files for the helper and at least one caller.

**Out of scope**:
- The daily reset (`setUTCDate(getUTCDate()+1)`) — correct, do not touch.
- Deriving paid-tier resets from Stripe's `current_period_end` instead of local math — a larger design change; note it as a follow-up, do not do it here.
- Any change to already-persisted `cycleResetAt` values / a backfill migration — out of scope; this fixes forward computation only (see STOP conditions if a test implies a backfill is needed).

## Git workflow

- Branch: `advisor/005-billing-month-overflow-reset-date`.
- Conventional commits, e.g. `fix(api): clamp day-of-month in billing cycle-reset date math`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Add the clamped helper

In `billing/billing-shared.ts`, add:

```ts
/**
 * Add `months` to `date`, clamping the day-of-month so a short target month
 * never overflows (Jan 31 + 1mo → Feb 28/29, not Mar 3). JS `setMonth` rolls
 * overflow forward; this preserves the intended month boundary.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
  const anchorDay = result.getUTCDate();
  result.setUTCDate(1);                              // avoid overflow while shifting month
  result.setUTCMonth(result.getUTCMonth() + months);
  const daysInTargetMonth = new Date(Date.UTC(
    result.getUTCFullYear(), result.getUTCMonth() + 1, 0,
  )).getUTCDate();
  result.setUTCDate(Math.min(anchorDay, daysInTargetMonth));
  return result;
}
```

Then rewrite `nextMonthlyReset`:

```ts
export function nextMonthlyReset(now: Date): Date {
  return addMonthsClamped(new Date(now), 1);
}
```

Decision note: the original used local `setMonth`; the helper uses UTC (`setUTCMonth`) to avoid DST/timezone drift in reset timestamps. If any existing test asserts a **local**-time reset, keep the helper UTC and update that test's expectation (reset timestamps should be timezone-stable) — but if switching to UTC shifts a persisted value comparison, treat as a STOP condition and report.

**Verify**: `pnpm exec nx run api:typecheck` → exit 0.

### Step 2: Route every monthly site through the helper

Replace each `X.setMonth(X.getMonth() + 1)` (and the top-up `+ TOP_UP_EXPIRY_MONTHS`) at the sites listed in "Current state" with `const X = addMonthsClamped(<base>, 1)` (or `TOP_UP_EXPIRY_MONTHS`). Import `addMonthsClamped` from `../billing-shared` (adjust relative path per file). Remove the now-orphaned mutable `new Date()` + `setMonth` pattern your change replaced.

**Verify**: `rg -n 'setMonth\(' apps/api/src/services/billing --glob '!*.test.ts'` returns ONLY the daily/out-of-scope sites (should be none for monthly) — i.e. no production monthly `setMonth(+1)` remains. `pnpm exec nx run api:typecheck` → exit 0.

### Step 3: Run the billing suites

**Verify**: `cd apps/api && pnpm exec jest --findRelatedTests src/services/billing/billing-shared.ts src/services/billing/quota-reconcile.ts src/services/billing/billing-v2/subscription-core-v2.ts --no-coverage` → pass. `pnpm exec nx run api:integration-api` → pass.

## Test plan

- **New test** `apps/api/src/services/billing/billing-shared.test.ts` for `addMonthsClamped`, covering the overflow matrix:
  - Jan 31 + 1 → Feb 28 (non-leap) and Feb 29 (leap year, e.g. 2028).
  - Jan 30 + 1 → Feb 28/29.
  - Mar 31 + 1 → Apr 30.
  - Feb 28 + 1 → Mar 28 (no spurious clamp on a normal day).
  - Dec 31 + 1 → Jan 31 (year rollover).
  - `TOP_UP_EXPIRY_MONTHS` offset from a 31st anchor lands on a valid clamped day.
- Structural pattern: any existing pure-function test under `services/billing/` (e.g. `billing-pricing.test.ts`).
- Verification: the new suite passes; the pre-existing billing suites still pass.

## Done criteria

- [ ] `addMonthsClamped` exists in `billing-shared.ts` and `nextMonthlyReset` uses it.
- [ ] No production monthly `setMonth(+1)`/`+ TOP_UP_EXPIRY_MONTHS` remains in `services/billing/**` (grep clean).
- [ ] New overflow-matrix test exists and passes (incl. leap-year Feb).
- [ ] `pnpm exec nx run api:typecheck`, `api:lint`, `api:integration-api` all pass.
- [ ] Only in-scope files modified (`git status`).
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md` status row updated.

## STOP conditions

- Switching a call site to the clamped/UTC helper changes an **already-persisted** `cycleResetAt` on the reconcile path in a way an existing test asserts (implying a data backfill) — STOP; a persisted-value migration is out of scope and needs its own plan with a `## Rollback` section.
- `TOP_UP_EXPIRY_MONTHS` is not a simple integer months constant (e.g. it encodes something else) — STOP and report before changing `top-up-v2.ts:82`.
- A caller relies on the overflow behavior deliberately (a comment says so) — STOP and report; do not silently change intended behavior.

## Maintenance notes

- All future monthly date offsets in billing must go through `addMonthsClamped`. A reviewer should reject any new bare `setMonth(+N)` in `services/billing/`.
- Deferred follow-up (recommended, not in scope): for Stripe-billed subscriptions, prefer the webhook's `current_period_end` over local computation so the quota window and the billing period cannot drift at all — a design change worth a separate plan.
