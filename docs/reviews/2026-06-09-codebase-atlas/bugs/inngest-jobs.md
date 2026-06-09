# Background jobs & Inngest — Bug Review

Lens: durable async correctness, `safeSend` vs bare core `inngest.send` discipline, step idempotency, retry/backoff, dead-letter/stranded handling, fire-and-forget from route handlers, missing hard caps on signal-driven flows.

Scope walked exhaustively: all 58 Inngest function files under `apps/api/src/inngest/functions/`, the client/helpers/index infrastructure, the two ratchet guards (`safe-non-core.guard.test.ts`, `orphan-dispatcher.guard.test.ts`), `services/safe-non-core.ts`, and every `inngest.send` / `core-send:` dispatch site across `apps/api/src/` (routes, services, middleware).

**Overall assessment:** This is an unusually well-hardened Inngest layer. Idempotency keys, per-key concurrency caps, replay-safe `step.run` memoization, silent-recovery escalation (Sentry + queryable events), cursor-based pagination with termination ceilings, and two AST ratchet guards (bare-send + orphan-dispatch) are all present and consistently applied. Findings below are concentrated in a small number of real defects plus several lower-severity hardening gaps. No Critical data-loss bugs were found.

---

## High

### [High] `step.sendEvent` nested inside a `step.run` callback — illegal Inngest step nesting that throws at runtime
- File: `apps/api/src/inngest/functions/filing-timed-out-observe.ts:275-322` (the `step.run('emit-resolved-recovered-after-window', ...)` wrapper) with the offending nested call at `:303` (`step.sendEvent('emit-resolved-recovered-after-window', ...)`).
- What: The `[H-2]` fix wraps a Zod parse + dispatch in `step.run(...)` to contain a parse error. But inside that `step.run` callback it calls `step.sendEvent(...)`. Inngest's step tooling (`step.run`, `step.sendEvent`, `step.sleep`, `step.waitForEvent`) must run at the top level of the function body — invoking a step tool **inside another step's callback** is not supported and the executor raises a nesting/`StepError` on the real runtime. Compounding it, the inner `step.sendEvent` reuses the *same id* (`'emit-resolved-recovered-after-window'`) as the wrapping `step.run`, which would also collide if it were ever hoisted.
- Why this is masked: the unit test (`filing-timed-out-observe.test.ts:571-616`) uses a hand-rolled mock `step` harness where `step.run` simply invokes an override callback and `step.sendEvent` is a plain mock; the harness does **not** model Inngest's "no step tools inside `step.run`" constraint, so the test passes while production would throw. This is a "test does not reflect reality" gap (CLAUDE.md "Tests Must Reflect Reality").
- Impact: When the CAS-no-op `recovered_after_window` branch is hit (retry succeeds after the 60s `waitForEvent` window closes — a real, observed race the code explicitly handles), the function run throws instead of emitting `app/session.filing_resolved`. Because the throw escapes after `mark-failed` already returned 0 rows, every Inngest retry re-enters the same branch and throws again until retries exhaust, leaving the resolution event un-emitted and the run marked failed. The session row's `filing_recovered` state is correct, but the observability terminus (`filing_resolved` / `recovered_after_window`) never fires, so ops dashboards undercount recoveries and the run shows as a hard failure.
- Fix direction: Hoist the parse + `sendEvent` to the top level. Do the DB re-read in one `step.run` that returns `{ shouldEmit, reason }`; then, outside that step, do `if (shouldEmit) await step.sendEvent('emit-recovered-after-window', {...})` at the function body level. Wrap the `filingResolvedEventSchema.parse` either before the `sendEvent` at top level (a parse throw there is fine — it's deterministic and Inngest will retry the whole function, but since the payload is fixed it cannot loop forever) or compute/validate the payload inside the re-read step and return it. Separately, update the test harness so a `step.sendEvent` invoked from within a `step.run` override fails the test, mirroring the real executor constraint.

---

## Medium

### [Medium] `account-deletion` has no `onFailure` — a terminally-failed run can leave the Clerk login identity alive with no escalation event
- File: `apps/api/src/inngest/functions/account-deletion.ts:11-100`.
- What: `scheduledDeletion` carries `retries: 5` and erases the external Clerk identity in `step.run('delete-clerk-user', ...)` (`:89-96`). The header comment claims "A throw here … makes Inngest retry the step and ultimately page via Sentry." But there is **no** `onFailure` handler and no terminal-failure event. If all 5 retries of the Clerk-erasure step are exhausted (e.g. sustained Clerk API outage, persistent non-404 5xx, missing `CLERK_SECRET_KEY`), the DB cascade has already run (`delete-account-data` at `:72`) but the Clerk login identity survives, and the only signal is a generic Inngest function failure — not a queryable, GDPR-relevant terminal event. Sibling durable jobs (`auto-file-session.ts:150`, `topic-probe-extract.ts:291`, `transcript-purge-cron.ts:177`) all add explicit `onFailure` terminus handlers for exactly this reason.
- Impact: GDPR Art. 17 erasure can silently half-complete (DB gone, Clerk identity retained) with no first-class alert. The email/credentials/OAuth links remain in Clerk indefinitely until someone notices the failed run in the dashboard.
- Fix direction: Add an `onFailure` handler that `captureException`s with a `surface: 'account-deletion.terminal_failure'` tag plus the `accountId`/`clerkUserId`, and emits a queryable terminal event (mirror `transcriptPurgeHandlerOnFailure`). Confirm `getStepClerkSecretKey()` returning `undefined` is treated as a retryable throw (so it doesn't silently skip erasure) rather than a no-op.

### [Medium] `safe-non-core` ratchet accepts a bare `try/catch` even when the catch silently swallows — billing/auth recovery can be invisible
- File: `apps/api/src/services/safe-non-core.guard.test.ts:99-160` (the `isInsideTryBlock` / `classifySite` logic that classifies any `inngest.send` inside a same-function `try` as acceptable `try-catch`).
- What: The ratchet's three accepted states are `safesend`, `core-send`, and `try-catch`. The `try-catch` classification only checks that a `try` statement syntactically encloses the dispatch in the same function — it does **not** verify the `catch` re-throws, escalates to Sentry, or emits a metric. CLAUDE.md ("Silent recovery without escalation is banned") requires any billing/auth/webhook catch that recovers to emit a structured metric or Inngest event, but this guard would pass an empty `catch {}` around a billing dispatch.
- Impact: A future contributor can satisfy the bare-send ratchet with `try { await inngest.send(...) } catch {}` in billing/webhook code and CI stays green, re-introducing exactly the silent-recovery class the project bans. Today's sites appear compliant (spot-checked: `review-due-send.ts:78`, `trial-expiry.ts` escalate properly), so this is a guard-coverage gap rather than a present defect.
- Fix direction: Tighten the ratchet so the `try-catch` classification additionally requires the catch body to contain a `throw`, a `captureException`/`safeSend`/`step.sendEvent`, or a documented status-return; otherwise demote to `bare`. Alternatively keep `try-catch` as a hard violation for files under `services/billing/` and `routes/*webhook*`.

### [Medium] `onFailure` handlers issue raw DB writes outside `step.run`, relying on middleware scope that is not guaranteed for the failure-handler invocation
- File: `apps/api/src/inngest/functions/topic-probe-extract.ts:319-338` and `apps/api/src/inngest/functions/auto-file-session.ts:170-175`.
- What: Both `onFailure` handlers call `getStepDatabase()` directly (not inside a `step.run`) and perform a DB write. `getStepDatabase()` (`helpers.ts:55-68`) creates a fresh non-pooled Neon WebSocket connection and registers it in `stepDatabaseScope.getStore()?.add(db)` for later close by the middleware's `beforeResponse` → `closeStepDatabases` hook (`client.ts:85-87`). If the `AsyncLocalStorage` scope is not entered for the `onFailure` invocation (the middleware's `beforeMemoization`/`beforeExecution` hooks fire for normal runs; the failure-handler invocation path is a separate function execution), `getStore()` is `undefined`, the `db` is never added to a scope, and the WebSocket is never closed — a per-terminal-failure connection leak. The write is also non-durable: `onFailure` is not itself retried, so a transient failure of the status-marking UPDATE is lost (topic-probe-extract wraps its write in a local `try/catch` that only logs).
- Impact: Best case a small connection leak on each terminal failure (matters under a failure storm); worst case the failure-marking write silently no-ops, leaving the session's `topicProbeExtractionStatus` / auto-filing-failed marker unset.
- Fix direction: Confirm with the Inngest middleware lifecycle whether `onFunctionRun` (and thus the scope hooks) wraps `onFailure` invocations; if not, explicitly `runWithStepDatabaseScope(...)` (already exported from `helpers.ts:16`) around the onFailure DB work, and `await closeStepDatabases()` in a `finally`. Prefer doing the write inside a `step.run` is not possible in `onFailure`, so the scope wrapper is the correct fix.

---

## Low

### [Low] `trial-expiry` processes the full expired-trial set in a single un-paginated `step.run` — step output/time limits under a backlog
- File: `apps/api/src/inngest/functions/trial-expiry.ts:153-189` (`process-expired-trials`) and `:201-249` (`process-extended-trial-expiry`).
- What: `findExpiredTrials` / `findExpiredTrialsByDaysSinceEnd` return the entire eligible set and the per-trial loop runs inside one `step.run`. Unlike the scan/fan-out crons (`review-due-scan.ts:149`, `daily-reminder-scan.ts:112`, `daily-snapshot.ts:76`) which batch at 200–500, this has no cap. Inngest enforces 4MB per step output and a per-step time budget; a large day-boundary backlog (e.g. a promo cohort all expiring the same day) could exceed those.
- Impact: A pathological backlog could blow the step output/time limit and fail the daily run; the `failures[]` array returned from the step also grows unbounded.
- Fix direction: Cap each `step.run` to a bounded LIMIT and self-reinvoke with a cursor (mirror `filing-stranded-backfill.ts` or the fan-out crons), or fan trial IDs out to a per-trial handler with `concurrency`.

### [Low] `transcript-purge-handler` (per-purge receiver) has no function-level idempotency key
- File: `apps/api/src/inngest/functions/transcript-purge-cron.ts:224-302`.
- What: The fan-out receiver for `app/session.transcript.purge` carries `concurrency: { limit: 5 }` and `retries: 3` but no `idempotency`. A cron re-fire or operator replay can deliver the same `(profileId, sessionSummaryId)` twice. Correctness relies entirely on `purgeSessionTranscript`'s internal `purgedAt` guard. Sibling receivers (`review-due-send.ts:30`, `recall-nudge-send.ts:27`, `dailySnapshotRefresh` at `daily-snapshot.ts:110`) all add an explicit `idempotency` key as defence-in-depth.
- Impact: Low — the purge is idempotent at the data layer, but a duplicate run still emits a duplicate `app/session.transcript.purged` observability event, skewing SLO counters.
- Fix direction: Add `idempotency: 'event.data.sessionSummaryId'` to match the sibling fan-out receivers.

### [Low] `streak-record` event handler has no idempotency key
- File: `apps/api/src/inngest/functions/streak-record.ts:7-28`.
- What: Triggered by `app/streak.record` (dispatched from `routes/quiz.ts:363`) with `retries: 3` but no `idempotency`. `recordSessionActivity(db, profileId, date)` is date-keyed and idempotent, so a duplicate event is harmless — but the durable handler exists specifically to make streak recording reliable, and a missing key is inconsistent with the rest of the codebase's defence-in-depth.
- Impact: Negligible (write is idempotent by date). Listed for consistency.
- Fix direction: Add `idempotency: 'event.data.profileId + "-" + event.data.date'`.

### [Low] `memory-facts-embed-backfill` loop bound uses the initial backlog count, not live remaining
- File: `apps/api/src/inngest/functions/memory-facts-embed-backfill.ts:96` (`for (let batchIndex = 0; batchIndex * BATCH_SIZE < backlog; batchIndex++)`).
- What: The outer loop ceiling is the `count-backlog` value captured once at run start. Eligibility filtering (`:163-168`) and non-retryable skips advance the cursor without embedding, so most iterations still make cursor progress and the `batch.scanned < BATCH_SIZE` break (`:261`) terminates the run; the halt-on-no-progress guard (`:270-284`) covers the Voyage-outage case. So termination is safe. The minor issue is purely that the iteration count is derived from a stale denominator, which is harmless but slightly misleading and could over- or under-shoot the intended batch count if the backlog changed mid-run.
- Impact: None observed — termination is guaranteed by the scanned-count break and the no-progress halt. Cosmetic/robustness only.
- Fix direction: Optionally key the loop on cursor progress (`while (lastId advanced && scanned === BATCH_SIZE)`) rather than the initial backlog count for clarity.

### [Low] `app/billing.alias_received` is a known-pending orphan with no remediation handler (revenue-loss scenario)
- File: tracked in `apps/api/src/inngest/orphan-dispatcher.guard.test.ts:91` (`KNOWN_PENDING_ORPHANS`); dispatched from `services/billing/revenuecat-webhook-handler.ts` on a RevenueCat `SUBSCRIBER_ALIAS` where the transferred-from identity still has an active subscription.
- What: The event is dispatched and escalated via `captureException` (alerting is not silent), but there is no automated remediation handler that merges/transfers the overlapping subscriptions. The guard intentionally keeps it pending (not `orphan-allow`'d) as the signal that a handler is still owed.
- Impact: Potential double-charge / revenue-loss on account-alias transfers requires manual ops intervention; correctly surfaced but not automatically remediated.
- Fix direction: Out of this lens's mechanical scope (needs a product decision on which subscription wins + proration/refund). Flag to the billing lens; the existing escalation is adequate as an interim.

---

## Cross-lens findings

- **Testing infrastructure (mocks-must-reflect-reality):** The `filing-timed-out-observe` mock `step` harness (`filing-timed-out-observe.test.ts`) models `step.run` as a direct callback invocation and permits `step.sendEvent` inside it — masking the High-severity nested-step bug above. This is a systemic risk: any other function that accidentally nests step tools would also pass its unit tests. The shared `_test-harness.ts` and per-function mock step runners should enforce "step tool inside `step.run` throws," matching the real Inngest executor. (Belongs to the Testing / LLM-eval lens.)

- **Billing / webhooks lens:** `app/billing.alias_received` (Low finding above) needs a remediation handler — a product+billing decision, not a mechanical Inngest fix. Also the `safe-non-core` `try-catch` ratchet gap (Medium) most directly affects billing/webhook dispatch sites (`services/billing/stripe-webhook-handler.ts:622`, `revenuecat-webhook-handler.ts:549`) — those are currently compliant but unprotected by the guard.

- **GDPR / compliance lens:** The `account-deletion` missing-`onFailure` finding (Medium) is a GDPR Art. 17 erasure-completeness gap (Clerk identity can survive a terminally-failed deletion run). Worth cross-referencing with the compliance/DPIA track since erasure SLAs may be regulator-facing.

- **Data-access / scoping lens:** Not a defect, but every cross-profile cron carries an explicit `// @inngest-admin: cross-profile` or `parent-chain` banner and enforces `profileId` at the leaf even when scanning broadly (e.g. `review-due-scan.ts`, `memory-facts-embed-backfill.ts` UPDATE `… AND memory_facts.profile_id = data.profile_id`). The scoping discipline in background jobs is sound; flagging only so the data-access lens can confirm the parent-chain WHERE clauses in `review-due-send.ts:116-121` and `session-completed.ts:loadTopicTitle` independently.
