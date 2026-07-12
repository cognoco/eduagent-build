# Launch Health Alerts — Runbook

This is the launch-week operating view for silent failures. The MVP is alert
rules plus a responder runbook, not a new dashboard or customer-facing admin
surface.

The code-owned half is **WI-1500**: emit countable signals, define thresholds,
tests, and response steps. The production-console half is **WI-1801** through
**OPQ-27**: create the Sentry/Inngest/provider rules, route them to the named
operator channel, and prove delivery with safe test signals. Code agents must
not perform that console work.

## Privacy boundary

Alerts and notifications may contain only:

- aggregate counts and rates;
- opaque record, event, or run identifiers;
- timestamps and environment;
- provider/surface names and coarse enumerated failure reasons.

They must never contain learner prompts, transcripts, model output, drafted
notes, child or payer names, email addresses, payment details, request bodies,
or secret values. Alert notifications must show the query and aggregate result,
not forward raw Sentry event context or full Inngest payloads.

The LLM fallback signal added by WI-1500 deliberately omits prompt content,
provider error bodies, and `sessionId`. Its searchable dimensions are limited
to provider, fallback provider, capability, reason, circuit key, and flow.

## Alert summary

Thresholds use rolling windows. A threshold is evaluated only in production;
staging is used for the synthetic proof. `Warn` routes to the launch-health
channel. `Page` routes to the accountable launch operator.

| Bucket | Signals | Warn | Page |
| --- | --- | --- | --- |
| 1. Payment recovery | `app/payment.failed`; `app/billing.alert_delivery_failed`; aged `subscriptions.status=past_due` | Any payment failure, failed notification channel, or past-due row older than 24 hours | Three payment failures in 15 minutes, one billing-alert delivery failure, or any past-due row beyond its grace deadline |
| 2. LLM routing | Structured fallback logs plus `llm.stop_reason`; Sentry `surface=llm-router`, `signal=provider-fallback` | Fallback rate greater than 2% over 15 minutes with at least 20 calls | Fallback rate greater than 10% over 15 minutes with at least 20 calls, or any `primary-circuit-open` signal |
| 3. Challenge grader | Sentry `surface:challenge-round signal:finalize-failed` | One failure in 24 hours | Three failures in 1 hour |
| 4. Notification delivery | Sentry `surface:notification signal:suppressed`; `surface:email`; `surface:feedback signal:delivery-failed` | Three suppressions/bounces/retries in 1 hour | One `surface:email signal:complained` or terminal feedback-retry failure, or ten combined failures in 1 hour |
| 5. Deletion and retention | Sentry `surface:transcript-purge signal:delayed`; `surface:transcript-purge signal:function-failed`; `app/consent.revocation.failed` | Any delayed purge or retrying revocation failure | Any terminal purge or consent-revocation failure; delayed purge count at least 10 |
| 6. Stranded filing | Sentry `surface:filing` | Any filing auto-retry | Three unrecoverable filings in 1 hour |

Every bucket also has the fleet-wide terminal-failure backstop:

```text
surface:inngest-fleet signal:function-failed
```

Group that query by `functionId`. It catches terminal failures even when a
function has no bucket-specific observer; the bucket-specific tags above carry
the more useful operational meaning when both events exist. The fleet observer
copies no failed-event payload and no provider error message into Sentry.

The retention thresholds inherit the more detailed definitions in
[`retention-slo-alerts.md`](retention-slo-alerts.md). If the two runbooks appear
to conflict, the stricter threshold applies until the operator records a
deliberate change.

## 1. Payment recovery

### Meaning

`app/payment.failed` proves that Stripe or RevenueCat reported a failed renewal.
`app/billing.alert_delivery_failed` proves that the owner notification could
not be delivered on at least one channel. The latter is more urgent: the app
knows about the billing problem but the payer may not.

Past-due recovery has no separate event. Query the canonical subscription rows
for `status = 'past_due'`, their provider-updated timestamp, and grace deadline.
The warning catches a recovery that has remained unresolved for 24 hours; the
page catches any row that crosses its grace deadline without returning to an
active/free terminal state.

### First response

1. Inspect the `payment-failed-observe` and
   `billing-alert-delivery-failed-observe` Inngest runs.
2. Separate provider decline volume from a notification-delivery defect.
3. Check RevenueCat/Stripe status and the push/email provider status.
4. Confirm the owner still has the intended grace-period access.
5. Query for past-due rows older than 24 hours and verify the latest provider
   webhook was applied before attempting reconciliation.
6. Do not paste payer identifiers or payment objects into the alert channel.

### Evidence

- `apps/api/src/inngest/functions/payment-failed-observe.test.ts`
- `apps/api/src/inngest/functions/billing-alert-delivery-failed-observe.test.ts`
- `apps/api/src/services/billing/payment-failed-alert.integration.test.ts`

## 2. LLM routing

### Meaning

The router uses a secondary provider after an exhausted transient primary
failure, a pre-first-byte stream failure, an empty stream, or an open primary
circuit. A small fallback rate is expected resilience. A rising rate indicates
provider degradation, bad credentials, quota pressure, or a model-specific
failure before learners see a total outage.

Sentry filter:

```text
surface:llm-router signal:provider-fallback
```

Group by `reason`, `provider`, `fallbackProvider`, `capability`, and `flow`.
The rate rule belongs in the structured-log/Logpush query: its numerator is the
fallback warning count and its denominator is successful `llm.stop_reason`
events over the same window. Sentry supplies an absolute-count fallback rule
and the immediate `primary-circuit-open` page; do not claim that a Sentry-only
rule can calculate a denominator it does not receive. An open-circuit signal
pages immediately because the router has already crossed its
consecutive-failure threshold.

### First response

1. Group by primary provider and fallback reason.
2. Check provider status, key validity, quota, and circuit-open volume.
3. Verify the fallback provider remains healthy; do not disable the fallback
   merely to silence the alert.
4. If a prompt/schema change is implicated, run `pnpm eval:llm` before changing
   prompt code and follow the LLM-eval rules in `AGENTS.md`.
5. Use [`llm-kill-switch.md`](llm-kill-switch.md) only when its explicit
   conditions are met.

### Evidence

- `apps/api/src/services/llm/router.test.ts` covers exhausted-retry,
  open-circuit, pre-first-byte, and empty-stream fallback signals.
- The tests assert that learner text and session identifiers are absent from
  the Sentry call.

## 3. Challenge grader

### Meaning

`app/challenge-round.finalize.failed` means the server released the finalize
claim for retry after the mastery/deepening write failed. One isolated failure
is recoverable; repeated failures mean Challenge outcomes are not being
persisted reliably.

Sentry filter:

```text
surface:challenge-round signal:finalize-failed
```

### First response

1. Inspect `challenge-round-finalize-failed` runs and group by coarse error
   class without forwarding raw event bodies.
2. Check database availability and the mastery/deepening transaction path.
3. Confirm the claim returned to `drafting` so a later exchange can retry.
4. Escalate before manually changing mastery state.

### Evidence

- `apps/api/src/inngest/functions/challenge-round-finalize-failed.test.ts`
- `apps/api/src/services/session/session-exchange-challenge-finalize.test.ts`

## 4. Notification delivery

### Meaning

This bucket joins failures that otherwise appear in separate providers:

- `app/notification.suppressed` — dedupe/preference lookup failed and a reminder
  was suppressed safely;
- `app/email.bounced` — Resend reported a bounce or complaint;
- `app/feedback.delivery_failed` — support feedback email required a durable
  retry.

One complaint pages immediately. A bounce or suppression spike usually means a
provider, address-quality, or notification-log problem.

Sentry filters:

```text
surface:notification signal:suppressed
surface:email signal:bounced
surface:email signal:complained
surface:feedback signal:delivery-failed
```

### First response

1. Split complaints, bounces, suppressions, and retry failures.
2. For complaints, suppress further email to the affected masked destination
   and inspect the sending campaign/type.
3. For suppressions, check the notification-log database path before replaying.
4. For feedback retries, inspect `feedback-delivery-failed`; the free text stays
   in the first-party retry row and must not be copied into the alert.

### Evidence

- `apps/api/src/inngest/functions/notification-suppressed-observe.test.ts`
- `apps/api/src/inngest/functions/email-bounced-observe.test.ts`
- `apps/api/src/inngest/functions/feedback-delivery-failed.test.ts`

## 5. Deletion and retention

### Meaning

Retention is successful only when purges and consent-driven deletion complete.
Retrying errors warn; terminal errors page. Delayed and terminal transcript
purges are filterable by real Sentry tags. Consent revocation terminal failures
emit `app/consent.revocation.failed`.

Sentry filters:

```text
surface:transcript-purge signal:delayed
surface:transcript-purge signal:function-failed
```

### First response

1. Follow [`retention-slo-alerts.md`](retention-slo-alerts.md) for transcript
   purge and delayed-session diagnosis.
2. For consent revocation, inspect the failed Inngest run and confirm whether
   archival, ownership transfer, or dependent-row cleanup failed.
3. Never mark a purge or revocation complete based only on event delivery;
   verify the database outcome through the scoped service path.
4. Do not enable or change retention clocks from this runbook. Those values and
   the production purge flag remain counsel/operator actions.

### Evidence

- `apps/api/src/inngest/functions/transcript-purge-observe.test.ts`
- `apps/api/src/inngest/functions/consent-revocation.test.ts`

## 6. Stranded filing

### Meaning

The old `app/ask.gate_decision` and `app/ask.gate_timeout` surfaces were removed
with the superseded session-depth gate and must not be used in alert rules. A
filing auto-retry or unrecoverable resolution means an ended learning session
did not reach its expected Library destination on the primary path.

Sentry filters:

```text
surface:filing signal:auto-retry-attempted
surface:filing signal:resolved resolution:unrecoverable
surface:filing signal:unrecoverable
```

### First response

1. Compare filing retry/unrecoverable volume with the previous 24-hour baseline
   and group only by the tagged coarse outcome.
2. For `app/session.filing_timed_out`, inspect the recovery attempt and the
   eventual `app/session.filing_resolved` event before replaying.
3. Do not inspect or post learner reasoning text; the observer intentionally
   records only reason presence/length.

### Evidence

- `apps/api/src/inngest/functions/filing-observe.test.ts`
- `apps/api/src/inngest/functions/filing-timed-out-observe.test.ts`
- `apps/api/src/inngest/functions/filing-stranded-backfill.test.ts`

## Manual configuration and proof

WI-1801 / OPQ-27 owns the production-console work after this code and runbook
land. For every rule, the operator records:

1. console/dashboard link and environment;
2. exact query, rolling window, warn threshold, and page threshold;
3. accountable recipient and routing destination;
4. a safe staging synthetic/test timestamp and provider/run identifier;
5. observed alert delivery result;
6. confirmation that the notification contains no forbidden payload fields.

Threshold tuning after launch must preserve the six buckets and record why a
rule changed. Disabling a noisy rule without a replacement signal is not an
acceptable resolution.
