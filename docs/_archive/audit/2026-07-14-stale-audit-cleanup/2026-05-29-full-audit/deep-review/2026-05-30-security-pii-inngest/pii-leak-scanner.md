# PII Leak Scanner — Inngest Background-Job Surface

**Scope:** `apps/api/src/inngest/` (59 function source files + `client.ts`, `helpers.ts`, `index.ts`) in eduagent-build, plus the `services/` dispatch sites and event schemas that feed them. Path-scoped audit, not a PR diff — **all findings classified `[PRE-EXISTING]`**.

**Central risk model (per Scope Context):** Inngest persists both **event payloads** (`inngest.send`/`step.sendEvent` `data:`) and **memoized `step.run(...)` return values** in its third-party dashboard/state store for the run retention window, readable by anyone with Inngest console access or vendor support. PII that is only a **local variable inside a step closure** (passed to an LLM/DB but not returned, not in an event) is NOT serialized and is clean. Established mitigation in this repo: pass only ids across the boundary and re-fetch PII from the DB inside the consuming step.

**App context:** multi-tenant family education app with **child accounts (minors)** on parents' accounts. Minors' PII weighted highest: names, birth years, learner free-text answers, tutor transcripts, learning-difficulty (struggle) data.

---

## Summary of Findings

| # | Severity | File:Line | Boundary | PII |
|---|---|---|---|---|
| 1 | HIGH | session-exchange.ts:1806 → ask-silent-classify.ts:37 | Event payload | Minor's raw freeform "ask" message text |
| 2 | HIGH | session-exchange.ts:1196 → topic-probe-extract.ts | Event payload | Minor's raw topic-probe answer (`learnerMessage`) |
| 3 | HIGH | auto-file-session.ts:71-76 | Memoized step state | Minor's full session transcript (learner+tutor) |
| 4 | HIGH | freeform-filing.ts:152-159 | Memoized step state | Minor's full session transcript |
| 5 | MEDIUM | topic-probe-extract.ts:176-179 | Memoized step state | Minor's full transcript (`history` array) |
| 6 | MEDIUM | weekly-progress-push.ts:851-861 | Memoized step state | Child names, struggle topics, **parent email** |
| 7 | MEDIUM | monthly-report-cron.ts:475-481 | Memoized step state | Child display name + struggle topics |
| 8 | MEDIUM | progress-summary.ts:83-93 | Memoized step state | Child name + knowledge inventory *(known M2)* |
| 9 | MEDIUM | consent-revocation.ts:112-115 | Memoized step state | Minor's display name + **birth year** |
| 10 | MEDIUM | session-completed.ts:1490 (→1596) | Memoized step state | Minor's struggle topics + subject |
| 11 | LOW | feedback-delivery-failed.ts:26-31 (event) | Event payload | User feedback free-text + support email |
| 12 | LOW | topic-probe-extract.ts:184-186 | Memoized step state | Inferred goals/interests/knowledge signals |

Verified-clean (known sweep sites that are actually safe): see "Known Sweep List Verification" below.

---

## [PRE-EXISTING] — HIGH

### 1. Minor's raw freeform "ask" text placed in `app/ask.classify_silently` event payload
- **Location:** dispatch `apps/api/src/services/session/session-exchange.ts:1806-1818`; consumer `apps/api/src/inngest/functions/ask-silent-classify.ts:37`, schema at `ask-silent-classify.ts:11-16` (`classifyInput: z.string()`).
- **Severity:** HIGH
- **Category:** Third-Party Sharing (Inngest event-store persistence)
- **PII Type:** Minor's raw free-text learning question(s).
- **Data flow:** On the first exchange of a freeform session, `priorUserMessages` + `userMessage` (the learner's raw typed content) are joined and put directly into `inngest.send({ name: 'app/ask.classify_silently', data: { classifyInput: <raw learner text>, ... } })`. Inngest persists the event payload in its third-party state store. Anyone with Inngest console/vendor-support access can read the minor's question for the retention window. This is the exact H1 class (free-text in event payload), the only difference being it dispatches from a service rather than a job — but the consuming function and its schema (which *mandate* the field) live in the audited surface.
- **Recommendation:** Carry only `sessionId` + `profileId` + `exchangeCount` in the event. Inside `ask-silent-classify`'s `classify` step, re-fetch the first user exchange text from `sessionEvents` (scoped by `profileId`) and pass it to `classifySubject`. Remove `classifyInput` from `classifySilentlyEventDataSchema`.

### 2. Minor's raw topic-probe answer in `app/topic-probe.requested` event payload
- **Location:** dispatch `apps/api/src/services/session/session-exchange.ts:1181, 1196-1199`; schema `packages/schemas/src/inngest-events.ts` (`topicProbeRequestedEventSchema` → `learnerMessage: z.string().min(1)`, `topicTitle: z.string().min(1)`); consumer `apps/api/src/inngest/functions/topic-probe-extract.ts:142, 229-230`.
- **Severity:** HIGH
- **Category:** Third-Party Sharing (Inngest event-store persistence)
- **PII Type:** Minor's raw probe answer text + topic title.
- **Data flow:** `learnerMessageText` (the learner's raw message) is sent as `data.learnerMessage` in the `app/topic-probe.requested` event. Persisted in Inngest's event store. Inside `topic-probe-extract` it is consumed at `seedRetentionCard` (line 229) → `evaluateRecallQuality(learnerMessage, topicTitle)`.
- **Recommendation:** Pass `sessionId`/`topicId`/`profileId` only; re-fetch the learner's first message for the topic inside the `seed-retention-card` step (the function already queries `sessionEvents` for the transcript at line 176). Drop `learnerMessage`/`topicTitle` from `topicProbeRequestedEventSchema`, or replace with non-identifying ids.

### 3. Minor's full session transcript memoized in `auto-file-session` step state
- **Location:** `apps/api/src/inngest/functions/auto-file-session.ts:71-76` (`step.run('fetch-transcript')` returns `formatTranscript(...)`); helper `formatTranscript` at lines 28-41.
- **Severity:** HIGH
- **Category:** Third-Party Sharing (memoized step return)
- **PII Type:** Minor's full learner+tutor transcript (joined string).
- **Data flow:** `step.run('fetch-transcript', …)` **returns** the joined transcript string (`Learner: … / Tutor: …`). A `step.run` return value is memoized into Inngest's third-party state store so it survives replay. The transcript is then only needed by the *next* step (`file-session`, line 87) which already opens its own DB connection. The transcript crosses the third-party boundary purely as a replay convenience.
- **Recommendation:** Do not return the transcript. Move `getSessionTranscript`/`formatTranscript` *inside* the `file-session` step closure (re-fetch from DB there), so the transcript stays a local variable and is never serialized. Keep only a boolean/`null` sentinel as the `fetch-transcript` step return if a "transcript unavailable" branch is still needed (or fold the availability check into `file-session`).

### 4. Minor's full session transcript memoized in `freeform-filing` step state
- **Location:** `apps/api/src/inngest/functions/freeform-filing.ts:152-159` (`step.run('fetch-transcript')` returns the joined transcript string).
- **Severity:** HIGH
- **Category:** Third-Party Sharing (memoized step return)
- **PII Type:** Minor's full learner+tutor transcript.
- **Data flow:** Same pattern as #3 — `step.run('fetch-transcript')` returns the joined transcript; the value is memoized in Inngest state, then consumed only by the `retry-filing` step (line 169) which opens its own DB. NOTE: the Scope Context cites `freeform-filing.ts:151-160` as the *mitigation* pattern for the H1 event-payload issue (it self-heals by re-fetching from DB instead of trusting an event field) — and it *is* correct that the transcript is no longer in the event. But the re-fetched value is **returned from the step**, so it still lands in memoized step state. The mitigation is incomplete for the step-state boundary.
- **Recommendation:** Same as #3 — re-fetch inside `retry-filing` and do not return the transcript from `fetch-transcript`. This also closes the residual step-state copy that the Scope Context's mitigation note does not cover.

---

## [PRE-EXISTING] — MEDIUM

### 5. Minor's transcript array memoized in `topic-probe-extract` `load-transcript` step
- **Location:** `apps/api/src/inngest/functions/topic-probe-extract.ts:176-179` (returns `history`, the `{ role, content }[]` array from `loadTopicProbeHistory`, lines 40-68).
- **Severity:** MEDIUM
- **Category:** Third-Party Sharing (memoized step return)
- **PII Type:** Minor's raw learner+tutor message content (full probe transcript).
- **Data flow:** `step.run('load-transcript')` returns the full `history` array; memoized into Inngest state. Consumed only by the next step `extract-signals` (line 184).
- **Recommendation:** Fold `loadTopicProbeHistory` into the `extract-signals` step closure so `history` is local; return only the extracted/parsed signals (which are already a lower-sensitivity summary, see #12).

### 6. Child names, struggle topics, and **parent email** memoized in weekly-progress-push prepare step
- **Location:** `apps/api/src/inngest/functions/weekly-progress-push.ts:851-861` (the `step.run('prepare-…')` `return { status: 'prepared', … childSummaries, struggleLines, parentEmail }`). Names sourced at line 668; struggle topics at 757-766; `parentEmail` resolved 833-848.
- **Severity:** MEDIUM
- **Category:** Third-Party Sharing (memoized step return)
- **PII Type:** Child display names (embedded in `childSummaries` strings like `"<Name>: +3 topics"` and in `struggleLines[].childName`), children's struggle topic titles (learning-difficulty data), and the **parent's email address** (`parentEmail`).
- **Data flow:** The prepare step returns these for use by the later `send-weekly-progress-push` / `send-weekly-progress-email` steps. The return value is memoized into Inngest's third-party state store. This is the same M2 class as the known progress-summary issue, but broader: it adds parent email + struggle topics.
- **Recommendation:** Return only `parentId`, `childProfileIds`, and non-PII flags/counts. Re-resolve names, struggle topics, and parent email from the DB inside the push/email steps (those steps already open a DB connection and re-query the active parent). Alternatively, persist the already-written `weeklyReports` row id and re-read it.

### 7. Child display name + struggle topics memoized in monthly-report-cron generate step
- **Location:** `apps/api/src/inngest/functions/monthly-report-cron.ts:475-481` (`return { status: 'completed', childDisplayName, … struggleTopics, … }`); name at 381-383, struggles at 453-465.
- **Severity:** MEDIUM
- **Category:** Third-Party Sharing (memoized step return)
- **PII Type:** Child display name + children's struggle topic titles.
- **Data flow:** Step return memoized into Inngest state; `childDisplayName` re-used at line 561 (`'<Name>'s monthly report is ready'` push title).
- **Recommendation:** Return ids + a re-fetch token; resolve `childDisplayName` and struggle topics inside the push/email steps. (Known sweep-list site — confirmed it does memoize PII.)

### 8. Child name + knowledge inventory memoized in progress-summary gather-context step *(known M2)*
- **Location:** `apps/api/src/inngest/functions/progress-summary.ts:83-93` (`return { status: 'ok', childName: profile.displayName, … inventory, … }`); consumed at 113-129.
- **Severity:** MEDIUM
- **Category:** Third-Party Sharing (memoized step return)
- **PII Type:** Child display name (`childName`) plus the knowledge `inventory` (subject names + topic titles forming the minor's learning profile).
- **Data flow:** `gather-context` step return memoized in Inngest state; consumed by `generate-summary` (line 105-118) which re-opens a DB connection anyway and re-checks consent.
- **Recommendation:** Return `profileId` + `latestSessionId` only; re-fetch `displayName`, `conversationLanguage`, and rebuild `inventory` inside `generate-summary` (it already re-queries for the consent re-check at line 109-110). This is the canonical known M2 finding — confirmed present.

### 9. Minor's display name + **birth year** memoized in consent-revocation
- **Location:** `apps/api/src/inngest/functions/consent-revocation.ts:112-115` (`step.run('load-child-profile')` returns `getProfileForConsentRevocation(...)`); return shape `{ displayName, birthYear, archivedAt }` per `apps/api/src/services/consent.ts`. Consumed: `birthYear` at line 132 (`calculateAge`), `displayName` at line 224 (push body).
- **Severity:** MEDIUM
- **Category:** Third-Party Sharing (memoized step return)
- **PII Type:** Minor's display name + **birth year** (DOB-equivalent / COPPA-relevant age data).
- **Data flow:** The whole child profile slice (name + birth year) is returned from `load-child-profile` and memoized in Inngest state. Particularly sensitive because this is a child-account-deletion flow and birth year drives the COPPA-boundary delete-vs-archive decision (line 139-142).
- **Recommendation:** Return only a boolean "profile exists" plus `childProfileId`. Re-fetch `birthYear` inside `choose-final-action` (line 121) and `displayName` inside `notify-parent-archived` (line 210) — both already open DB connections.

### 10. Minor's struggle topics round-trip through session-completed step state
- **Location:** `apps/api/src/inngest/functions/session-completed.ts:1490` (`return { ...outcome, notifications: stepNotifications }`); re-read at line 1596 (`analyzeOutcome.notifications`). `StruggleNotification` = `{ type, topic, subject }` (`apps/api/src/services/learner-profile.ts:140-144`).
- **Severity:** MEDIUM
- **Category:** Third-Party Sharing (memoized step return)
- **PII Type:** Minor's struggle topic free-text + subject name (learning-difficulty data).
- **Data flow:** The `analyze-learner-profile` step returns `notifications[]` (each carrying a struggle `topic` string) so the array survives Inngest replay (the comment at 1359-1361 explains the deliberate memoization). It is re-read at 1596 to drive the `notify-struggle` step. The struggle topics are thereby persisted in Inngest's third-party state store.
- **Recommendation:** Persist the struggle notifications to a DB table (or rely on `learningProfiles.struggles`, which `applyAnalysis` already writes) and have the `notify-struggle` step re-read them by `profileId`, rather than carrying the topic strings in the step return. If the memoization is kept for replay-safety, return only the *count* and notification *types*, then re-fetch the topic text inside `notify-struggle`.

---

## [PRE-EXISTING] — LOW

### 11. User feedback free-text + support email in `app/feedback.delivery_failed` event payload
- **Location:** `apps/api/src/inngest/functions/feedback-delivery-failed.ts:26-31` (`eventDataSchema` extends `feedbackSubmissionSchema` with `supportTo: z.string().email()`, `metaLines`, and inherits `message`); consumed 71-81, email body 177.
- **Severity:** LOW
- **Category:** Third-Party Sharing (Inngest event-store persistence)
- **PII Type:** User's free-text feedback `message`, `supportTo` email, device `metaLines`.
- **Data flow:** This is a *retry* of a failed support-email send; the original route already serialized the feedback `message` + `supportTo` into the `app/feedback.delivery_failed` event, which Inngest persists. Lower severity than learning data: user-initiated support content the user knows is being emailed to support. Logging here is already shape-only (lines 144-153, 159-165 log only `profileId/userId/category`, never `message`) — good.
- **Recommendation:** Acceptable as a retry-fidelity tradeoff, but consider persisting the failed feedback to a short-TTL DB row and carrying only its id in the event, re-reading inside `retry-delivery`. Note the email body assembly is intended (it goes to support).

### 12. Inferred learner signals memoized in topic-probe-extract
- **Location:** `apps/api/src/inngest/functions/topic-probe-extract.ts:184-186` (`extractedSignals` returned from `step.run('extract-signals')`); also persisted to `learningSessions.metadata` at 236-273 (durable, intended).
- **Severity:** LOW
- **Category:** Third-Party Sharing (memoized step return)
- **PII Type:** Inferred goals/interests/current-knowledge derived from a minor's free-text (a summary, not raw text).
- **Data flow:** Returned and memoized in Inngest state. These are LLM-derived summary signals (lower sensitivity than raw transcript), and the same data is durably written to session metadata by design.
- **Recommendation:** Low priority. If #5 is fixed (history not returned), consider also returning only a signal count and re-reading `extractedSignals` from `learningSessions.metadata` in any downstream step.

---

## Known Sweep List Verification

The Scope Context named a sweep list for the M2 (PII-in-step-state) class. Verified each:

| Sweep site | Verdict | Notes |
|---|---|---|
| `progress-summary.ts:85` (childName) | **CONFIRMED leak** | Finding #8. Plus `inventory` in same return. |
| `weekly-progress-push.ts` | **CONFIRMED leak (worse than listed)** | Finding #6 — return also includes `parentEmail` + struggle topics, not just a name. |
| `weekly-self-reports.ts` | **CLEAN** | `step.run` return (lines 336-340) is `{ profileId, reportWeek }` only. `profile.displayName` is a *local* var used to build `reportData` written to DB (intended); not in the step return. Fan-out event (419-425) carries ids only. |
| `recall-nudge-send.ts:139` (childName) | **CLEAN** | `childName` (line 118-130) is a *local* var used only to format the push message body; the `step.run` returns (151-162) carry no name. The suppressed-event payload (175-181) is ids only. |
| `session-completed.ts:1120` | **CLEAN** | `displayName` (line 1075, 1120) is a *local* var passed to `buildBrowseHighlight`; the highlight is written to DB and the step returns nothing. Not memoized. (Separate real leak found at 1490 — Finding #10.) |
| `monthly-report-cron.ts` | **CONFIRMED leak** | Finding #7 — `childDisplayName` + `struggleTopics` in step return. |

Additional M2-class sites found beyond the list: `consent-revocation.ts:112-115` (#9), `topic-probe-extract.ts:176-179` (#5), `session-completed.ts:1490` (#10).

## Verified-Clean Highlights (defenses working as intended)
- **Email masking (SEC-6/BUG-722):** `resend-webhook.ts:235` masks the email (`maskEmail` → `j***@gmail.com`, `resend-webhook.ts:202-206`) **before** it enters the `app/email.bounced` event. `email-bounced-observe.ts:63-69` therefore only ever logs a masked address. Clean.
- **Transcript-purge subsystem (Scope item 6):** `transcript-purge-cron.ts` selects and fan-outs only `{ sessionSummaryId, sessionId, profileId }` (lines 60-89, 124-131); the purge job is NOT re-persisting purged transcript content. Clean.
- **Billing observers:** `payment-failed-observe.ts:65-73` and `billing-trial-subscription-failed.ts` log only opaque ids (`subscriptionId`, `stripeSubscriptionId`, `accountId`, `attempt`); their event schemas contain no name/email. Even the `rawData: event.data` schema-drift logs (payment-failed-observe.ts:56, email-bounced-observe.ts:42/48) are id-only / pre-masked. Clean.
- **session-completed vocabulary/insights/recap steps:** transcripts and `displayName`/`birthYear` are *local* vars inside step closures (lines 762-792, 1030-1124, 1167-1194), passed to LLM/DB and never returned. Clean.
- **summary-reconciliation-cron `...row` spreads** (157-198): the projected rows are id-only (`sessionId`/`profileId`/`subjectId`/`topicId`). Clean.
- **consent-revocation / account-deletion / quota-reset / streak-record / daily-snapshot** event payloads: ids/dates/counts only.

---

## Coverage Note

**Source files examined (all 59 function files + client/helpers/index reviewed for `send`/`step.run`-return PII):**
Read in depth: `auto-file-session.ts`, `freeform-filing.ts`, `ask-silent-classify.ts`, `topic-probe-extract.ts`, `progress-summary.ts`, `weekly-progress-push.ts`, `weekly-self-reports.ts`, `monthly-report-cron.ts`, `recall-nudge-send.ts`, `session-completed.ts`, `consent-revocation.ts`, `feedback-delivery-failed.ts`, `email-bounced-observe.ts`, `payment-failed-observe.ts`, `billing-trial-subscription-failed.ts`, `transcript-purge-cron.ts`, `transcript-purge-observe.ts`, `summary-reconciliation-cron.ts`.
Grep-swept for `data:` payloads, `displayName/childName/email/birthYear/transcript/content/quote/rawInput`, whole-object spreads in returns/payloads, and `logger`/`captureException` PII across: all remaining files — `account-deletion`, `archive-cleanup`, `ask-classification-observe`, `ask-gate-observe`, `book-pre-generation`, `consent-reminders`, `daily-reminder-scan`, `daily-reminder-send`, `daily-snapshot`, `exchange-empty-reply-fallback`, `filing-completed-observe`, `filing-observe`, `filing-stranded-backfill`, `filing-timed-out-observe`, `memory-facts-backfill`, `memory-facts-embed-backfill`, `needs-deepening-expire-pending`, `notification-suppressed-observe`, `notify-parent-child-cap-hit`, `orphan-persist-failed`, `post-session-suggestions`, `quota-reset`, `recall-nudge`, `review-calibration-grade`, `review-due-scan`, `review-due-send`, `session-completed-observe`, `session-stale-cleanup`, `streak-record`, `subject-auto-archive`, `subject-prewarm-curriculum`, `subject-retry-curriculum`, `summary-regenerate`, `summary-reconciliation-observe`, `topup-expiry-reminder`, `topup-expiry-reminder-send`, `trial-expiry`, `trial-expiry-failure-observe`, `webhook-idempotency-purge`, `filing-timed-out-observe`, `subject-prewarm-curriculum`, `monthly-report-cron`, `client.ts`, `helpers.ts`, `index.ts`.
Direct dependencies read for return-shape confirmation: `services/consent.ts` (getProfileForConsentRevocation), `services/learner-profile.ts` (StruggleNotification), `routes/resend-webhook.ts` (maskEmail), `services/session/session-exchange.ts` (event dispatch sites), `packages/schemas/src/inngest-events.ts` (topic-probe + payment + streak schemas).

**Boundary owned per Scope:** privacy / PII-exposure / third-party persistence of PII (including cross-user PII exposure). Pure authZ / cross-tenant-scope / injection left to the security reviewer. The parent-chain authZ guards observed (e.g. consent-revocation.ts:168-183, session-completed.ts:1412-1426) were noted as functioning but not audited for completeness here.

## ERROR / Tooling Note
The shell's `rg` is hook-rewritten and the `rtk` proxy rewrote several identifier tokens in command *output* (e.g. `classifyInput`→`n`, `buildKnowledgeInventory`→`ln`, `classify_silently`→`ln`). This affected only displayed grep output, not file contents; all load-bearing findings were confirmed by reading the actual source files with the Read tool, so no finding rests on a mangled token.
