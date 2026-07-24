# Security Reviewer — Inngest Background-Job Surface

**Scope:** `apps/api/src/inngest/` (client.ts, helpers.ts, index.ts + 57 function files under functions/) plus their direct service/DB dependencies, in `eduagent-build`. Path-scoped audit; **all findings classified `[PRE-EXISTING]`.** Threat focus per scope context: (1) tenant scope re-established from event payload, (2) who can dispatch, (3) consent re-checks for minors' data, (4) webhook-originated privilege, (5) secrets/config, (6) destructive crons, (7) fan-out id injection.

## Executive summary

**This surface is well-hardened — materially better than a typical background-job tier.** The team has clearly internalized the forged/replayed-event threat model: multiple functions carry explicit comments stating that the event "is replayable/operator-controlled, so [the id] alone cannot prove ownership," and they bound every leaf query by `profileId`/parent-chain accordingly (`recall-nudge-send.ts:79-107`, `review-due-send.ts:103-108`, `freeform-filing.ts:49-58` "M8a" guard, `consent-revocation.ts:161-183` parent-chain archive guard).

Across the destructive/scope-sensitive functions I read, the dominant pattern is correct:
- DB reads/writes re-derive scope from the **event's** `profileId` via `createScopedRepository(profileId)` or an explicit parent-chain predicate (`subjects.profileId = profileId`), never trusting sibling ids blindly.
- Destructive crons are bounded by `profileId`/age/retention predicates with no unbounded bulk deletes.
- User-reachable event producers (`app/filing.retry`, `app/session.completed`, `app/account.deletion-scheduled`, `app/consent.revoked`) all derive `profileId`/`accountId` from the **authenticated** context (`requireProfileId(c.get('profileId'))`, `requireAccount`), with `assertOwnerProfile` on privileged actions and ownership verified before dispatch.
- Webhook-reactive Inngest functions are **observe-only**; entitlement mutation happens in the signature-verified webhook handler (request path), and the events carry DB-resolved (not raw-webhook) `accountId`.
- No secrets are logged; config is read via injected bindings with `process.env` fallback only for the Node test path (acceptable per architecture).

The findings below are residual **defense-in-depth** gaps — places where a *forged or buggy internal Inngest event* (not normal user input) could cause a cross-tenant effect because a consumer trusts a payload pairing its producer validated but the consumer does not re-validate. None are directly user-exploitable through the request path given the current producers. They matter because Inngest events are replayable/retriable and the rest of this surface defends at *both* producer and consumer; these two consumers defend only at the producer.

---

## [PRE-EXISTING] Findings

### MEDIUM — Authorization (cross-tenant defense-in-depth)

**1. `recordChildCapNotificationForSubscription` does not re-verify the child belongs to the subscription's account**
**Location:** `apps/api/src/services/child-cap-notifications.ts:178-189` (consumed by `apps/api/src/inngest/functions/notify-parent-child-cap-hit.ts:20-28`)

The handler for `app/billing.profile_quota.exhausted` takes `subscriptionId` and `childProfileId` from the event payload. The service resolves `ownerProfileId` from `subscriptionId` (`findOwnerProfileIdBySubscription`, lines 59-72) but then inserts a `childCapNotifications` row pairing that owner with `input.childProfileId` **without checking that `childProfileId` belongs to the same account/subscription**. `listActiveChildCapNotifications` (lines 117-141) later joins `profiles.displayName` on that `childProfileId` and shows it to the owner.

**Attack scenario (forged/replayed internal event):** A `app/billing.profile_quota.exhausted` event with `subscriptionId` = Account A's subscription and `childProfileId` = a profile from Account B would record a notification on Account A's owner that renders Account B's child `displayName` ("learner X hit their cap"). That is a minor-PII cross-tenant leak into a parent's UI.

**Why not CRITICAL/HIGH:** The sole producer (`services/billing/metering.ts:34-58` `emitChildQuotaExhaustedEvent`) is reached only after the metering path validates the profile belongs to the subscription — the join at `metering.ts:146-150` (`subscriptions.id = subscriptionId AND profiles.id = profileId`) returns `profile_mismatch` and an `app/billing.ownership.mismatch` signal instead of emitting. So through the request path the pairing is sound. The gap is purely that the *consumer* re-trusts a pairing only the *producer* validated, in a surface where every comparable consumer re-validates.

**Fix:** Re-establish the parent-chain at the consumer. In `recordChildCapNotificationForSubscription`, verify the child belongs to the subscription's account before inserting:
```ts
// after resolving ownerProfileId from subscriptionId:
const [child] = await db
  .select({ id: profiles.id })
  .from(profiles)
  .innerJoin(subscriptions, eq(subscriptions.accountId, profiles.accountId))
  .where(and(
    eq(profiles.id, input.childProfileId),
    eq(subscriptions.id, input.subscriptionId),
  ))
  .limit(1);
if (!child) return { inserted: false, reason: 'child_not_in_account' };
```
Add a negative-path ("break") test per CLAUDE.md Fix Development Rules: emit the event with a mismatched `(subscriptionId, childProfileId)` and assert no row is inserted.

---

**2. `monthlyReportGenerate` trusts the `(parentId, childId)` pair from the event without re-verifying the family link**
**Location:** `apps/api/src/inngest/functions/monthly-report-cron.ts:256-449, 532-643`

The per-pair handler reads `parentId`/`childId` from `app/monthly-report.generate` and proceeds to (a) generate a report over the child's snapshots/struggles and (b) **email the child's `displayName` + struggle topics to the parent's account email** (lines 598-643). It re-checks `isGdprProcessingAllowed(db, childId)` (good, line 271) and that both profiles exist/are unarchived, but it never re-confirms that `childId` is actually linked to `parentId` in `familyLinks`. It trusts the pair the cron emitted.

**Contrast with the sibling job:** `weeklyProgressPushGenerate` does the right thing — given only `parentId`, it **re-derives** the children from `familyLinks WHERE parentProfileId = parentId` (`weekly-progress-push.ts:583-586`) and re-checks consent per child, so a forged event can only reach that parent's own children. `monthlyReportGenerate` instead accepts both ids and is therefore weaker by exactly the link check.

**Attack scenario (forged/replayed internal event):** `app/monthly-report.generate` with `{ parentId: A_owner, childId: B_child }` would email Account B's child name + struggle topics to Account A's email. (`app/monthly-report.generate` has no request-path producer — it is internal cron fan-out only — so this requires forging/replaying an internal event, not user input.)

**Fix:** Before generating, verify the link (skip self-reports where `parentId === childId`):
```ts
if (!isSelfReport) {
  const link = await db.query.familyLinks.findFirst({
    where: and(
      eq(familyLinks.parentProfileId, parentId),
      eq(familyLinks.childProfileId, childId),
    ),
  });
  if (!link) return { status: 'skipped', reason: 'not_linked', parentId, childId };
}
```
Mirror the `weeklyProgressPushGenerate` pattern. Add a test asserting an unlinked pair produces `skipped: not_linked` and sends no email.

---

### LOW — Authorization (consistency / defense-in-depth)

**3. Consent-revocation *delete* branch lacks the parent-chain account guard the *archive* branch has**
**Location:** `apps/api/src/inngest/functions/consent-revocation.ts:280-289` → `services/deletion.ts:283-313` (`deleteProfileIfConsentWithdrawn`)

The archive branch (lines 168-183) added an explicit defense-in-depth guard after BUG-662: `AND account_id = (SELECT account_id FROM profiles WHERE id = parentProfileId)`, precisely so a "corrupted/replayed Inngest event with mismatched (childProfileId, parentProfileId)" cannot archive a profile that isn't in the event-parent's account. The **delete** branch calls `deleteProfileIfConsentWithdrawn(childProfileId, revokedAt)`, which scopes deletion only by the child's own `consent_states` (GDPR/WITHDRAWN + matching `responded_at`) — it does **not** carry the same `account_id = parent's account_id` predicate.

**Why LOW:** The only producer (`routes/consent.ts:448-464`) calls `revokeConsent(db, childProfileId, parentProfileId)` — which validates the parent→child relationship and sets the WITHDRAWN consent row — before the event fires, and the function re-checks revocation generation currency. A forged event would also need a real GDPR-WITHDRAWN consent row on the target child at the matching timestamp, which the legitimate flow only creates for genuinely-owned children. So practical exploitability is low. But the asymmetry means a future refactor could weaken the delete path silently, and the archive branch already documents why the guard is wanted.

**Fix:** Add the same account-match predicate to `deleteProfileIfConsentWithdrawn` (pass `parentProfileId` and add `AND account_id = (SELECT account_id FROM profiles WHERE id = ${parentProfileId})` to the DELETE), bringing both branches to parity. Per CLAUDE.md "Sweep when you fix," do both branches in one PR or document a deferred sweep.

---

### LOW — Configuration (concurrency / state isolation)

**4. Env bindings stored in module-level singletons may bleed across concurrent function runs in one isolate**
**Location:** `apps/api/src/inngest/helpers.ts:13,75-79,154,182-183,222-223` and `client.ts:25-88`

`setDatabaseUrl`/`setVoyageApiKey`/`setResendApiKey`/`setEmailFrom`/`setAppUrl`/`setSupportEmail`/`setRetentionPurgeEnabled`/`setMemoryFactsDedupConfig` write to **module-level `let` variables**, set per-invocation by `onFunctionRun` middleware (`client.ts:33-73`). The DB *connection* is correctly request-isolated via `AsyncLocalStorage` (`stepDatabaseScope`), but the config *values* are plain module globals. On Cloudflare Workers an isolate can service overlapping invocations; if two runs from different environments/bindings interleave, a later `setDatabaseUrl` can overwrite the value a concurrent run will read in a subsequent step.

**Why LOW (not HIGH):** In practice all Inngest functions in a single Worker deployment share one environment's bindings (same `DATABASE_URL`, same keys), so a cross-invocation overwrite resolves to the *same* values — there is no cross-tenant DB leak today because tenancy is enforced by `profileId` in queries, not by the connection. The risk is latent: it becomes real only if a single isolate is ever asked to serve more than one environment's bindings, or if a new binding becomes tenant-specific. It is also a correctness/observability hazard (e.g. `MEMORY_FACTS_DEDUP_*` config read by the wrong run).

**Fix:** Carry the env values through `AsyncLocalStorage` the same way `stepDatabaseScope` already does, rather than module-level `let`s — or assert the binding matches an expected per-deployment value. At minimum, document the single-environment-per-isolate assumption next to the singletons so a future multi-tenant-binding change doesn't silently break isolation.

---

## Things explicitly checked and found SOUND (no action)

These are recorded so a future reviewer knows they were examined, not skipped:

- **Account deletion** (`functions/account-deletion.ts` + `services/deletion.ts:213-277`): bounded by `accounts.id`; atomic TOCTOU guard mirrors the cancellation predicate inside the DELETE (`executeDeletion`); idempotency + concurrency(1). Producer `routes/account.ts:53-80` uses `requireAccount` + `assertOwnerProfile`; `accountId` is auth-derived. **Correct.**
- **Transcript purge** (`functions/transcript-purge-cron.ts` + `services/transcript-purge.ts`): every read/write WHERE carries `profileId AND sessionSummaryId`; child deletes use `sessionId` taken from the *verified* row + `profileId`; forged/mismatched pair hits `if (!row)` skip. Cron candidate scan bounded by `purgedAt IS NULL` + age cutoff. **Correct.**
- **Archive cleanup** (`functions/archive-cleanup.ts`): single `profileId`, consent + `archivedAt` + retention-window guards before `deleteProfile`. **Correct.**
- **Webhook idempotency purge** (`functions/webhook-idempotency-purge.ts`): global non-tenant table, bounded by `receivedAt < cutoff`. **Correct.**
- **Quota reset** (`functions/quota-reset.ts`): cron, no event input; resets bounded by billing-cycle/`used_today` predicates inside one transaction. **Correct.**
- **freeform-filing** (`functions/freeform-filing.ts:39-64`): "M8a/M8b" — loads session via `createScopedRepository(profileId)` and **throws** on cross-profile/missing; all writes scoped. Producers (`routes/filing.ts:69-110`, `routes/sessions.ts:300-352`) auth-derive `profileId` and verify `getSession(db, profileId, sessionId)` before dispatch. **Exemplary.**
- **session-completed** (`functions/session-completed.ts`): scopes by event `profileId`, `createScopedRepository`, parent-chain topics→books→`subjects.profileId`, re-checks `isGdprProcessingAllowed`; memoryFacts/summaries updates double-scope `profileId`. **Correct.**
- **review-calibration-grade / subject-retry-curriculum / topic-probe-extract / ask-silent-classify / filing-completed-observe / memory-facts-backfill**: all mutations scope by `profileId` (or parent-chain via `loadBook` which verifies `subjects.profileId = profileId`). `subject-retry-curriculum` re-checks consent. **Correct.**
- **review-due-send / recall-nudge-send / review-due-scan / weekly-progress-push**: topic-title resolution bounded by `eq(subjects.profileId, profileId)`; push targets the event `profileId`; consent re-checked; cron producers derive `topTopicIds` from per-profile joins. The send handlers re-scope even though the producers already filter — defense at both ends. **Exemplary.**
- **Webhook-reactive billing** (`functions/payment-failed-observe.ts`, `billing-trial-subscription-failed.ts`, `trial-expiry-failure-observe.ts`): observe/log only; entitlement mutation lives in the signature-verified webhook handlers (`services/billing/stripe-webhook-handler.ts:517-529`, `revenuecat-webhook-handler.ts:445-456`), whose events carry DB-resolved `accountId` (`updated.accountId`), not raw webhook fields. **Correct.**
- **Secrets/logging:** No API key/secret/token is logged anywhere in `inngest/`. `consent-reminders.ts:66` explicitly fetches the consent token from the DB ("never from event payload — PII") and refreshes it; the Inngest webhook signing key is enforced by the framework + `env-validation` middleware (`routes/inngest.ts:11-21`). `helpers.ts` reads `process.env` only as a documented Node-test fallback behind injected bindings.

---

## Coverage note (honest, time-boxed)

**Read in full or near-full (24 of 57 function files), prioritizing destructive crons, webhook-reactive jobs, scope-from-event correctness, and minor-data/export/notification jobs per the scope brief:**
`client.ts`, `helpers.ts`, `routes/inngest.ts`; `account-deletion.ts`, `archive-cleanup.ts`, `transcript-purge-cron.ts`, `webhook-idempotency-purge.ts`, `quota-reset.ts`, `consent-revocation.ts`, `monthly-report-cron.ts`, `weekly-progress-push.ts`, `freeform-filing.ts`, `session-completed.ts` (key sections), `review-calibration-grade.ts`, `subject-retry-curriculum.ts`, `topic-probe-extract.ts` (mutations), `ask-silent-classify.ts`, `filing-completed-observe.ts`, `memory-facts-backfill.ts`, `review-due-send.ts`, `recall-nudge-send.ts`, `review-due-scan.ts`, `notify-parent-child-cap-hit.ts`, `billing-trial-subscription-failed.ts`. Plus dependency services: `deletion.ts`, `transcript-purge.ts`, `child-cap-notifications.ts`, `billing/metering.ts`, `billing/stripe-webhook-handler.ts` + `revenuecat-webhook-handler.ts` (dispatch sites), and producers `routes/account.ts`, `routes/consent.ts`, `routes/filing.ts`, `routes/sessions.ts` (dispatch sites).

**Cross-checked by grep but not line-by-line read (33 files):** the `*-observe` observability handlers (`ask-classification-observe`, `ask-gate-observe`, `email-bounced-observe`, `filing-observe`, `filing-timed-out-observe`, `notification-suppressed-observe`, `orphan-persist-failed`, `payment-failed-observe`, `session-completed-observe`, `summary-reconciliation-observe`, `trial-expiry-failure-observe`, `transcript-purge-observe`, `feedback-delivery-failed`), the remaining cron/notification/backfill jobs (`auto-file-session`, `book-pre-generation`, `consent-reminders`, `daily-reminder-scan`, `daily-reminder-send`, `daily-snapshot`, `memory-facts-embed-backfill`, `monthly-report` self-report path, `needs-deepening-expire-pending`, `post-session-suggestions`, `progress-summary`, `recall-nudge`, `review-due-scan` send side, `session-stale-cleanup`, `streak-record`, `subject-auto-archive`, `subject-prewarm-curriculum`, `summary-reconciliation-cron`, `summary-regenerate`, `topup-expiry-reminder(-send)`, `trial-expiry`, `weekly-self-reports`). These were screened for: raw `db.update`/`db.delete` WHERE-clause scoping, secret/token logging, `event.data` id usage, and consent imports. None surfaced a WHERE-clause missing `profileId`/parent-chain or a logged secret in the grep pass, but they were not individually read end-to-end.

**Residual-risk note:** The two MEDIUM findings (child-cap-notification and monthly-report) are the same *class* — a fan-out consumer trusting a producer-validated id pairing without re-validating. I targeted that class deliberately; a couple of the un-read `*-send`/notification handlers could share it. If a follow-up pass is warranted, grep `functions/` for handlers that read **two** ids from `event.data` (a parent/owner id *and* a child/target id) and write or transmit based on both without an intervening `familyLinks`/`account_id`/`profileId`-join check — that is the highest-yield next query.

## ERROR section
None. All intended files were read successfully; no tool failures affected coverage.
