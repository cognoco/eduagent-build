---
title: WI-2390 Deletion Recovery and Audit Proof — Implementation Plan
date: 2026-07-31
profile: code
work_items: [WI-2390]
spec: docs/plans/2026-07-12-one-way-door-risk-drain.md
status: in-progress
---

# WI-2390 Deletion Recovery and Audit Proof — Implementation Plan

**Goal:** Prove the reversible deletion window, export availability, Clerk erasure, and a queryable deletion-completion record that survives a Postgres restore.

**Approach:** Preserve the existing deletion implementation and add focused regression tests around its missing guarantees. Emit the completion proof from the durable Inngest workflow only after the database erasure and Clerk erasure steps complete, using both structured logging and Sentry so the proof is outside the Postgres restore blast radius.

## Scope

In scope:

- `apps/api/src/inngest/functions/account-deletion.ts`
- `apps/api/src/inngest/functions/account-deletion.test.ts`
- `apps/api/src/inngest/functions/billing-subscription-store-teardown.ts`
- `apps/api/src/inngest/functions/billing-subscription-store-teardown.test.ts`
- `apps/api/src/routes/account.test.ts`
- `apps/api/src/services/identity-v2/deletion-v2.integration.test.ts`
- `docs/runbooks/deletion-irreversible-boundary.md`
- `docs/plans/2026-07-31-wi-2390-deletion-audit-proof.md`

Out of scope:

- The deletion dead-letter event and consumer owned by WI-2346
- Database schema or migration changes
- Product UX changes
- Production deletion execution or S6 cutover

## Tasks

- [x] T1: Prove grace-period cancellation and expiry behavior end to end — done when integration tests schedule and cancel a deletion without erasure, and separately run a scheduled deletion through the durable workflow and prove the organization and people are erased.
- [x] T2: Prove export remains available while deletion is scheduled — done when the account route test schedules deletion state, calls `GET /v1/account/export` as the owner, receives the export, and verifies `generateExportV2` was invoked for that organization.
- [x] T3: Prove Clerk erasure is coupled to committed account deletion — done when the durable workflow test proves a deleted account calls `deleteClerkUser` with the pre-read Clerk identifier, while cancelled and already-deleted runs do not.
- [x] T4: Emit restore-independent deletion-completion proof — done when failing-then-passing workflow tests verify that account/Clerk completion writes `account_deletion.completed` and provider teardown writes `billing.store_teardown.completed` to both the structured logger and Sentry, carrying the opaque account ID, Inngest run ID, and non-PII outcome summary.
- [x] T5: Align the irreversible-boundary runbook with the implemented proof — done when the runbook identifies the exact success and terminal-failure queries without claiming WI-2346's dead-letter event exists.
- [ ] T6: Validate and land — done when targeted tests, change-class checks, type/lint gates, adversarial review, and CI pass; the landed commit is recorded through `/cosmo:execute complete`.

## Tests

- T1: `executeDeletionV2 GDPR gaps (WI-849, integration)` cancellation and scheduled workflow cases.
- T2: `GET /v1/account/export` scheduled-deletion regression in `account.test.ts`.
- T3: `[R1] Clerk identity erasure on account deletion` workflow tests.
- T4: `[WI-2390] restore-independent completion audit proof` tests in both deletion workflows, including the negative path that no completion proof is emitted for cancellation.

## Verification

- Focused unit suites: 5 suites, 98 tests passed.
- API unit gate: 501 suites, 9,966 tests passed (11 skipped).
- Deletion-v2 integration suite: 1 suite, 10 tests passed against a disposable local PostgreSQL database.
- API typecheck, ESLint on all changed TypeScript files, no-Gemini-runtime ratchet, and test-only-export ratchet passed.
