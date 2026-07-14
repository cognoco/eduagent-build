# Inngest jobs & cross-cutting processes/tasks — Functional Atlas

Scope: `apps/api/src/inngest/**` (all functions registered in `index.ts`), `packages/schemas/src/inngest-events.ts`, `apps/api/src/services/safe-non-core.ts`. This is the **invisible-machine layer** — every background task and process the system runs without direct user action. None of it has its own screen; it is triggered either by a user action elsewhere (event) or by a clock (cron), and it mutates user-facing state (progress, summaries, notifications, reports, account/data lifecycle) behind the screens.

Registry (source of truth for what is live): `apps/api/src/inngest/index.ts:194-273` — 72 exported function objects across 58 source files (some files export multiple functions; observability terminus handlers count separately). Trigger plumbing: `apps/api/src/inngest/client.ts` (CF env-binding middleware injects DATABASE_URL/VOYAGE/RESEND/CLERK per-invocation); `apps/api/src/inngest/helpers.ts` (per-step Database scoping via `getStepDatabase()`).

---

## Screens (route -> purpose)

**This domain has NO screens.** It is pure backend. There is no Inngest dashboard inside the app, no "background jobs" screen, no job-status UI. The user never sees this layer directly; they only see its *effects* surface on other domains' screens:

| Effect of a background job | Where the user sees it (other domain) |
|---|---|
| Session summary / learner recap generated | Session detail / recap screen (recaps tab V1, library V0) |
| Progress snapshot computed | Progress tab, parent progress dashboard |
| Weekly/monthly report generated | Parent home / progress (push + email) |
| Review-due / recall / daily-reminder fired | OS push notification → deep-link into review/session |
| Topic suggestions generated | Post-session / library suggestions UI |
| Quota reset / trial expiry | Billing/paywall state, daily-cap banners |
| Account/child deletion completed | Sign-out / account-gone state; parent notice |

The only operator-facing surface is the Inngest cloud dashboard (external) and Sentry (external) — see "observe" terminus handlers below, which exist solely to make this layer queryable.

---

## Capabilities (background task -> trigger -> backend process file:line)

Grouped by **trigger class**. "User action behind it" = the in-app action that ultimately fans the event (where one exists). Cron jobs have no user action — the clock is the actor.

### A. CRON jobs (clock-triggered, no user action) — 14 jobs

| Job | Schedule | What it accomplishes / state changed | File:line |
|---|---|---|---|
| **session-stale-cleanup** | `*/10 * * * *` (every 10 min) | Auto-closes learning sessions idle >30 min; abandons quiz rounds stale >2h. Writes `learning_sessions.endedAt`. | `session-stale-cleanup.ts:9,18` |
| **daily-reminder-scan** | `0 * * * *` (hourly, filters local 9 AM) | Finds profiles with active streaks at their local ~9 AM, fans out `app/daily-reminder.send` per profile. | `daily-reminder-scan.ts:31-33` |
| **recall-nudge** | `0 * * * *` (hourly, filters local 8 AM) | Finds profiles with fading/overdue retention cards at local ~8 AM, fans out `app/recall-nudge.send`. | `recall-nudge.ts:45-47` |
| **memory-facts-embed-backfill** | `0 * * * *` (hourly) | Embeds memory-fact rows missing vectors (Voyage); halts on no-progress; backlog alerts. | `memory-facts-embed-backfill.ts:52-63` |
| **quota-reset** | `0 1 * * *` (daily 01:00 UTC) | Resets daily usage counters for all pools + monthly quota for elapsed billing cycles, in one transaction. | `quota-reset.ts:25-27` |
| **subject-auto-archive** | `0 2 * * *` (daily 02:00 UTC) | Archives subjects with no activity in 30 days. Writes `subjects.archivedAt`. | `subject-auto-archive.ts:12-22` |
| **daily-snapshot (cron)** | `0 3 * * *` (daily 03:00 UTC) | Scans profiles active in last 90 days, fans out `app/progress.snapshot.refresh` per profile. | `daily-snapshot.ts:30-32` |
| **needs-deepening-expire-pending** | `0 3 * * *` (daily 03:00 UTC) | Expires stale `pending` needs-deepening rows (weak-concept review queue). | `needs-deepening-expire-pending.ts:5-10` |
| **webhook-idempotency-purge** | `0 3 * * *` (daily 03:00 UTC) | Purges aged webhook-idempotency rows (billing webhook dedup keys). | `webhook-idempotency-purge.ts:30-37` |
| **summary-reconciliation-cron** | `0 4 * * *` (daily 04:00 UTC) | Finds sessions missing summary / llmSummary / learnerRecap (37/30-day windows, >6h old) and re-queues create/regenerate/recap events. | `summary-reconciliation-cron.ts:13-18` |
| **transcript-purge-cron** | `0 5 * * *` (daily 05:00 UTC) | Queues GDPR transcript purge for summaries aged 30 days (gated on `RETENTION_PURGE_ENABLED`); flags day-37 stuck-without-summary cases. | `transcript-purge-cron.ts:22-27` |
| **topup-expiry-reminder** | `0 9 * * *` (daily 09:00 UTC) | Sends top-up credit expiry reminders at 6/4/2/0 months before 12-month expiry; fans `app/topup.expiry-reminder`. | `topup-expiry-reminder.ts:42-47` |
| **trial-expiry** | `0 0 * * *` (daily midnight UTC) | Drives reverse-trial state machine: day 15 → extended soft-landing, day 29 → free tier; writes `subscriptions.status/tier/quota`; emits warnings + failure events. | `trial-expiry.ts:132-134` |
| **review-due-scan** | `0 */2 * * *` (every 2h) | Finds profiles with overdue retention cards, fans out `app/retention.review-due` per profile. | `review-due-scan.ts:45-47` |

### B. CRON jobs that fan out per-recipient report generation — 3 report families (6 functions)

These are the "report generation crons." Each is a cron that scans recipients then fans out a per-recipient generate event handled by a sibling function:

| Report | Cron (scan) | Generate (per-recipient) | Schedule | What it produces |
|---|---|---|---|---|
| **Weekly parent progress digest** | `weeklyProgressPushCron` `weekly-progress-push.ts:262-267` | `weeklyProgressPushGenerate` `weekly-progress-push.ts:505-520` (event `app/weekly-progress-push.generate`) | `0 * * * 1` (Mondays hourly, local-time gated) | Per-parent weekly child-progress summary → push + email; gated by `pushEnabled && weeklyProgressPush` OR `weeklyProgressEmail`. |
| **Weekly self (solo learner) report** | `weeklySelfReportCron` `weekly-self-reports.ts:121-126` | `weeklySelfReportGenerate` `weekly-self-reports.ts:167-172` (event `app/weekly-self-report.generate`) | `0 * * * 1` (Mondays hourly, local 9 AM) | Per-solo-learner weekly self-report (`weeklyReports` table); GDPR-gated. Plus one-shot admin backfill `selfProgressReportsBackfill` (`weekly-self-reports.ts:346-351`, event `admin/progress-self-reports-backfill.requested`). |
| **Monthly family report** | `monthlyReportCron` `monthly-report-cron.ts:113-118` | `monthlyReportGenerate` `monthly-report-cron.ts:243-255` (event `app/monthly-report.generate`) | `0 10 1 * *` (1st of month, 10:00 UTC) | Per parent/child pair monthly report (`monthlyReports`) with highlights → push + email. |

### C. EVENT-triggered pipelines (a user action fans the event) — core flows

| Job | Event | User action behind it | What it accomplishes | File:line |
|---|---|---|---|---|
| **session-completed** (THE big pipeline) | `app/session.completed` | User ends/abandons a tutoring session | ~17-step pipeline: waits for filing (60s), re-reads topic, relearn-reset, **SM-2 retention update**, needs-deepening update, milestone check, coaching card, **session insights (LLM)**, **learner recap (LLM)**, dedup new memory facts, struggle notify, **dashboard/progress update**, embeddings, homework summary, pace baseline, **queue celebrations**. Idempotent on sessionId, concurrency 25/profile. | `session-completed.ts:358-379` (steps: `:529,636,684,844,868,903,934,1148,1564,1611,1627,1670,1689,1716,1732`) |
| **progress-summary-generation** | `app/session.completed` | (same event, parallel consumer) | Generates per-session progress summary text. | `progress-summary.ts:17-27` |
| **auto-file-session** | `app/session.auto_file_requested` | Freeform session closed / user-requested filing / retry / restore (`session-filing-dispatch.ts`, `sessions.ts`) | Files a freeform/homework session transcript into a curriculum topic (LLM classify + place). Then emits `app/filing.completed`. | `auto-file-session.ts:141-195` |
| **freeform-filing-retry** | `app/filing.retry` | Filing auto-retry path | Retries failed freeform filing. | `freeform-filing.ts:218-224` |
| **post-session-suggestions** | `app/filing.completed` | Downstream of filing | Generates ≤2 next-topic suggestions per book (LLM); idempotent on bookId. Writes `topicSuggestions`. | `post-session-suggestions.ts:34-50` |
| **book-pre-generation** | `app/book.topics-generated` | Book topics generated (`books.ts`) | Pre-generates next 1-2 books' topics in the same subject so they're ready when opened. | `book-pre-generation.ts:18-36` |
| **subject-prewarm-curriculum** | `app/subject.curriculum-prewarm-requested` | New subject created (`subject.ts`) | Pre-warms first book's curriculum/topics. | `subject-prewarm-curriculum.ts:68-76` |
| **subject-retry-curriculum** | `app/subject.curriculum-retry-requested` | Curriculum gen failed → retry | Retries curriculum generation for a subject/book. | `subject-retry-curriculum.ts:45-57` |
| **streak-record** | `app/streak.record` | Session activity recorded | Durably records day's activity into `streaks`. | `streak-record.ts:7-13` |
| **topic-probe-extract** | `app/topic-probe.requested` | Learner message during session (probe) | Extracts structured topic-probe signals (LLM); writes assessments/needs-deepening. | `topic-probe-extract.ts:286-361` |
| **review-calibration-grade** | `app/review.calibration.requested` | Learner answers a review question | Grades review answer (LLM), syncs XP; emits `review_calibration.xp_sync_failed` on failure. | `review-calibration-grade.ts:160-166` |
| **exchange-empty-reply-fallback** | `app/exchange.empty_reply_fallback` | LLM returned empty reply mid-session | Generates a fallback reply so the chat is never blank. | `exchange-empty-reply-fallback.ts:40-45` |
| **ask-silent-classify** (+ on-failure) | `app/ask.classify_silently` / `inngest/function.failed` | Ambiguous "ask" message | Silently classifies which subject an ask belongs to (LLM). | `ask-silent-classify.ts:20-37,192-195` |
| **summary create / regenerate / recap-regenerate** | `app/session.summary.create` / `.regenerate` / `.learner-recap.regenerate` | Fanned by summary-reconciliation cron (or manual) | (Re)generates session summary, llmSummary, or learner recap. Writes `sessionSummaries`. | `summary-regenerate.ts:146,230,300` |
| **daily-snapshot-refresh** | `app/progress.snapshot.refresh` | Fanned by daily-snapshot cron | Recomputes one profile's progress snapshot. Writes `progressSnapshots`. | `daily-snapshot.ts:92-112` |
| **memory-facts-backfill** | `admin/memory-facts-backfill.requested` | Admin/migration | One-shot backfill of memory facts. | `memory-facts-backfill.ts:35-45` |

### D. EVENT-triggered notification SENDERS (fanned by the scan crons in A) — 4

| Sender | Event | Fanned by | Delivers |
|---|---|---|---|
| **daily-reminder-send** | `app/daily-reminder.send` | daily-reminder-scan | Daily streak nudge push. `daily-reminder-send.ts:18-33` |
| **recall-nudge-send** | `app/recall-nudge.send` | recall-nudge | Fading-topic recall push. `recall-nudge-send.ts:21-29` |
| **review-due-send** | `app/retention.review-due` | review-due-scan | Review-due push. `review-due-send.ts:24-32` |
| **topup-expiry-reminder-send** | `app/topup.expiry-reminder` | topup-expiry-reminder | Top-up credit expiry push. `topup-expiry-reminder-send.ts:21-26` |

### E. EVENT-triggered LIFECYCLE / GDPR jobs (long grace-period sleeps) — 3

| Job | Event | User action | What it accomplishes | File:line |
|---|---|---|---|---|
| **scheduled-account-deletion** | `app/account.deletion-scheduled` | User requests account deletion (`account.ts`) | **7-day sleep**, then if not cancelled: `executeDeletion` (cascade delete all data) + erase Clerk login identity (GDPR Art 17). Idempotent on accountId, concurrency 1. | `account-deletion.ts:11-24` |
| **consent-revocation** | `app/consent.revoked` | Parent withdraws GDPR consent for a child (`consent.ts`) | **6-day sleep → 24h warn push → 1-day sleep**; if still withdrawn: archive (13+) or hard-delete (≤13 / "never archive") child profile; notifies parent+child; records pending notice. | `consent-revocation.ts:32-44` |
| **archive-cleanup** | `app/profile.archived` | Fanned by consent-revocation archive branch | **30-day sleep**, then hard-deletes the archived profile (`deleteProfile`). Idempotent on profileId. | `archive-cleanup.ts:11-28` |

### F. EVENT-triggered BILLING / FAMILY jobs — 2

| Job | Event | What it accomplishes | File:line |
|---|---|---|---|
| **billing-trial-subscription-failed** | `app/billing.trial_subscription_failed` | Handles a failed trial-subscription creation. | `billing-trial-subscription-failed.ts:48-57` |
| **notify-parent-child-cap-hit** | `app/billing.profile_quota.exhausted` | Pushes parent when a child profile exhausts its quota. | `notify-parent-child-cap-hit.ts:13-15` |

### G. ONE-SHOT maintenance / backfill — 2

| Job | Event | Purpose | File:line |
|---|---|---|---|
| **filing-stranded-backfill** | `app/maintenance.filing_stranded_backfill` | Backfills sessions stranded mid-filing. | `filing-stranded-backfill.ts:40-46` |
| **transcript-purge-handler** (+ on-failure) | `app/session.transcript.purge` / `inngest/function.failed` | Per-session transcript purge worker (fanned by transcript-purge-cron). | `transcript-purge-cron.ts:177-231` |

### H. OBSERVABILITY "observe" terminus handlers (pure telemetry sinks, no state change) — ~20

These exist ONLY to make the invisible layer queryable in Inngest/Sentry. They consume an event and log/count — they change **no user-facing state**. They are the largest single cluster of functions and a major complexity signal (one event → one whole function just to record it happened):

`ask-classification-observe.ts` (3: completed/skipped/failed), `ask-gate-observe.ts` (2: decision/timeout), `email-bounced-observe.ts`, `payment-failed-observe.ts`, `trial-expiry-failure-observe.ts`, `notification-suppressed-observe.ts`, `orphan-persist-failed.ts`, `feedback-delivery-failed.ts`, `filing-completed-observe.ts`, `filing-timed-out-observe.ts` (this one also *acts* — claims retry slots & emits `app/filing.retry_completed`, `:79,198`), `filing-observe.ts` (2: resolved/auto-retry-attempted), `session-completed-observe.ts` (3: summary-generated/summary-failed/completed-with-errors), `summary-reconciliation-observe.ts` (2: scanned/requeued), `transcript-purge-observe.ts` (3: delayed/purged/skipped).

Event schemas for all of the above: `packages/schemas/src/inngest-events.ts` (filing `:5-59`, prewarm/retry `:61-81`, orphan `:83-95`, notification-suppressed `:97-105`, billing quota `:107-116`, review-calibration `:118-128`, topic-probe `:130-142`, streak `:144-148`, retention-SLO `:150-203`, ask-classification `:205-250`, summary/recap `:252-264`, book-topics `:266-278`, session-completed observability `:280-347`).

---

## Navigation depth map

**Every capability in this domain is navigation depth ∞ (zero taps and unreachable) for the user** — there is no screen, no menu, no button anywhere in the app that opens "background jobs." That is the defining property of the invisible-machine layer.

The relevant depth question is the inverse: **how buried is the USER ACTION that triggers each job, and how visible is the RESULT?**

| Trigger surface | User-action depth | Result visibility |
|---|---|---|
| End a session → `session.completed` pipeline | Tap "end" inside an active session (~2-3 deep from Home) | Result (recap/progress) lands on a *different* screen later — async, no progress bar |
| Create a subject → curriculum prewarm | Add-subject flow (~2 deep) | Topics "just appear ready"; failure → retry job, silent |
| Request account deletion → 7-day timer | Settings → More → account → privacy → delete (≥4 deep) | 7-day delay; only a notice |
| Parent withdraws consent → 7-day child-delete | Settings deep (≥4 deep) | 6-day silence then a single warn push |
| All 14 crons | **No user action at all** | Push notifications / progress / reports surface with no traceable origin |

Redesign-relevant fact: **none of the ~30 distinct background outcomes are discoverable or controllable from one screen today.** A user cannot see "what is the system doing for me right now / what's scheduled / what failed." The only user-facing knobs are notification preferences (`notificationPreferences` table) and the withdrawal-archive preference — buried in settings.

---

## Backend processes & data model

**Trigger plumbing.** `inngest.createFunction(config, trigger, handler)`. Trigger is either `{ cron: '...' }` or `{ event: 'app/...' }` (one `inngest/function.failed` system trigger for failure handlers). Per-invocation env bindings (DATABASE_URL, VOYAGE, RESEND, EMAIL_FROM, APP_URL, SUPPORT_EMAIL, RETENTION_PURGE_ENABLED, CLERK_SECRET_KEY, memory-facts dedup config) are injected by `envBindingMiddleware` (`client.ts:26-92`) because CF Workers only expose bindings request-scoped. DB handles come from `getStepDatabase()` (`helpers.ts:55-68`), tracked per-step and closed on `beforeResponse` to avoid WebSocket reuse across executions.

**Durability conventions (repeated across the suite — strong sign of hard-won reliability rules):**
- `idempotency: 'event.data.X'` on every event handler that does irreversible work (session-completed sessionId, deletion accountId, consent childProfileId+revokedAt, book/suggestion bookId).
- `concurrency: { limit, key }` to avoid LLM/Neon stampede (session-completed 25/profile, lifecycle jobs limit:1).
- **"compute `now`/cutoff INSIDE `step.run`"** — repeated verbatim in quota-reset, transcript-purge, subject-auto-archive, session-stale-cleanup, summary-reconciliation (BUG-189 pattern) so replay reuses the cached boundary instead of drifting wall-clock.
- `step.sendEvent` (memoized) instead of bare `inngest.send` inside loops to avoid duplicate-event dispatch (SWEEP-J7).
- Scan-then-fan-out: crons select a bounded batch (LIMIT 50-200) then fan one event per recipient so each delivery retries independently.

**`safeSend` / `safeWrite`** (`services/safe-non-core.ts:37,111`): the sanctioned wrapper for **non-core** dispatches. `safeSend` races the dispatch against a 2s timeout (`DEFAULT_TIMEOUT_MS=2000`, `:7`), captures any failure/late-rejection in Sentry, and **never throws** — so a telemetry/notification dispatch failure can't break the user action. Bare `inngest.send` is reserved for core flows (marked `// core-send:`). This is the boundary that lets the request path fire-and-forget into this whole layer safely.

**User-facing state mutated by this layer (by table):**
- `learning_sessions` (endedAt — stale-cleanup, session-completed)
- `retention_cards` (SM-2 schedule: easeFactor/intervalDays/repetitions/nextReviewAt — session-completed `:636,684`)
- `session_summaries` (llmSummary, learnerRecap, summaryGeneratedAt, purgedAt — summary-regenerate, transcript-purge)
- `progress_snapshots` (daily-snapshot-refresh), `weekly_reports`, `monthly_reports`
- `subjects.archivedAt` (subject-auto-archive), `profiles.archivedAt` / hard-delete (consent-revocation, archive-cleanup, account-deletion)
- `subscriptions` (status/tier/quota — trial-expiry; used_today/cycle — quota-reset)
- `topic_suggestions`, `streaks`, `needs_deepening`, memory-fact embeddings, `notification_log` / push notifications

---

## Complexity signals & redesign notes

1. **~20 of 58 functions are pure observability sinks (cluster H).** Each is a whole Inngest function that consumes one event and records it. They add zero user value and exist because the layer is otherwise unobservable. For a one-screen redesign these are irrelevant to the UI but signal how much machinery is needed *just to know what the background did* — i.e. the user has no window into any of it.

2. **Scan/send cron PAIRS triple the function count.** daily-reminder, recall-nudge, review-due, top-up-expiry, daily-snapshot, weekly-progress, weekly-self, monthly-report are each split into a scan cron + a per-recipient send/generate handler — 8 conceptual jobs implemented as 16 functions. Conceptually they are all "scan eligible users → notify/report." A redesign could collapse the *concept* to a single "what's scheduled for me" surface.

3. **Three overlapping report types** (weekly-parent-progress, weekly-self, monthly-family) all compute progress-from-snapshots and deliver via push+email. A parent with a solo-and-family mix could receive all three. Redundant report types are a classic one-screen-consolidation target.

4. **Three overlapping notification nudges** (daily-reminder = streak, recall-nudge = fading topic, review-due = overdue card) all fire local-morning pushes off retention/streak state. From the user's seat these are three different pings nudging the same behavior ("come study"). Heavy overlap; ripe for a single unified "today" surface.

5. **Long-sleep lifecycle jobs are invisible and uncancellable from a single place.** account-deletion (7d), consent-revocation (7d), archive-cleanup (30d) run silent multi-day timers. The user/parent has no in-app "pending actions / countdowns" view — only a notice and a deep-settings cancel path. A one-screen design should surface these pending state-changes.

6. **session-completed is a 17-step monolith** doing retention math, two LLM generations, embeddings, dashboard, and celebrations in one function (`session-completed.ts:358-1811`). It is the single most important background process and its outputs scatter across the recaps/progress/celebration screens with no unified "here's what just happened to your learning" view.

7. **Result-without-origin.** Push notifications, ready curricula, generated recaps, and reports all appear with no traceable trigger. The system does a lot *for* the user that the user can neither see queued, see in progress, nor understand the source of.

---

## Overlaps with other domains

- **Progress domain:** progress snapshots (daily-snapshot), weekly/monthly/self reports, and the session-completed dashboard update all feed the Progress tab + parent progress dashboard. Progress data is computed in ≥4 background paths and shown in multiple progress surfaces.
- **Review / retention domain:** SM-2 schedule writes (session-completed), needs-deepening expiry, review-calibration grading, review-due/recall nudges all touch the same `retention_cards` / `needs_deepening` state the Review screens read. Review is driven by 3 separate background jobs.
- **Sessions / filing domain:** auto-file-session, freeform-filing-retry, post-session-suggestions, filing observers, and session-completed's 60s filing-wait all coordinate around the filing event chain — a tight cross-job dance behind the single user act of "ending a session."
- **Billing domain:** trial-expiry, quota-reset, topup-expiry-reminder, billing-trial-subscription-failed, notify-parent-child-cap-hit, payment-failed-observe, webhook-idempotency-purge all mutate/observe subscription+quota state surfaced on paywall/billing screens (inside More → account, owner-gated).
- **Account / consent / GDPR domain:** account-deletion, consent-revocation, archive-cleanup, consent-reminders implement the data-lifecycle behind settings → privacy. isOwner / parent-vs-child gating and the COPPA ≤13 hard-delete branch (`consent-revocation.ts:139-143`) live here, mirroring the audience-matrix gating documented for the screens.
- **Notifications domain:** every "send" handler and consent/cap notifier writes `notification_log` and dispatches push via `sendPushNotification`, gated by `notificationPreferences` — the only user-facing control over this entire layer.
