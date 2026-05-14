# Telemetry sweep + route-shrinking — Plan

**Date:** 2026-05-14
**Branch:** `next-phase-2026-05-14` (worktree, branched off `origin/main` at `2143bb56e`)
**Closes audit #4 (telemetry isolation: partial → full) and opens campaign #1 (route shrinking)**

## Phase A — Telemetry isolation sweep (#4)

### Context

`safeSend()` in `apps/api/src/services/safe-non-core.ts` wraps `inngest.send(...)` so failures go to Sentry + log but never throw. PR #254 (`affb3014d refactor(api): isolate non-core side effects`) shipped the bulk migration; some sites remain in legacy manual `try/catch` or are truly bare. We finish the sweep and ratchet to prevent regressions.

### Truth-table on origin/main (`2143bb56e`)

23 `inngest.send(...)` sites in `apps/api/src` (excluding test files, the helper itself, and one comment-only reference in `inngest/functions/exchange-empty-reply-fallback.ts`).

| Status | Count | Action |
|---|---:|---|
| Already wrapped in `safeSend(...)` | 4 + 3 (resend-webhook) | None — done |
| Manual `try { await inngest.send(...) } catch` | 12 | Migrate to `safeSend` if non-core, keep with `// core-send: <reason>` if core |
| Bare `await inngest.send(...)` | 7 | Wrap in `safeSend` if non-core, keep with `// core-send: <reason>` if core |

### Sweep targets — 14 non-core sites migrate to `safeSend`

| File:Line | Event | Current shape |
|---|---|---|
| `routes/consent.ts:191` | `app/consent.requested` | try/catch |
| `routes/consent.ts:352` | `app/consent.revoked` | try/catch |
| `routes/sessions.ts:257` | `app/filing.retry` (auto) | bare |
| `routes/sessions.ts:368` | `app/ask.gate_decision` | try/catch |
| `routes/sessions.ts:382` | `app/ask.gate_timeout` (fail_open) | bare (inside same try) |
| `services/account.ts:151` | `app/billing.trial_subscription_failed` | try/catch |
| `services/billing/metering.ts:35` | `app/billing.ownership.mismatch` | try/catch |
| `services/session/session-exchange.ts:377` | (orphan persist) | try/catch |
| `services/session/session-exchange.ts:476` | (orphan persist) | try/catch |
| `services/session/session-exchange.ts:1874` | (orphan persist) | try/catch |
| `services/session/session-exchange.ts:2053` | (orphan persist) | bare |
| `services/session/session-exchange.ts:2101` | (orphan persist) | bare |
| `services/subject.ts:114` | curriculum prewarm | try/catch |
| `services/subject.ts:142` | curriculum retry | try/catch |

### Core-send allowlist — 5 sites stay bare, get `// core-send: <reason>` comment

A bare `await inngest.send(...)` on a CORE site means "failure must throw and short-circuit the user action." Each gets a single-line comment immediately above the call so the ratchet test can identify intentional bare sites:

```ts
// core-send: account deletion pipeline — silent failure leaves profiles undeleted past grace
await inngest.send({ name: 'app/account.deletion-scheduled', ... });
```

| File:Line | Event | Why CORE |
|---|---|---|
| `routes/account.ts:36` | `app/account.deletion-scheduled` | Missed dispatch leaves profiles undeleted past grace period |
| `routes/filing.ts:54` | `app/filing.retry` (user-clicked) | User explicitly requested retry — silent swallow lies to the user |
| `routes/sessions.ts:1176` | `app/session.completed` | Drives progress/streak/billing pipeline |
| `routes/revenuecat-webhook.ts:416` | `app/payment.failed` | Billing observability — payment failure must not be silent |
| `routes/stripe-webhook.ts:342` | `app/payment.failed` | Same |

Two of those (account.ts:36, sessions.ts:1176) are currently wrapped in try/catch. The try/catch will be unwrapped so dispatch failures propagate; the comment marks the site as intentionally bare.

### Ratchet test — `apps/api/src/services/safe-non-core.guard.test.ts` (new)

Pattern follows `apps/mobile/src/lib/surface-ownership.test.ts` (AST-based, with self-check). Walks every `apps/api/src/**/*.ts` (excluding `*.test.ts`, the helper itself, and `inngest/functions/` which are the receivers, not callers). For each `CallExpression` whose callee text is `inngest.send`:

1. Walk parent chain — if it is inside a `safeSend(() => ...)` arrow body, **pass**.
2. Otherwise, scan the up-to-3 lines above the call for `// core-send: <reason>` — if present, **pass**.
3. Otherwise, **fail** with file:line and the source snippet.

Plus a self-check that creates a synthetic violation in a temp source string and asserts the scanner detects it — proves the test isn't always-green.

### Doc — CLAUDE.md "Non-Negotiable Engineering Rules"

Insert (next to the existing "Durable async work goes through Inngest" bullet):

> All non-core Inngest dispatches must go through `safeSend()` (`apps/api/src/services/safe-non-core.ts`). Bare `inngest.send(...)` is reserved for CORE flows where dispatch failure must short-circuit the user action — those sites must carry a `// core-send: <reason>` comment on the line immediately above the call. The ratchet test `safe-non-core.guard.test.ts` enforces this.

## Phase B — Route shrinking (#1), starting with `session/index.tsx`

`apps/mobile/src/app/(app)/session/index.tsx` — currently the largest route. After Phase A, count it on `origin/main` and extract:

- `_components/` for presentational pieces (header, transcript bubbles, status pill, control panel)
- `_hooks/` for the local state machine + side-effect orchestration
- `_view-models/` for derived selectors over query state

Target: <600 LOC for the route file. No functional change; tests stay co-located with extracted units. Co-located test file `session/index.test.tsx` gets split alongside.

Stretch goal: same pass on `apps/mobile/src/app/(app)/homework/camera.tsx`.

If route-shrink ends up larger than this PR can carry, split into a follow-up PR — Phase A is the priority.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Ratchet test introduces false positives on existing wrapped sites | AST walk misclassifies safeSend args | Test fails on unchanged code | Tighten the AST matcher to require the exact arrow-body shape |
| Self-check absent or trivially passes | Author copies guard test from another file without adapting | Always-green guard never catches real regressions | Synthetic-violation case is a mandatory part of the test |
| Core-send comment misused as escape hatch for new non-core sites | New contributor copies the marker without justification | Bare site lands, ratchet treats it as approved | Review checklist — every `// core-send:` PR comment requires explicit reviewer approval, and the comment itself must contain a reason (not just the marker) |
| Migration breaks an integration test that asserted on the thrown error | A test was relying on `await inngest.send` throwing | Test fails | Update the test — assertion was on incidental behaviour, not real contract |

## Verification

- Pre-commit hook runs lint-staged + `tsc --build` + `scripts/pre-commit-tests.sh` on touched files — covers per-file correctness.
- Run `pnpm exec nx run api:test` locally after Phase A is complete (covers all 187 API suites).
- Ratchet test: deliberately introduce a bare `inngest.send(...)` in a temp file, confirm the guard fails, remove the temp file.
- For Phase B: run `pnpm exec jest --findRelatedTests apps/mobile/src/app/(app)/session/index.tsx --no-coverage`.

## Rollback

Both phases are pure refactors of error-handling shape and file layout. No schema, no migration, no data. Revert the PR if anything regresses.

## Out of scope

- Inngest event-schema validation (separate concern).
- Sentry alert tuning.
- Migrating CORE sites to a durable queue / outbox pattern (separate redesign).
- The user's WIP that's currently sitting in `stash@{0}` on the main checkout — not touched by this branch.
