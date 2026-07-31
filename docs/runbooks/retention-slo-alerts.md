# Retention SLO Alerts — Runbook

> **Note:** Dashboard configuration (Inngest alert rules, Sentry alert rules) must be manually configured — see thresholds below. The code-side instrumentation (event emission + `captureException`) is complete as of this runbook.

## Alert Summary Table

| Bug ID | Inngest Event | Warn Threshold | Page Threshold | Surface |
|--------|--------------|---------------|----------------|---------|
| BUG-991 | `app/session.summary.failed` | >0.5% rate (24 h) | >3% rate (24 h) | Inngest dashboard + Sentry |
| BUG-992 | `app/session.transcript.purged` | >2% failure rate (24 h) | >5% failure rate (24 h) | Inngest dashboard + Sentry |
| BUG-993 | `app/session.purge.delayed` | count ≥ 1 | count ≥ 10 | Inngest dashboard + Sentry |
| BUG-994 | `app/summary.reconciliation.requeued` | count ≥ 1 | count ≥ 10 | Inngest dashboard |
| WI-2739 | `app/session.purge.backlog` | any event (eligible volume >100) | event on 2 consecutive daily runs | Inngest dashboard + Sentry |

---

## BUG-991 — `app/session.summary.failed` rate

### What the alert means

The LLM summary pipeline failed to generate an `llmSummary` for a completed session. This event fires from two places:

- `session-completed.ts` — `generate-llm-summary` step: fired when `generateAndStoreLlmSummary` returns null or throws.
- `summary-regenerate.ts` — `sessionSummaryCreate` / `sessionSummaryRegenerate` handlers: fired when reconciliation-cron retries also fail.

A sustained rate above 0.5% means learners are accumulating sessions without summaries. Those sessions become candidates for `app/session.purge.delayed` after 37 days (BUG-993).

### Likely root causes

1. LLM provider (OpenAI) returning errors or timeouts.
2. Session transcript is empty or malformed — `generateAndStoreLlmSummary` has no content to summarize.
3. Prompt schema mismatch — LLM returned output that failed `parseEnvelope()`.

### First responder steps

1. Check Sentry for `captureException` entries tagged `surface: session-completed` and `step: generate-llm-summary`.
2. Check Inngest dashboard for `app/session.summary.failed` event volume trend.
3. If LLM provider: check OpenAI status page.
4. If prompt mismatch: run `pnpm eval:llm` to compare current snapshot vs baseline.
5. Affected sessions can be requeued via `summaryReconciliationCron` (runs daily at 04:00 UTC, or trigger manually via Inngest dashboard).

---

## BUG-992 — `app/session.transcript.purged` failure rate

### What the alert means

The transcript purge worker (`transcript-purge-handler`) failed after exhausting all 3 Inngest retries. Failures are captured in two ways:

- Per-attempt: `captureException` inside `step.run('purge-transcript')` on each retry — tagged `surface: transcript-purge`.
- Terminal: `transcriptPurgeHandlerOnFailure` fires on `inngest/function.failed` after all retries exhausted — tagged `surface: transcript-purge` and `signal: function-failed`. This is the signal used for the failure-rate SLO.

The failure rate is computed as: `app/session.transcript.purge` events dispatched minus `app/session.transcript.purged` success events.

### Likely root causes

1. Voyage AI embedding API unavailable — purge requires replacing embedding rows.
2. Database write failure on `session_summaries.purged_at` update.
3. `sessionSummaryId` mismatch — summary row deleted or profileId scope mismatch.

### First responder steps

1. Check Sentry for entries tagged `surface: transcript-purge` and `signal: function-failed`.
2. Check Voyage AI status (API key rotation, quota exhaustion).
3. Failed sessions remain eligible for later daily purge runs because `summaryGeneratedAt` stays past the 30-day cutoff. A backlog above the 100-record dispatch cap can defer re-dispatch, so next-day pickup is not guaranteed.
4. If Voyage AI is down for an extended period, temporarily set `RETENTION_PURGE_ENABLED=false` in Doppler to halt the queue.

There is no fixed worst-case deletion latency while Voyage remains unavailable: transcript rows stay intact until summary-only embedding regeneration succeeds. Treat a continuing failure-rate alert as a retention incident, not as an implicit extension of the 30-day policy clock.

---

## BUG-993 — `app/session.purge.delayed` count

### What the alert means

Sessions have crossed the 37-day threshold (day-37) but still have a null `summaryGeneratedAt`, lack `llmSummary`, or lack `learnerRecap`. These cannot be purged because the preconditions for safe purge are missing. The `delayedCount` field combines the complete null-timestamp count with a bounded sample of other incomplete rows; `nullSummaryGeneratedAtCount` is the complete null-timestamp subset, while `sessionIds` remains a bounded responder sample.

This event fires from `transcript-purge-cron.ts` daily at 05:00 UTC. `captureException` is also called so the count is queryable in Sentry.

A count ≥ 1 warrants investigation; ≥ 10 means the reconciliation cron (`summaryReconciliationCron`, 04:00 UTC) is not keeping up with session volume.

### Likely root causes

1. `summaryReconciliationCron` failing silently — check BUG-994 for its requeue count.
2. Sessions ended without sufficient transcript content for LLM summary (e.g., immediate close, zero exchanges), or summary generation never completed and left `summaryGeneratedAt` null.
3. Reconciliation cron's 37-day window matches the delayed threshold exactly — if summary generation is consistently slow, increase the reconciliation retry window.

### First responder steps

1. Check Inngest for `app/session.purge.delayed` event payload — inspect `sessionIds` field.
2. Check Sentry for entries tagged `surface: transcript-purge` and `signal: delayed`.
3. For each delayed session, query `session_summaries` by `sessionId` to confirm which of `summaryGeneratedAt`, `llmSummary`, or `learnerRecap` is null.
4. Never stamp `purgedAt` manually: that would bypass summary-only embedding regeneration and the atomic transcript delete. Null-timestamp rows within the normal reconciliation window are requeued there; after day 37 the purge cron reports the complete null-timestamp count and durably fans out `app/session.summary.regenerate` for a bounded page. That page rotates daily so persistently failing rows cannot permanently hide the remainder. Trigger the event directly only for urgent recovery.
5. For a missing recap, trigger `app/session.learner-recap.regenerate`.

---

## WI-2739 — transcript purge backlog: `app/session.purge.backlog`

### What the alert means

The daily purge selector found at least 101 eligible records while the cron can dispatch 100. The signal reports a lower bound (`minimumEligibleCount`) rather than pretending the one-row sentinel is an exact count. It fires on every daily run that remains over capacity, so consecutive events prove a sustained backlog.

### First responder steps

1. Correlate with `app/session.transcript.purged` terminal failures and Voyage status; failed workers reduce effective daily capacity.
2. Compare consecutive daily events. One event warns that at least one record was deferred; two consecutive events page because input or failures are sustaining the backlog.
3. Do not raise `PURGE_LIMIT` blindly. Confirm Inngest concurrency, Voyage quota, and database latency first, then ship a reviewed capacity change if required.

---

## BUG-994 — `app/summary.reconciliation.requeued` count

### What the alert means

The `summaryReconciliationCron` (runs daily at 04:00 UTC) found sessions in the 37-day window that are missing summary data and requeued them for generation. A count ≥ 1 means the post-session pipeline missed at least one session.

The event is emitted only when `totalRequeued > 0` (no noise when everything is healthy). Counts ≥ 10 per day indicate a systematic post-session pipeline failure.

The payload breaks down the requeued count by query:
- `queryARequeued`: sessions with no `session_summaries` row at all.
- `queryBRequeued`: sessions with a row but missing `llmSummary` or `summaryGeneratedAt`.
- `queryCRequeued`: sessions with `llmSummary` but missing `learnerRecap`.

### Likely root causes

1. `session-completed` Inngest function failed on the `write-coaching-card` step (creates the `session_summaries` row) — check `queryARequeued`.
2. LLM summary generation failed during `session-completed` — check `queryBRequeued` and BUG-991 rate simultaneously.
3. `generate-learner-recap` failed — check `queryCRequeued`.

### First responder steps

1. Check Inngest for `app/summary.reconciliation.requeued` event — inspect `queryARequeued`, `queryBRequeued`, `queryCRequeued`.
2. Correlate with `app/session.summary.failed` rate (BUG-991). If both are elevated, the LLM provider is the likely cause.
3. If only `queryARequeued` is high: check `app/session.completed_with_errors` for `write-coaching-card` failures.
4. The reconciliation cron will retry tomorrow automatically. For urgent recovery, trigger `app/session.summary.create` or `app/session.summary.regenerate` directly via Inngest for the affected sessions.

---

## Manual Dashboard Configuration Required

The following alert rules must be configured manually — code instrumentation is complete but dashboard rules cannot be created by code agents:

### Inngest Dashboard Alert Rules

| Event | Metric | Warn | Page |
|-------|--------|------|------|
| `app/session.summary.failed` | Event rate vs `app/session.completed` (24 h) | >0.5% | >3% |
| `app/session.transcript.purged` | Failure rate: purge dispatched minus purged success (24 h) | >2% | >5% |
| `app/session.purge.delayed` | `delayedCount` field sum (24 h) | ≥1 | ≥10 |
| `app/summary.reconciliation.requeued` | `totalRequeued` field sum (24 h) | ≥1 | ≥10 |
| `app/session.purge.backlog` | Any event (`minimumEligibleCount` ≥101) | ≥1 event | event on 2 consecutive daily runs |

### Sentry Alert Rules

- Alert on any `captureException` tagged `surface: transcript-purge` and `signal: function-failed` (BUG-992 terminal failure).
- Alert on any `captureException` tagged `surface: transcript-purge` and `signal: delayed` with `delayedCount >= 10` (BUG-993 page threshold).
- Alert on `captureException` tagged `surface: transcript-purge` and `signal: backlog`; page when it appears on 2 consecutive daily runs.
- Alert on rate of `captureException` tagged `surface: session-completed` + `step: generate-llm-summary` exceeding 3% of sessions (BUG-991 page threshold).
