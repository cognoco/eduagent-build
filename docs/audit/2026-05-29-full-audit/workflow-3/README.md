# Workflow-3 Audit — `inngest.send()` core-send Compliance Sweep

> Generated 2026-05-30 by the `inngest-coresend-compliance-sweep` workflow (9 subagents, classify→adversarial-verify pipeline over 6 file-shards). **Read-only audit — no source files were modified.**

## What this audits

CLAUDE.md § *Non-Negotiable Engineering Rules* requires non-core Inngest dispatches (telemetry, post-success notifications, observability) to go through `safeSend()` so a dispatch failure is captured in Sentry but never breaks the user action. Bare `inngest.send(...)` is reserved for CORE flows where dispatch failure **must** short-circuit the user action, and those sites must carry a `// core-send: <reason>` comment.

The forward-only ratchet `safe-non-core.guard.test.ts` already enforces this **syntactically** — it classifies every site as `safesend` / `core-send` / `try-catch` / `bare` and fails CI on `bare`. This audit is the **semantic** complement the ratchet cannot do: *does each site’s chosen handling actually match the dispatch’s true criticality?* It targets two failure modes the syntactic check is blind to:

- **`mislabeled-core-send`** — a non-core dispatch annotated `// core-send`, so a transient failure throws and needlessly breaks a user action.
- **`hidden-core-safesend`** — a genuinely critical dispatch wrapped in `safeSend`, so failure is swallowed and the user action falsely reports success.

**Scope:** all 52 `inngest.send(` grep hits in `apps/api/src` (non-test), across 24 files. Imperative non-Inngest side-effects are out of scope.

## Headline numbers

| Metric | Count |
|---|---:|
| Grep hits examined | 50 |
| — comment/string mentions (not real calls) | 2 |
| **Real dispatch sites** | **48** |
| Correctly handled (`ok`) | 46 |
| **Confirmed issues** | **2** (2 high) |

Handling distribution across the 48 real dispatches: `safesend` 38, `try-catch` 5, `core-send` 5.

Issue breakdown: `mislabeled-core-send` 1, `hidden-core-safesend` 1. Both were upheld by the independent verifier.

## Confirmed issues (both HIGH, verifier-confirmed)

### 1. `services/billing/revenuecat-webhook-handler.ts:446` — `mislabeled-core-send`

- **Event:** `app/payment.failed`
- **Current handling:** `core-send`  ·  **True criticality:** `non-core`
- **Why it is wrong:** The `// core-send:` comment on line 444–445 gives exclusively observability justifications ('billing observability cannot be silent', 'swallowed dispatch leaves the failed payment unobserved by alerting'). The sole listener for `app/payment.failed` is `payment-failed-observe.ts`, which performs only structured logging via `logger.error` and returns `{ status: 'logged' }` — no dunning, no access revocation, no user-facing state change. Contrast with the Stripe counterpart (stripe-webhook-handler.ts:514-517), whose `// core-send:` comment explicitly states the webhook-retry rationale ('dispatch failure throws to the Stripe webhook handler, which then returns non-2xx → Stripe retries the webhook') — that rationale is absent from the RevenueCat comment. Additionally, the Inngest idempotency key `revenuecat-payment-failed:${event.id}` means that if a 500 caused RevenueCat to retry and the Inngest outage had cleared, the re-dispatch would be a Inngest no-op — weakening the retry argument further. The sibling dispatch at line 518 in the same function (`app/billing.alias_received`) correctly uses `safeSend`, making the inconsistency within the same function concrete evidence of mislabeling. Using bare `inngest.send` here means a transient Inngest outage propagates as a 500 to RevenueCat, potentially triggering a re-delivery that re-processes the `past_due` status update unnecessarily, while `safeSend` would return 200 and still capture the missed dispatch in Sentry.
- **Recommended fix:** Replace the bare `inngest.send` with `safeSend(() => inngest.send({ id: `revenuecat-payment-failed:${event.id}`, name: 'app/payment.failed', data: { subscriptionId: updated.id, accountId: updated.accountId, source: 'revenuecat', timestamp: new Date().toISOString() } }), 'billing.payment_failed', { eventId: event.id, accountId: updated.accountId })` and remove the `// core-send:` comment. If the intent is truly to leverage webhook retry-on-dispatch-failure (to mirror the Stripe pattern), the comment must state that explicitly, and a test should verify the route returns non-2xx when the dispatch throws. Given the idempotency key already deduplicates on `event.id`, the retry argument is weaker here than for Stripe, so `safeSend` is the correct call.

### 2. `services/subject.ts:161` — `hidden-core-safesend`

- **Event:** `app/subject.curriculum-retry-requested`
- **Current handling:** `safesend`  ·  **True criticality:** `core`
- **Why it is wrong:** The `retryCurriculumForSubject` function increments `dispatched++` immediately after awaiting `dispatchCurriculumRetry`. Because `dispatchCurriculumRetry` wraps the send in `safeSend`, any dispatch failure (Inngest unreachable, 2s timeout) is silently swallowed and `safeSend` returns `void`. The `dispatched++` executes regardless, so the endpoint returns `{ dispatched: N }` with HTTP 200 even when zero jobs were actually enqueued. The route test at subjects.test.ts line 409 (`mockRejectedValue(new Error('inngest down'))` → expects HTTP 500) documents the intended failure contract, but that test only reaches 500 because the mock rejects at the service boundary — in production, `safeSend` absorbs the Inngest error before it can escape `dispatchCurriculumRetry`. The dispatch is the entirety of this endpoint's side-effect; there is no other write or state change that constitutes success.
- **Recommended fix:** Remove `safeSend` from `dispatchCurriculumRetry` and replace with a bare `await inngest.send({...})`. Add a `// core-send: user-initiated curriculum retry — dispatch failure must propagate so the endpoint returns 500 rather than falsely reporting enqueued jobs` comment on the line immediately above the call. This ensures `retryCurriculumForSubject` throws when Inngest is unavailable, the route handler's `throw err` re-raises it as a 500, and `dispatched` is only incremented when the job is genuinely enqueued.

## Full dispatch inventory

See [`inventory.md`](./inventory.md) for all 48 real dispatch sites with event name, handling, criticality, and verdict. Machine-readable full dataset (including the per-site reasoning for every `ok` site) in [`findings.json`](./findings.json).

## How to act on this

1. The two issues are independent one-line-ish fixes in separate files — each warrants its own small PR with the regression test the verifier described:
   - `revenuecat-webhook-handler.ts:446` → switch to `safeSend`, drop the `// core-send` comment. (Mirror the working `safeSend` sibling at line 518 in the same function.)
   - `subject.ts:161` → drop `safeSend` from `dispatchCurriculumRetry`, make it a bare `await inngest.send(...)` with a `// core-send:` comment, so the retry endpoint returns 500 instead of a false `{dispatched:N}` 200.
2. Per CLAUDE.md § *Security fixes require a break test* / *Silent recovery without escalation*: the curriculum-retry fix is a silent-success bug — add a negative-path test asserting the endpoint returns non-2xx when the dispatch throws (the existing `subjects.test.ts:409` only passes because the mock rejects at the service boundary, which `safeSend` would absorb in production).
3. The other 46 sites are semantically sound — no action.

## Method & caveats

- Two-stage pipeline: a *classifier* per shard read each dispatch and its enclosing action; an independent *verifier* re-opened only the flagged mismatches with a default-reject bias. Both stages ran on `sonnet`.
- Criticality is a semantic judgment about whether a user action is correct when an event is lost. The reasoning is recorded per-site in `findings.json` so each call can be independently checked.
- The syntactic ratchet (`safe-non-core.guard.test.ts`) remains the CI gate; this audit does not replace it.

