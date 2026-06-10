# Error Handling & Observability Audit

> **Pruned 2026-06-10** — findings verified FIXED against `new-llm` HEAD were removed in this pass; only still-live findings remain below. Full original review is in git history.

**Lens:** Error handling & observability  
**Scope:** `apps/api/src/**`, `apps/mobile/src/**`  
**Date:** 2026-06-09  
**Reviewer:** codebase-atlas agent (read-only)

---

## Summary

The codebase has strong observability infrastructure: a typed Sentry wrapper (`apps/api/src/services/sentry.ts`, `apps/mobile/src/lib/sentry.ts`), a structured JSON logger (`apps/api/src/services/logger.ts`), `safeSend()`/`safeWrite()` for non-core Inngest dispatches, `safeRefundQuota()` for billing refunds, a global `QueryCache.onError` on the mobile client, and age-gated Sentry enabling. The webhook handlers (RevenueCat, Stripe, Resend), Inngest functions, and most route middleware use this infrastructure correctly.

However, six specific sites violate the CLAUDE.md rule "silent recovery without escalation is banned in billing/auth/webhook code": push notification HTTP errors, email (Resend) HTTP errors, billing metering errors, and mobile RevenueCat identity exhaustion are all unobservable in Sentry today. Two additional gaps (env-validation and mobile mutation errors) degrade operational visibility without being billing/auth hotspots.

---

## Critical Findings

### C-3 — MeteringError from quota decrement returns 500 with no Sentry capture
**File:** `apps/api/src/middleware/metering.ts:748-751`

```ts
try {
  decrement = await decrementQuota(db, subscriptionId, profileId);
} catch (err) {
  if (err instanceof MeteringError) {
    return c.json({ error: err.code, meta: err.meta }, 500);
  }
  throw err;
}
```

`MeteringError` is the billing-infrastructure error class. When `decrementQuota` throws it (DB constraint violation, unexpected quota state, internal assertion failure), the middleware returns a 500 to the client but calls neither `logger.error` nor `captureException`. The error is consumed silently. `MeteringError` instances that reach this branch indicate a broken billing state — they are exactly the class of error that must be observable in Sentry per the CLAUDE.md billing rule.

The global `onError` at `apps/api/src/index.ts:479-500` only fires for uncaught throws. Because this branch catches and returns a response, the global handler never sees it.

**Impact:** Billing infrastructure failures generate 500 responses with no observable signal. On-call cannot be alerted. Violates "silent recovery without escalation is banned" in billing code.

**Fix direction:** Add `logger.error('[metering] decrementQuota MeteringError', { event: 'metering.decrement.metering_error', code: err.code, profileId, ... })` and `captureException(err, { profileId, tags: { surface: 'metering', code: err.code } })` before the return.

---

## High Findings

### H-1 — Env validation failure: logger only, no Sentry capture
**File:** `apps/api/src/middleware/env-validation.ts:74-82`

```ts
} catch (err) {
  const message = err instanceof Error ? err.message : 'Environment validation failed';
  logger.error('[env-validation]', { message });
  return c.json({ code: 'ENV_VALIDATION_ERROR', message }, 500);
}
```

A misconfigured Worker deployment (missing required env var, wrong type) logs to the structured logger but never calls `captureException`. In a Cloudflare Workers runtime, `logger.error` routes to `console.error` which feeds Cloudflare logs but not Sentry. An operator deploying a bad config will get 500s on every request with no Sentry alert. Given that env validation failure affects every request on the worker, this is an operational blind spot. The binding-gate failure path at line 89-100 has the same gap.

**Impact:** Misconfigured deployments generate no Sentry alert. Operational incident triage is blind.

**Fix direction:** Add `captureException(err instanceof Error ? err : new Error(message), { tags: { surface: 'env_validation' } })` after `logger.error`.

---

### H-3 — No MutationCache.onError — mobile mutation failures not globally reported
**File:** `apps/mobile/src/app/_layout.tsx:81-94`

```ts
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => { ... Sentry.captureException(error) },
  }),
  // No MutationCache
});
```

The global `QueryCache.onError` catches query failures. There is no corresponding `MutationCache({ onError: ... })`. Mutation failures that are not individually caught by `onError`/`onSettled` handlers in `useMutation` calls — including those invoked via the OutboxDrainProvider or fire-and-forget mutations in quiz/session flows — silently fail without global Sentry coverage. TanStack Query v5 does not automatically route mutation errors through `QueryCache.onError`.

**Impact:** Mutation errors (writes to the API) are not globally observed. A screen that fails to handle `mutation.error` produces a silent failure with no Sentry event.

**Fix direction:** Add `mutationCache: new MutationCache({ onError: (error) => { if (shouldReportQueryErrorToSentry(error)) Sentry.captureException(error, { tags: { surface: 'mutation' } }); } })` to the `QueryClient` constructor alongside the existing `queryCache`.

---

## Medium Findings

### M-1 — SSE primary error path: no captureException when onError is absent
**File:** `apps/api/src/route-utils/sse-utf8.ts:66-88`

When `cb` throws and no `onError` callback was provided, the code falls through to `emitJsonErrorFrame(stream)` without calling `captureException`. The double-fault path (line 72-84) correctly captures via Sentry. Only the primary-error-no-onError path is invisible. Most SSE callers (`session.ts`, `exchange.ts`) do pass an `onError`, so this gap is limited to callers that omit it — but those callers get silent SSE stream errors in Sentry.

**Fix direction:** Add `captureException(error, { extra: { context: 'sse-utf8.primary.no-onError-handler' } })` in the `if (onError)` else branch before `emitJsonErrorFrame`.

---

### M-2 — assessments.ts recordAssessmentCompletionActivity: captureException without logger.error
**File:** `apps/api/src/routes/assessments.ts:277-287`

```ts
} catch (err) {
  captureException(err, {
    profileId,
    requestPath: '/v1/assessments/:assessmentId/answer',
    extra: { assessmentId, topicId: assessment.topicId, status: newStatus },
  });
}
```

Sentry is called but there is no `logger.error` call. The structured logger feeds Cloudflare's log drain; a Sentry-only capture is invisible in the log stream. Operators who use log-based alerting (searching Cloudflare logs for `"level":"error"`) will miss this failure class.

**Fix direction:** Add `logger.error('[assessments] recordAssessmentCompletionActivity failed', { event: 'assessments.completion_activity.error', profileId, assessmentId })` before the `captureException` call.

---

### M-3 — trial-expiry-failure-observe: retryDeferred sentinel with no retry implementation
**File:** `apps/api/src/inngest/functions/trial-expiry-failure-observe.ts:48`

```ts
return {
  status: 'logged' as const,
  ...
  retryDeferred: 'pending_trial_expiry_retry_strategy',
};
```

The comment at line 13 explicitly acknowledges that retry is deferred, and the `retryDeferred` field signals this. However the field name uses a string literal that is neither an Inngest event nor a constant — it is not queryable. Failed trial expirations are logged but never retried, and there is no mechanism to alert if the `billing.trial_expiry_failed` event queue grows. The comment says "structured log is enough to make the failure stream observable today" — that is true only if someone actively monitors for this log event in Cloudflare logs or Sentry.

**Impact:** Stuck trials accumulate without automated recovery. No alert on volume spikes.

**Fix direction (deferred):** Wire a `captureMessage` with `level: 'error'` in this handler if the `trialId` count in a window exceeds a threshold, or add a periodic Inngest cron that scans `pending_trial_expiry` and re-emits. Track as a known deferred item.

---

### M-4 — Quiz play.tsx: bare captureException without diagnostic context
**File:** `apps/mobile/src/app/(app)/quiz/play.tsx:254, 340, 588` (approximate lines from audit)

Multiple `Sentry.captureException(err)` calls with no `tags`, `extra`, or `level` context. During triage, Sentry groups all three error types under a single fingerprint unless the error class differs. The session-flow context (quizId, topicId, exchange index, crash location) that `SessionErrorBoundary` correctly adds is absent from these inline captures.

**Fix direction:** Pass `{ tags: { screen: 'quiz_play', crashLocation: '<function name>' }, extra: { topicId, quizId } }` to each `captureException` call.

---

## Low Findings

### L-1 — transient-db-retry.ts: final throw not self-captured by the wrapper
**File:** `apps/api/src/services/transient-db-retry.ts:84-95`

The retry wrapper adds an `addBreadcrumb` on each retry attempt and throws the final error after exhaustion. The wrapper itself does not call `captureException` — it expects callers to capture. Most callers propagate the throw to the global `onError` handler which does capture. However, callers that catch the throw and return a custom response (e.g., returning an empty array on DB error) would lose the capture entirely. Low risk given current usage but worth noting.

---

## Confirmed-Good Patterns (for reference)

The following were audited and found correctly implemented:

- `apps/api/src/index.ts:479-500` — Global `onError` captures all unhandled exceptions with userId/profileId/requestPath context.
- `apps/api/src/middleware/auth.ts:163-216` — JWT infra failures → captureException + 503; token-validation failures → structured warn (intentional, quota management).
- `apps/api/src/middleware/profile-scope.ts:135-162` — Auto-resolve failure → captureException + sentinel + fail-closed 503.
- `apps/api/src/services/safe-non-core.ts` — `safeSend()`/`safeWrite()` with captureException + logger on failure.
- `apps/api/src/services/billing/metering.ts:safeRefundQuota()` — captureException on failure, never throws.
- `apps/api/src/routes/revenuecat-webhook.ts` — Malformed JSON + captureException; SANDBOX guard; idempotency.
- `apps/api/src/services/billing/stripe-webhook-handler.ts` — `escalateSubscriptionNotFound()` logs + captures; unmapped status captured.
- `apps/api/src/inngest/functions/trial-expiry.ts` — Per-trial errors: captureException + `safeSend` to failure-observe event.
- `apps/api/src/inngest/functions/session-completed.ts` — `runNonCritical()` (swallowed + Sentry) vs `runCritical()` (throws for retry) distinction correct.
- `apps/mobile/src/app/_layout.tsx:81-94` — `QueryCache.onError` → Sentry with `shouldReportQueryErrorToSentry` filter.
- `apps/mobile/src/components/common/ErrorBoundary.tsx` — `componentDidCatch` → captureException with componentStack.
- `apps/mobile/src/app/(app)/session/_components/SessionErrorBoundary.tsx` — Session crash → captureException with screen/crashLocation tags.
- `apps/mobile/src/providers/OutboxDrainProvider.tsx` — Replay + escalate failures → captureException.
- `apps/mobile/src/lib/sign-out.ts` — `ClerkSignOutTimeoutError` → captureMessage on timeout.
- `apps/api/src/services/clerk-user.ts:deleteClerkUser` — Non-2xx + network error both throw + capture.

---

## Finding Index

| ID  | Severity | File | Lines | Rule Violated |
|-----|----------|------|-------|---------------|
| C-3 | Critical | `apps/api/src/middleware/metering.ts` | 748-751 | Silent recovery in billing code |
| H-1 | High | `apps/api/src/middleware/env-validation.ts` | 74-82 | Missing captureException on operational failure |
| H-3 | High | `apps/mobile/src/app/_layout.tsx` | 81-94 | No MutationCache.onError global handler |
| M-1 | Medium | `apps/api/src/route-utils/sse-utf8.ts` | 66-88 | SSE primary error no-onError path invisible |
| M-2 | Medium | `apps/api/src/routes/assessments.ts` | 277-287 | captureException without logger.error |
| M-3 | Medium | `apps/api/src/inngest/functions/trial-expiry-failure-observe.ts` | 48 | Deferred retry with no actionability |
| M-4 | Medium | `apps/mobile/src/app/(app)/quiz/play.tsx` | 254, 340, 588 | Bare captureException without context |
| L-1 | Low | `apps/api/src/services/transient-db-retry.ts` | 84-95 | Final throw not self-captured by wrapper |
