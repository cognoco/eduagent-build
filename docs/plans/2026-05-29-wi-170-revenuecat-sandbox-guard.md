---
title: WI-170 RevenueCat Production Sandbox Guard — Implementation Plan
date: 2026-05-29
profile: code
work_items: [WI-170]
status: approved
---

# WI-170 RevenueCat Production Sandbox Guard — Implementation Plan

**Goal:** Reject production RevenueCat SANDBOX webhooks immediately after payload validation, before any account lookup, idempotency query, subscription provisioning, handler dispatch, KV write, or other billing-state mutation.
**Approach:** Tighten the existing sandbox guard placement in `revenuecat-webhook.ts` and update the sandbox regression tests so the original mutation path fails red before the production code change. Keep non-production SANDBOX and production PRODUCTION flows intact.

## Scope

In scope:
- `apps/api/src/routes/revenuecat-webhook.ts` — move the production SANDBOX guard immediately after successful payload parsing and before `c.get('db')`.
- `apps/api/src/routes/revenuecat-webhook.test.ts` — update the regression test to assert no account lookup, idempotency query, free-subscription provisioning, activation handler, or KV write occurs for production SANDBOX events.
- `docs/plans/2026-05-29-wi-170-revenuecat-sandbox-guard.md` — this execution plan.

Out of scope:
- RevenueCat service handlers in `apps/api/src/services/billing/`.
- Database schema or migrations.
- Stripe webhook behavior.
- Mobile subscription UI.

## File Map

| File | Responsibility |
|---|---|
| `apps/api/src/routes/revenuecat-webhook.test.ts` | Red test for the WI-170 mutation boundary and unchanged acceptance tests for valid production/non-production variants. |
| `apps/api/src/routes/revenuecat-webhook.ts` | Guard ordering: auth -> parse -> reject production SANDBOX -> account/idempotency/provision/dispatch. |
| `docs/plans/2026-05-29-wi-170-revenuecat-sandbox-guard.md` | TDD execution record and reviewable scope contract. |

## Tasks

- [x] T1: Strengthen the production SANDBOX regression test — done when `apps/api/src/routes/revenuecat-webhook.test.ts` has a named test proving production SANDBOX does not call `findAccountByClerkId`, `isRevenuecatEventProcessed`, `ensureFreeSubscription`, `activateSubscriptionFromRevenuecat`, or `writeSubscriptionStatus`, and that test fails before the route change.
- [x] T2: Move the production SANDBOX guard before account and idempotency work — done when the T1 test passes and the route still parses/validates the payload before checking `event.environment`.
- [x] T3: Verify behavioral variants — done when the existing tests prove non-production SANDBOX events are accepted and production PRODUCTION events still activate subscriptions.
- [x] T4: Run focused and API validation — done when the focused RevenueCat webhook Jest suite passes and API lint/typecheck succeed, or any unrelated environmental failure is recorded with exact command output.

## Tests

T1 red command:

```bash
cd apps/api && pnpm exec jest --config jest.config.cjs src/routes/revenuecat-webhook.test.ts --runInBand --runTestsByPath --no-coverage --testNamePattern="WI-170"
```

Expected red failure before implementation: `expect(findAccountByClerkId).not.toHaveBeenCalled()` fails because the current route resolves the account before rejecting production SANDBOX events.

T2/T3 green command:

```bash
cd apps/api && pnpm exec jest --config jest.config.cjs src/routes/revenuecat-webhook.test.ts --runInBand --runTestsByPath --no-coverage --testNamePattern="sandbox events"
```

T4 validation commands:

```bash
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
cd apps/api && pnpm exec jest --config jest.config.cjs src/routes/revenuecat-webhook.test.ts --runInBand --runTestsByPath --no-coverage
```

## Verification Record

- RED: `cd apps/api && pnpm exec jest --config jest.config.cjs src/routes/revenuecat-webhook.test.ts --runInBand --runTestsByPath --no-coverage --testNamePattern="WI-170"` failed before implementation because `findAccountByClerkId` was called once.
- GREEN: same `WI-170` command passed after moving the guard.
- GREEN variants: `--testNamePattern="sandbox events"` passed 4/4 sandbox tests.
- GREEN focused suite: full `revenuecat-webhook.test.ts` passed 91/91.
- GREEN lint: `pnpm exec nx run api:lint` passed.
- GREEN typecheck: `pnpm exec nx reset && pnpm exec nx run api:typecheck` passed.
- BLOCKED environment validation: `pnpm exec nx test:integration api` failed before product assertions because `DATABASE_URL` is unset; the worktree setup's `pnpm env:sync` reported Doppler is not configured.
