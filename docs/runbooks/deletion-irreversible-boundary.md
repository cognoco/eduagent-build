# Deletion Irreversible Boundary — Runbook

> Scope: account (organization) deletion via `POST /account/delete` →
> `scheduledDeletion` Inngest function → `executeDeletionV2`. Written against
> post-WI-1985 behavior (guardianship/supportership edge teardown extended to
> every hard-delete path, not just whole-org erasure).
>
> This runbook governs **server-side** subject erasure only — the DB hard-delete
> transaction plus the external Clerk-login and subscription-store teardown legs.
> It does **not** cover on-device client cache lifecycle (the mobile
> query-persister / sign-out purge) or telemetry payload scrubbing; those govern
> different surfaces, and none of the irreversible-boundary claims below depend
> on their behavior.

## Boundary Summary Table

| Stage | Reversible? | Trigger / mechanism |
|---|---|---|
| Deletion scheduled | **Reversible** | `POST /account/delete` → `scheduleDeletionV2` stamps `organization.deletionScheduledAt` (`apps/api/src/routes/account.ts:157-193`) |
| 7-day grace period | **Reversible** | `step.sleep('grace-period', '7d')` (`apps/api/src/inngest/functions/account-deletion.ts:96`) |
| Grace-period cancel | **Reversible** (this IS the reversal) | `POST /account/cancel-deletion` → `cancelDeletionV2` stamps `deletionCancelledAt` (`apps/api/src/routes/account.ts:260-289`, `apps/api/src/services/identity-v2/deletion-v2.ts:204-226`) |
| Resume-time cancellation check | **Reversible** (last checkpoint) | `isDeletionCancelledV2` step, and the atomic TOCTOU-guarded claim inside `executeDeletionV2` (`account-deletion.ts:134-141`; `deletion-v2.ts:378-417`) |
| **DB hard-delete transaction commits** | **IRREVERSIBLE from commit** | `executeDeletionV2` (`account-deletion.ts:162-170` calls `deletion-v2.ts:358-552`) |
| Retained artifacts (written inside the same tx) | N/A — survive by design | `consent_receipt`, `financial_record`, `deletion_audit` (see below) |
| External Clerk login erasure | **Irreversible, best-effort** | `delete-clerk-user` step (`account-deletion.ts:200-207`) → `deleteClerkUser` (`apps/api/src/services/clerk-user.ts:251-321`) |
| External subscription-store teardown (Stripe / RevenueCat) | **Irreversible, best-effort** | `app/billing.subscription_store_teardown_requested` → `billing-subscription-store-teardown.ts` |

The single hard line is the commit of the `executeDeletionV2` transaction. Everything
before it can be undone by the user (cancel deletion); everything the transaction
does, and everything after it, cannot.

---

## 1. Reversible: schedule and grace period

`POST /account/delete` never deletes anything itself — it stamps
`deletionScheduledAt` and dispatches `app/account.deletion-scheduled`
(`apps/api/src/routes/account.ts:170-193`). The `scheduledDeletion` Inngest
function then sleeps 7 days (`account-deletion.ts:96`, `GRACE_PERIOD_DAYS = 7`
in `deletion-v2.ts:104`). At any point in this window `POST
/account/cancel-deletion` (`account.ts:260-289`) stamps
`deletionCancelledAt` and the account is never touched.

On resume, the function re-checks cancellation (`isDeletionCancelledV2`,
`account-deletion.ts:134-141`) and `executeDeletionV2` re-checks it again,
atomically, inside its own transaction via a TOCTOU-guarded `UPDATE …
WHERE deletionScheduledAt IS NOT NULL AND (cancelled IS NULL OR cancelled <=
scheduled)` claim (`deletion-v2.ts:378-417`). A cancel that races the delete
either wins (the claim matches 0 rows → `'cancelled'` is returned, nothing is
touched) or loses (the claim already committed) — there is no window where a
cancel can partially undo a delete.

## 2. Irreversible: the DB hard-delete transaction

`executeDeletionV2` (`deletion-v2.ts:358-552`) is one Postgres transaction. Once
it commits, the following happens atomically and cannot be rolled back by any
in-app action:

- Guardianship + supportership edges incident to every person in the org are
  hard-deleted (`deletion-v2.ts:426-463`) — no retain tier; a relationship to
  an erased person no longer exists (MMT-ADR-0026).
- The org's `subscription` row(s) are hard-deleted (`deletion-v2.ts:470-482`,
  Step G1) — required to satisfy `ON DELETE RESTRICT` before the person/org
  drop. `subscription_payers` cascades off it.
- Per person: live `consent_grant` rows are re-homed to `consent_receipt`
  (`deletion-v2.ts:484-513`), `financial_record` rows are written
  (`deletion-v2.ts:515-522` → `writeFinancialRecordsTx`,
  `deletion-v2.ts:1056-1085`), a `deletion_audit` row is written
  (`deletion-v2.ts:524-530`), then the `person` row is hard-deleted
  (`deletion-v2.ts:532-536` — cascades `consent_request`, `membership`,
  `login`, learning data).
- The now-childless `organization` row is hard-deleted (`deletion-v2.ts:540`).
- The `byok_waitlist` row matching the owner's pre-read email is erased
  (`deletion-v2.ts:542-548` — GDPR Art-17 leg D2).

The same person-scoped edge teardown (WI-1985) is also wired into every
single-person hard-delete path — `deletePersonV2`, `deletePersonIfConsentWithdrawnV2`,
`deletePersonIfNoConsentV2`, `deleteArchivedPersonIfStillEligibleV2` — via
`tearDownPersonEdgesTx` (`deletion-v2.ts:937-957`, called at lines 590, 659,
758, 819). Before WI-1985 this teardown only ran on the whole-org path; a
managed child (always sitting on a guardianship edge) would FK-violate and
roll back the statutory auto-erasure pipelines (consent-withdrawal, day-30
no-consent, archived-cleanup). Post-WI-1985, every hard-delete path — org-wide
or person-scoped — tears down its incident edges first.

### Consent-DENY is abort-based over any live grant

A consent **denial** (`processConsentResponseV2` deny branch,
`consent-v2.ts:697-760`) hard-deletes the charge person by cascade — but only
when the person holds **no** live `consent_grant`. Unlike the erasure paths,
the deny path does **not** re-home grants first, so it leans on the
`consent_grant.charge_person_id ON DELETE RESTRICT` FK (`deletion-v2.ts:9-10`):
if any live grant still exists, that FK aborts the whole deny transaction before
the person can be deleted (`consent-v2.ts:744-753` documents this fail-safe).

Operator-ruled canon (WI-1193 / WI-1442 AC-4, **Option B**): **a deny never
deletes a person who holds any live grant — same lawful basis included**, not
only a different-basis grant (the earlier WI-1442 guardrail aborted only on a
different basis; Option B removed WI-1193's unconditional same-basis re-home, so
both now abort). The only flows that delete a live-grant holder are the
**deliberate withdrawal / erasure** paths, which migrate the grant to
`consent_receipt` first (`deletion-v2.ts:484-513`); a DENY migrates nothing and
aborts instead. Rationale: guardian-addressed consent tokens cannot target a
self-consenting adult, and the irreversibility asymmetry favors fail-closed —
do not delete on denial while consent evidence is still live.

## 3. What survives deletion — retained artifacts

These rows are written **inside** the same transaction that deletes the
person/org, and are the only state that outlives the erasure:

| Table | Written at | Retention period | Purpose |
|---|---|---|---|
| `consent_receipt` | Re-homed from `consent_grant` before the grant is deleted (`deletion-v2.ts:484-513`) | `NULL` — counsel-owned, not yet set (§4.9) | GDPR consent-history receipt; the assurance token is dropped at re-home time |
| `financial_record` (×2 per person: `person_deletion_tax_retain`, `person_deletion_chargeback_retain`) | `deletion-v2.ts:1056-1085` | `NULL` — counsel-owned, provisional | Tax / chargeback retain-tier; carries a JSON snapshot of the org's subscriptions at delete time. No FK to person/org (survives by construction) |
| `deletion_audit` | One row per deleted person (`deletion-v2.ts:524-530`) | `NULL` — counsel-owned | `deleted_by` (nullable) + `reason` (`user_initiated` / `guardian_initiated` / `abandonment`) audit trail |

All three retention periods are explicitly left `NULL` pending counsel — the
code comments (`deletion-v2.ts:43-46`, `:1046-1049`) are explicit that this is
provisional, not an oversight; do not treat `NULL` as "forever" or "never" in
an incident response.

**Not retained** (hard-deleted, no retain tier): guardianship/supportership
edges, the `subscription` row(s), the `person`/`organization` rows themselves,
and the matching `byok_waitlist` row.

### Design constraint: the deletion record must survive a DB restore (Q6 deletion supremacy)

All three retained artifacts above are written **inside the same Postgres
transaction** and therefore live in the **same database**. That makes them
durable against any in-app reversal (Section 2) but **not** against a database
point-in-time (PITR) restore: restoring the database to a moment before the
deletion rolls the whole DB back — including these records — so a deleted
person/org would be resurrected and the `deletion_audit` proving the erasure
would vanish with it. The current deletion record is **inside** the restore
blast radius.

Operator-ruled canon (Canon-pass Q6, deletion supremacy): the deletion record
must be **durable outside the DB-restore blast radius**, so that any deletion
recorded since a restore point can be **re-applied** after a restore rather than
silently undone. `WI-2056` (post-restore deletion replay) and `WI-2057` (future
deletion primitives) are the intended consumers of such a record; `WI-2390`
(T3 deletion-recovery hardening) is the adjacent hardening item — reconcile any
overlap at its triage, not here. Until a blast-radius-external record exists,
treat a PITR restore as capable of resurrecting erased subjects: after any
restore, cross-check against an out-of-band deletion log before assuming the
restored state is GDPR-clean.

## 4. Export-before-delete UX expectation

There is **no enforced export-before-delete gate**. The mobile Privacy screen
(`apps/mobile/src/app/(app)/more/privacy.tsx:144-155`) shows "Export My Data"
and "Delete Account" as two independent, adjacent `SettingsRow` items under the
same `showOwnerPrivacyGates` condition — export is offered in the same place a
user would go to delete, but nothing links them, blocks progression to the
delete flow, or reminds the user to export first. The delete confirmation
screen itself (`apps/mobile/src/app/delete-account.tsx:373-385`, copy at
`apps/mobile/src/i18n/locales/en.json:1934-1935`) warns about permanence and
the 7-day grace period but does not mention export or link to it.

Export (`GET /account/export` → `generateExportV2`,
`apps/api/src/routes/account.ts:291-306`) is synchronous and always available
to the owner up until the DB hard-delete transaction commits (Section 2) —
including during the 7-day grace period, since the account isn't touched until
then. **Operationally**: if a user reports lost data after deletion, the
correct question is "did you use Export My Data before confirming delete?" —
the product does not guarantee they were prompted to.

## 5. Dead-letter procedure for partial external deletion failure

"Partial external deletion" = the DB hard-delete transaction (Section 2)
committed — the person/org data is gone — but one of the two external erasure
legs that run **after** it did not complete:

- **Clerk login identity** (email, credentials, OAuth links) — `delete-clerk-user`
  step, `account-deletion.ts:200-207` → `deleteClerkUser`,
  `clerk-user.ts:251-321`.
- **Subscription store teardown** (Stripe / RevenueCat) — dispatched as a
  separate durable event, `app/billing.subscription_store_teardown_requested`
  (`account-deletion.ts:178-192`), consumed by
  `billing-subscription-store-teardown.ts`.

### Detection today

Both legs retry (Inngest `retries: 5`) and capture to Sentry on every failed
attempt, then again on final exhaustion:

- **Clerk erasure, per-attempt**: `deleteClerkUser` throws on any network
  error, missing `CLERK_SECRET_KEY`, or non-404 non-2xx response, and calls
  `captureException` tagged `surface: clerk_delete`, `reason:
  network_error | missing_secret | http_<status>` on each occurrence
  (`clerk-user.ts:260-269, 280-291, 304-313`). A 404 is treated as an
  idempotent success (`clerk-user.ts:293-302`) — the identity is already gone.
- **Clerk erasure, terminal**: once all 5 Inngest retries on `delete-clerk-user`
  are exhausted, the function-level `onFailure` fires
  (`account-deletion.ts:40-78`). It emits two signals: a structured
  `logger.error('account_deletion.terminal_failure', …)` carrying `accountId`,
  `runId`, `reason: 'handler_retries_exhausted'`, and `errorName`
  (`account-deletion.ts:51-58`); and a `captureException` whose
  `surface: 'account-deletion.terminal_failure'`, `accountId`, `runId`, and an
  explicit hint (*"DB cascade may have completed while external erasure work
  survives … GDPR Art 17 erasure half-completed …"*) are placed in the
  event's **`extra`** object, **not** in Sentry tags
  (`account-deletion.ts:59-76`). This distinction matters for search — see the
  remediation note below.
- **Subscription store teardown, terminal**: its own `onFailure`
  (`billing-subscription-store-teardown.ts:24-59`) emits the same two signals:
  `logger.error('billing.store_teardown.terminal_failure', …)` with
  `accountId` / `runId` / `errorName`, and a `captureException` whose
  `surface: 'billing-subscription-store-teardown.terminal_failure'` /
  `accountId` / `runId` are likewise in the event's **`extra`** object, not
  tags (`billing-subscription-store-teardown.ts:35-50`).

### Where it lands

**Sentry + structured logs, but no durable dead-letter event.** Each
terminal-failure handler emits a Sentry exception (surface in `extra`) and a
structured `logger.error` (queryable by event name in the logging backend), and
returns a plain status object (`{ status: 'terminal_failure', accountId }`) from
`onFailure` visible in the Inngest dashboard for that run. What is missing is a
**durable, re-dispatched dead-letter event** an ops consumer could subscribe to
or alert on: nothing re-emits "this account has a half-completed erasure" as a
first-class Inngest event (see Known gap / TODO). So detection depends on
someone querying the logs / Sentry, not on a signal that pages on its own.

### Operator remediation steps

1. Locate the terminal failure. The reliable locator is the **structured log
   event**, not a Sentry tag: query the logging backend for
   `account_deletion.terminal_failure` (Clerk leg) or
   `billing.store_teardown.terminal_failure` (subscription-store leg) and read
   `accountId` / `runId` off the record. In Sentry the same failures appear as
   exceptions, but their `surface` value lives in the event's `extra` data, **not
   in tags** — so a `surface:account-deletion.terminal_failure` /
   `surface:billing-subscription-store-teardown.terminal_failure` **tag** query
   returns nothing. To find them in Sentry, search the additional-data /
   full-text for that surface string rather than using the `surface:` tag
   filter. (Only the *per-attempt* Clerk captures are genuinely tagged —
   `surface:clerk_delete` — and those are retry noise, not the terminal signal.)
   Note the `accountId` and `runId`.
2. Open the Inngest run (`runId`) and inspect which step failed and why (rate
   limit, expired `CLERK_SECRET_KEY`, Stripe/RevenueCat outage, etc.).
3. Confirm the DB side is actually gone: `organizationExistsV2` should be
   false for the `accountId` — if the org row still exists, this is not a
   partial-external case, re-trigger the whole function instead of hand-fixing
   Clerk/billing.
4. If the DB side is confirmed gone and only the external leg failed:
   - **Clerk**: call `DELETE /v1/users/{id}` against the Clerk Backend API
     directly with the `clerkUserId` captured in the failed run's
     `capture-clerk-user-id` step output (or look up the user by the org
     owner's pre-deletion email in the Clerk dashboard if the step output is
     unavailable). A 404 confirms it was already erased.
   - **Subscription store**: manually cancel the Stripe subscription /
     RevenueCat entitlement using the `stripeSubscriptionId` /
     `revenuecatOriginalAppUserId` from the teardown targets. The durable,
     always-present source is the **`capture-subscription-store-teardown-targets`
     step output in the account-deletion run** itself
     (`account-deletion.ts:148-154` → `getSubscriptionStoreTeardownTargetsV2`) —
     it is computed before the DB commit and persists in the run regardless of
     what happened downstream. The `app/billing.subscription_store_teardown_requested`
     event payload carries the *same* targets, but **only if that event was
     actually dispatched**: the dispatch is itself a retried step
     (`step.sendEvent('request-subscription-store-teardown', …)`,
     `account-deletion.ts:180-191`), so if it exhausts its retries after the DB
     commit, no teardown event — and therefore no
     `billing-subscription-store-teardown.terminal_failure` — is ever produced;
     the failure surfaces as `account-deletion.terminal_failure` instead. In
     that case do **not** look for the teardown event payload (there is none);
     read the IDs from the account-deletion run's
     `capture-subscription-store-teardown-targets` step output.
5. Once resolved, resolve the Sentry issue manually — nothing in-app clears it.

### Known gap / TODO

**There is no durable dead-letter event for either external-erasure leg.**
Compare this to the sibling GDPR cascade-delete pipeline,
`consent-revocation.ts` (WI-997): its `onFailure` handler dispatches a durable
`app/consent.revocation.failed` event via `safeSend` in addition to a Sentry
`captureMessage` (`consent-revocation.ts:63-122`) — an explicit, queryable,
ops-consumable dead-letter signal that survives independent of Sentry.
`account-deletion.ts` and `billing-subscription-store-teardown.ts` both stop
at the Sentry capture; there is no equivalent `app/account.deletion.failed`
(or similar) event, and no dashboard/alerting is wired to page on this signal
today. Today's remediation is entirely manual and depends on someone noticing
the Sentry issue. Recommend a follow-up work item to add the same
`safeSend`-dispatched dead-letter event pattern used by `consent-revocation.ts`
to both `account-deletion.ts`'s `delete-clerk-user` failure path and
`billing-subscription-store-teardown.ts`.
