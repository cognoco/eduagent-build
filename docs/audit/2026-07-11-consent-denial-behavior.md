# WI-1761 - Consent-denial behavior audit

**Date:** 2026-07-11  
**Scope:** Current denial behavior across the API, relational data, external identity, timers, and mobile recovery.  
**Status:** COMPLETE - read-only audit; no product behavior changed.  
**Decision baseline:** `docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md:24`  
**Legal boundary:** This report identifies engineering and accountability risks. It does not make a legal determination; counsel Q2 owns the retention-versus-erasure ruling.

## Executive conclusion

The live implementation does **not** provide the ruled first-class dormant `denied` state. It briefly updates `consent_request.status` to `denied`, then attempts to synchronously delete the `person`. On a graph with no blocking relationships, the request row cascade-deletes in the same transaction and no API or mobile reader can observe `denied` afterward. If the person participates in any `ON DELETE RESTRICT` relationship that this bespoke path does not clear, PostgreSQL rejects the person delete and rolls back the entire denial.

The result is therefore graph-dependent: either immediate, irreversible database erasure with no grace period, or an unhandled failure with no denial recorded. On successful payer erasure, a deletion-audit row and two provisional financial records remain, but the consent request/decision itself is lost. The Clerk user and the now-empty organization are not deleted by this path. Mobile subsequently offers generic profile recreation or fallback, not a denial-specific dormant experience.

**Severity: RED (engineering/GDPR risk pending counsel).** The behavior materially diverges from the ratified direction, can either destroy learning data immediately or fail the parent's decision, retains some identity/container data despite permanent-deletion copy, and has an asymmetric decision trail.

## Method

- Traced the browser POST into `processConsentResponseV2` and its database transaction.
- Traced the relevant foreign keys, retained-record schemas, billing teardown, and external Clerk deletion boundary.
- Queried the synchronized development database's `pg_constraint` catalog for every direct FK to `person`: 64 `CASCADE`, 9 `RESTRICT`, and 4 `SET NULL` constraints.
- Traced profile-list recovery, app-layout gates, and the shared consent-status contract.
- Checked denial and payer-denial integration tests against the implementation.
- Compared the result with the ratified Item 4-D2 direction.

## Current behavior

### 1. Request and confirmation

`POST /consent/request` accepts either the caller's own profile or an owner-authorized child profile, then writes/sends the consent request (`apps/api/src/routes/consent.ts:185-241`). The browser denial flow is deliberately two-step. Its confirmation page says the account and all learning data will be permanently deleted and cannot be recovered (`apps/api/src/routes/consent-web.ts:398-450`).

The destructive endpoint accepts only literal `approved=true|false`; malformed values are rejected before mutation (`apps/api/src/routes/consent-web.ts:459-496`). This protects against accidental coercion into denial.

### 2. Synchronous denial transaction

For `approved=false`, `processConsentResponseV2` attempts one transaction (`apps/api/src/services/identity-v2/consent-v2.ts:557-638`):

1. Atomically changes the request to `status='denied'` and records response metadata.
2. Snapshots subscriptions where the denied person is payer.
3. For a payer only, writes `deletion_audit` plus the canonical tax and chargeback `financial_record` pair.
4. Deletes subscriptions paid by that person.
5. Deletes the `person`; database foreign-key cascades remove dependent person-scoped rows only if no uncleared `ON DELETE RESTRICT` relationship blocks the delete.

After a successful commit, any captured Stripe subscription is cancelled. Cancellation failure emits a structured operational event but does not reverse the denial (`apps/api/src/services/identity-v2/consent-v2.ts:640-684`).

The path clears primary-payer subscriptions but does not clear or re-home guardianship, supportership, consent-grant, visibility-contract, or standalone secondary-payer relationships. Their person FKs use `ON DELETE RESTRICT` (`packages/database/src/schema/identity.ts:366-372,423-429,471-478,763-768`; `packages/database/src/schema/visibility-contract.ts:26-33`). If any such row exists, step 5 fails and PostgreSQL rolls back the request update, audit/financial inserts, subscription delete, and person delete. The route has no specific mapping for this database error, so it propagates as a server error (`apps/api/src/routes/consent-web.ts:622-675`).

The canonical whole-organization deletion workflow explicitly tears down incident relationship edges, deletes subscriptions, and re-homes grants before person deletion (`apps/api/src/services/identity-v2/deletion-v2.ts:418-508`). The denial path bypasses those protections.

There is no dormant transition, archive marker, delayed job, or undo window in this branch. The seven-day restore window belongs to **withdrawal**, where a grant remains and `archived_at` can be cleared (`apps/api/src/services/identity-v2/consent-v2.ts:814-905`); it does not apply to initial denial.

### 3. What is deleted after a successful transaction

The key relational effects are:

| Data | Result | Evidence |
|---|---|---|
| `person` | Deleted immediately | `consent-v2.ts:636-637` |
| `consent_request` | Deleted with the person, so `denied` is not durable | FK `ON DELETE CASCADE` at `packages/database/src/schema/identity.ts:805-829`; integration assertion at `apps/api/src/routes/consent-web.integration.test.ts:487-513` |
| Database login binding | Deleted with the person | `login.person_id ON DELETE CASCADE` at `packages/database/src/schema/identity.ts:153-169` |
| Membership | Deleted with the person | `membership.person_id ON DELETE CASCADE` at `packages/database/src/schema/identity.ts:217-233` |
| Payer subscription and its children | Explicitly deleted before the person | `consent-v2.ts:628-637`; subscription children cascade from the subscription |
| Direct person-linked rows | 64 direct FKs cascade and 4 set their person reference to null once no blocking row exists | Current `pg_constraint` inventory against the synchronized development schema; the service relies on this at `consent-v2.ts:636` |

The same current catalog inventory found nine direct RESTRICT FKs: `consent_grant.charge_person_id`; both person endpoints on `guardianship`, `supportership`, and `support_visibility_contracts`; `subscription.payer_person_id`; and `subscription_payers.person_id`. The denial path clears only primary-payer subscription rows. The integration test proves person/request deletion for its minimal graph but does not seed the other RESTRICT relationships (`apps/api/src/routes/consent-web.integration.test.ts:487-513`). This audit therefore claims direct-FK behavior only; it does not claim that every transitive learning table was independently re-enumerated.

### 4. What is retained

| Data | Result | Evidence / limitation |
|---|---|---|
| Consent decision | **Not retained as a consent request or receipt.** The request cascade-deletes; denial creates no grant to re-home into `consent_receipt`. | `consent-v2.ts:557-638`; request FK above |
| Deletion audit | Retained only when the denied person had a payer subscription. No-subscription denial writes none. | `consent-v2.ts:589-620`; tests at `consent-v2.integration.test.ts:344-439` |
| Financial records | Two records for payer denial; no FK to person/org; retention period remains `NULL` pending counsel. | `packages/database/src/schema/identity.ts:568-587`; `apps/api/src/services/identity-v2/deletion-v2.ts:983-1028` |
| Organization | Remains. The denial branch deletes subscriptions and person, not organization. It can become an unreachable empty container. | Organization has no parent FK (`identity.ts:190-208`); complete deny branch is `consent-v2.ts:557-638` |
| Clerk user | Remains in Clerk. The local login row is deleted, but this path neither captures nor calls Clerk deletion. | Account deletion explicitly captures and deletes Clerk at `apps/api/src/inngest/functions/account-deletion.ts:114-120,195-206`; denial has no equivalent |
| Third-party operational history | Outside this transaction and governed by each processor's retention. | Inngest receives only a Stripe-cancel-failure event from this denial path; provider logs were not queried in this audit |

This asymmetry is the main accountability risk: an ordinary no-subscription denial can leave no durable database record of the decision, while a payer denial retains financial and deletion metadata without a settled retention period.

On a RESTRICT-blocked graph, the transaction rollback instead retains the person, request, subscription, and all side records unchanged; `status='denied'` is also rolled back. The parent receives a server error rather than a recorded refusal.

### 5. Reachability after successful denial

The web response says the account will be removed and, if denial was a mistake, the child can send a new request from the app (`apps/api/src/routes/consent-web.ts:606-621`). That is not restoration: the prior person, request, and learning graph are gone.

For a credentialed user, Clerk authentication can remain valid while the local login/account graph is gone. `GET /profiles` then returns an empty list for a known Clerk identity with no local account (`apps/api/src/routes/profiles.ts:155-164`). Mobile renders `CreateProfileGate` when no active profile exists (`apps/mobile/src/app/(app)/_layout.tsx:583-589`), allowing a new graph to be created rather than restoring the deleted one.

If a deleted profile was one of several profiles visible to another account, `ProfileProvider` falls back to the owner and marks the saved profile as removed (`apps/mobile/src/lib/profile.ts:291-311`); the app shows a generic profile-switched alert (`apps/mobile/src/app/(app)/_layout.tsx:875-889`).

There is no denial-specific mobile state:

- The shared status schema has only `PENDING`, `PARENTAL_CONSENT_REQUESTED`, `CONSENTED`, and `WITHDRAWN` (`packages/schemas/src/consent.ts:7-13`).
- The read reducer maps a request-level `denied` to `WITHDRAWN`, not a distinct status (`apps/api/src/services/identity-v2/consent-status-v2.ts:156-174,242-263`). Because the request and person are deleted in the same transaction, this mapping is not normally observable after denial.
- Mobile gates only pending/requested and withdrawn (`apps/mobile/src/app/(app)/_layout.tsx:592-613`; helper set at `apps/mobile/src/app/(app)/_lib/consent-gate-helpers.ts:3-8`).

## Difference from the ruled direction

The ratified direction is a first-class dormant `denied` state, distinct from withdrawal, unless counsel Q2 mandates erasure (`docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md:24`).

| Dimension | Ruled dormant direction | Current implementation |
|---|---|---|
| Person lifecycle | Person retained but inactive/dormant | Person hard-deleted when unblocked; otherwise transaction rolls back and person remains active/pending |
| Consent model | First-class `DENIED` | Request-level lowercase `denied` is either deleted with the person or rolled back; shared API has no `DENIED` |
| Distinct from withdrawal | Separate state and UX | Reducer maps denied to `WITHDRAWN`; denial itself has no grace |
| Learning data | Inaccessible pending future ruling | Immediately cascade-deleted when unblocked; remains live after rollback |
| Reversal | Product-defined dormant recovery | No restoration; only a new account/profile graph |
| Auditability | Durable decision expected | Decision row disappears; deletion evidence exists only for payer denials |
| Mobile UX | Denial-specific blocked/dormant experience | Generic profile removal or profile creation |

## Risks requiring immediate attention

1. **Irreversible loss before counsel ruling.** A parent click can destroy the learner graph immediately even though the ratified default direction is dormancy.
2. **Denial can fail completely.** Existing RESTRICT relationships make the raw person delete fail; the transaction rolls back and the parent receives a server error instead of a durable decision.
3. **Consent-decision evidence gap.** A successful transaction deletes the row that recorded denial. Non-payer denial creates no replacement audit record.
4. **External identity residue.** Permanent-deletion copy overstates the actual boundary because the Clerk user can remain.
5. **Orphaned organization residue.** The account container can remain after its sole person, membership, and subscription are removed.
6. **Copy/recovery mismatch.** “Cannot be undone” is accurate only after successful erasure; “send a new consent request” describes rebuilding, not undoing.
7. **Graph-shape coverage gap.** Existing tests cover a minimal person/request graph and payer variants, not a full production bootstrap graph plus the known RESTRICT relationships.

## Post-counsel build slices

### Common work, either ruling

1. Add a durable consent-decision/audit contract for every denial, with counsel-owned retention.
2. Make web/mobile copy match actual recovery and retained-data semantics.
3. Add full-bootstrap integration coverage: login, organization, membership, subscription, quota rows, learning data, every RESTRICT relationship, audit records, external identity action, rollback behavior, and idempotent replay.
4. Add denial metrics and an operator alert for partial external teardown.
5. Update the privacy notice, DPIA, ROPA, and retention register to the ruled behavior.

### If counsel confirms dormancy

1. Add `DENIED` to the shared contract and status reducer, distinct from `WITHDRAWN`.
2. Preserve person/request records; mark the person dormant through an explicit lifecycle field or ruled reuse of `archived_at`.
3. Enforce default-deny access and processing while dormant across routes and background jobs.
4. Define billing behavior, re-request authority, reactivation, expiry, and eventual erasure.
5. Add a denial-specific mobile gate and owner/learner recovery UX.

### If counsel mandates erasure

1. Route denial through the canonical durable deletion workflow rather than a bespoke raw person delete.
2. Capture and delete the Clerk identity, settle organization cleanup, and reconcile every external processor.
3. Preserve the minimum ruled denial receipt and deletion evidence with explicit retention periods.
4. Define whether any grace/appeal window is allowed; if none, keep the irreversible warning and remove restoration-like copy.

## Audit honesty

- This was a code and test audit. It did not mutate production data or query Clerk, Stripe, Inngest, or production logs.
- Relational conclusions are from declared schema FKs and current service code. The prior full erasure audit supports the learning-data cascade conclusion; this pass did not re-enumerate every schema table.
- Legal characterization and retention durations remain counsel-owned. “GDPR risk” here means the implementation needs legal review and accurate records/copy, not that this audit has determined non-compliance.
