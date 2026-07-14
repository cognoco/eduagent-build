# Plan 008: Test the webhook dispatcher and v2 top-up money writes for real

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result. Honor "STOP conditions". When done, update the
> status row in `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/billing/billing-v2/ apps/api/src/routes/stripe-webhook.test.ts apps/api/src/routes/revenuecat-webhook.test.ts`
> On any change to cited files, compare to live code; mismatch → STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 002 (so a billing-v2 diff routes through the integration lane)
- **Category**: tests
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

The single decision point that routes an inbound payment webhook to a handler bundle — `getStripeWebhookHandlers()` / `getRevenuecatWebhookHandlers()` in `billing-v2/dispatch.ts` — is exercised by **zero** tests. The only two tests that name it (`stripe-webhook.test.ts`, `revenuecat-webhook.test.ts`) **mock it away** with `jest.fn()` handler bundles, so a wrong branch in `dispatch.ts` (sending a live Stripe event to the wrong handler) fails no test. Separately, `billing-v2/top-up-v2.ts` (`purchaseTopUpCreditsV2` — an actual credit-purchase money write) and `tier-v2.ts`'s `reattributeTopUpCreditsOnModelChangeV2` are unexecuted by the suite (`top-up-v2` is `jest.mock`'d in the one test that names it; `reattribute...` has zero references). These are direct money writes with no real test.

## Current state

```ts
// services/billing/billing-v2/dispatch.ts — the untested selectors
export function getStripeWebhookHandlers(): StripeWebhookHandlers { ... }      // :87
export function getRevenuecatWebhookHandlers(): RevenuecatWebhookHandlers { ... } // :166
```

```ts
// routes/stripe-webhook.test.ts:22 — mocks the dispatcher away
jest.mock('../services/billing/billing-v2/dispatch', () => ({ ... jest.fn() bundles ... }));
// routes/revenuecat-webhook.test.ts:23 — same
// services/billing/billing-v2/revenuecat-webhook-handler-v2.test.ts:125 — mocks top-up-v2 away
jest.mock('./top-up-v2', () => { ... });
```

Untested money writes:
- `billing-v2/top-up-v2.ts` — `purchaseTopUpCreditsV2` (credit purchase).
- `billing-v2/tier-v2.ts` — `reattributeTopUpCreditsOnModelChangeV2` (0 test references).
- `billing-v2/top-up.ts` / `top-up-v2.ts` — `getTopUpPriceCents(tier)` and similar pure pricing helpers (cheapest, highest-value to test first).

Repo conventions:
- Internal-mock ban (GC1/GC6): the goal here is to REMOVE the `jest.mock(dispatch)` / `jest.mock(top-up-v2)` internal mocks and exercise the real modules. Mock only true external boundaries (Stripe SDK, Clerk, the DB only if a real DB isn't available — prefer the integration suite with a real Neon test DB for the money writes).
- The existing v2 webhook integration test `routes/stripe-webhook-v2.integration.test.ts` imports the services directly but does NOT route through the dispatcher — use it as the structural model for a route-level test that DOES.
- `AGENTS.md` "Fix Development Rules": billing code must not silently recover without a metric/event — assert that on error paths.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm exec nx run api:typecheck` | exit 0 |
| Dispatcher unit test | `cd apps/api && pnpm exec jest --findRelatedTests src/services/billing/billing-v2/dispatch.ts --no-coverage` | pass |
| Integration | `pnpm exec nx run api:integration-api` | pass |
| Mock-check hook | (automatic PostToolUse on test-file edits) | no new internal mocks |

## Suggested executor toolkit

- Load `tech-stripe-best-practices` and `tech-drizzle-atomicity` (repo skills) — the money-write tests should assert idempotency/atomicity, not just a happy path.

## Scope

**In scope**:
- `apps/api/src/services/billing/billing-v2/dispatch.test.ts` (create) — unit-test the two selectors' handler-selection contract.
- `apps/api/src/services/billing/billing-v2/top-up-v2.test.ts` / `.integration.test.ts` (create) — `purchaseTopUpCreditsV2`.
- `apps/api/src/services/billing/billing-v2/tier-v2.test.ts` — add `reattributeTopUpCreditsOnModelChangeV2` cases (extend if the file has a test; create if not).
- Pricing helper tests (`getTopUpPriceCents`) — add to the nearest existing billing pricing test.
- `routes/stripe-webhook.test.ts`, `routes/revenuecat-webhook.test.ts` — REMOVE the `jest.mock(dispatch)` so the route exercises the real selector (GC6 boy-scout).

**Out of scope**:
- The webhook signature/replay verification (already tested and clean — don't duplicate).
- Any change to `dispatch.ts` / `top-up-v2.ts` / `tier-v2.ts` production code. If a test reveals a bug, STOP and report.

## Git workflow

- Branch: `advisor/008-webhook-dispatcher-topup-money-tests`.
- Conventional commits, e.g. `test(api): exercise webhook dispatcher and v2 top-up money writes`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Pure pricing helpers (cheapest, do first)

Add tests for `getTopUpPriceCents(tier)` (and any sibling pure pricing helper in `top-up.ts`/`top-up-v2.ts`): each tier → its expected cents; unknown tier → its defined behavior (throw or null — read the code, assert what it actually does). Put them in the nearest existing billing pricing test file, or a new `top-up.test.ts`.

**Verify**: `cd apps/api && pnpm exec jest --findRelatedTests src/services/billing/billing-v2/top-up-v2.ts --no-coverage` → pass.

### Step 2: Dispatcher selection contract

Create `dispatch.test.ts`. Call the REAL `getStripeWebhookHandlers()` / `getRevenuecatWebhookHandlers()` and assert the returned bundle has the expected handler keys/identities for each input condition the selectors branch on (read `dispatch.ts:87` and `:166` to enumerate the branches). No mocking of `dispatch` itself. This proves a wrong branch would fail.

**Verify**: `cd apps/api && pnpm exec jest --findRelatedTests src/services/billing/billing-v2/dispatch.ts --no-coverage` → pass, covering every branch.

### Step 3: Money writes — `purchaseTopUpCreditsV2` and `reattributeTopUpCreditsOnModelChangeV2`

Prefer an `*.integration.test.ts` against the real Neon test DB (mirrors how `stripe-webhook-v2.integration.test.ts` runs), since these are writes. Cover: successful purchase increments the credit pool by the right amount; idempotency (same event twice does not double-credit — assert the existing idempotency guard actually holds); re-attribution on model change moves credits correctly. Do NOT mock the DB or the module under test.

**Verify**: `pnpm exec nx run api:integration-api` → pass, new cases included.

### Step 4: Un-mock the dispatcher in the two route tests (GC6)

In `routes/stripe-webhook.test.ts` and `routes/revenuecat-webhook.test.ts`, delete the `jest.mock('../services/billing/billing-v2/dispatch', ...)` block so the route runs the real selector. Keep external-boundary mocks (Stripe SDK signature verify, Clerk). If un-mocking surfaces real coupling that makes the test need a DB, convert that route test to the integration lane or inject the real handlers — do not re-add the mock.

**Verify**: `cd apps/api && pnpm exec jest --findRelatedTests src/routes/stripe-webhook.ts src/routes/revenuecat-webhook.ts --no-coverage` → pass; the PostToolUse mock-check hook reports the internal `dispatch` mock is gone.

## Test plan

- Steps 1–4 are the plan. Structural models: `stripe-webhook-v2.integration.test.ts` (route + real services), `billing-pricing.test.ts` (pure pricing).
- The regression this protects: a wrong handler-selection branch, a double-credit on webhook retry, and a mis-priced tier — all currently invisible.
- Verification: `pnpm exec nx run api:integration-api` and the dispatcher unit suite pass; both webhook route tests pass without the internal `dispatch` mock.

## Done criteria

- [ ] `dispatch.test.ts` exercises the REAL selectors across every branch.
- [ ] `purchaseTopUpCreditsV2` and `reattributeTopUpCreditsOnModelChangeV2` have executing tests (incl. an idempotency/no-double-credit case).
- [ ] `getTopUpPriceCents` (and sibling pricing helpers) have tests.
- [ ] The `jest.mock(dispatch)` blocks are removed from both webhook route tests; the mock-check hook shows no new internal mocks.
- [ ] `pnpm exec nx run api:typecheck`, `api:lint`, `api:integration-api` all pass.
- [ ] Only in-scope files modified (`git status`).
- [ ] `advisor-plans/README.md` status row updated.

## STOP conditions

- Un-mocking the dispatcher makes a webhook route test require a live Stripe/RevenueCat network call that can't be stubbed at the SDK boundary — STOP and report; the route may be too coupled to test without a refactor (out of scope).
- A money-write test reveals a double-credit or wrong-amount bug — STOP and report it as a separate finding (do not fix production code in this test-only plan).
- `reattributeTopUpCreditsOnModelChangeV2` turns out to be dead/unreferenced in production (not just in tests) — report it as possible dead code rather than writing tests for it.

## Maintenance notes

- These tests pin the *money-routing and money-write contracts*. Any change to the webhook handler bundles or the top-up credit math must update them.
- Reviewer should scrutinize that the idempotency assertions use the real guard (unique constraint / claim), not a mocked one — a mocked idempotency check proves nothing.
- The `jest.mock(dispatch)` removal is part of the GC6 internal-mock burn-down; note the reduction in the commit message.
