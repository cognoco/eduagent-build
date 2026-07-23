# WI-2386 red-green-revert evidence

Recorded 2026-07-23 in the isolated `WI-2386` worktree. Every mutation below
was applied temporarily, produced the named red result, and was reverted with
`apply_patch` before the matching green run. Final `git diff --check` and the
full gates verify that none of the mutations remains.

## Missing-purpose aggregate

- Mutation: remove `present.length !== CONSENT_PURPOSES.length` from
  `reduceConsentPurposeSet`.
- Command: `pnpm exec jest --config apps/api/jest.integration.config.cjs apps/api/src/services/identity-v2/consent-status-v2.integration.test.ts --runInBand -t 'fails a guardian purpose set closed until every purpose is granted' --forceExit`
- RED: 1 failed; expected `PENDING`, received `CONSENTED`.
- Revert + GREEN: 1 passed, 18 skipped.

## Token approval complete-set write

- Mutation: change the approval grant insert from `CONSENT_PURPOSES.map` to
  `CONSENT_PURPOSES.slice(0, 1).map`.
- Command: `pnpm exec jest --config apps/api/jest.integration.config.cjs apps/api/src/services/identity-v2/consent-v2.integration.test.ts --runInBand -t 'processConsentResponseV2\(approve\) writes a grant and back-links it' --forceExit`
- RED: 1 failed with `consent grant purpose-set insert was incomplete`; the
  transaction rolled back.
- Revert + GREEN: 1 passed, 70 skipped.

## Whole-consent withdrawal complete-set write

- Mutation: restrict the withdrawal update IDs to `current.slice(0, 1)`.
- Command: `pnpm exec jest --config apps/api/jest.integration.config.cjs apps/api/src/services/identity-v2/consent-v2.integration.test.ts --runInBand -t 'withdrawal STAMPS withdrawn_at on the live grant' --forceExit`
- RED: 1 failed with `ConsentRecordNotFoundError` at the full-set row-count
  assertion; the transaction rolled back.
- Revert + GREEN: 1 passed, 70 skipped.

## Review follow-up — canonical guard and rollback contract

- Added six `llm_disclosure` forbidden-proxy samples and the rollback SQL
  contract before changing the guard or sidecar.
- Command: `pnpm check:consent-purpose-contract`
- RED: 6 failed, 11 passed (five ignored `llm_disclosure` proxy forms plus the
  invalid enum-cast rollback).
- GREEN: 17/17 passed and the production-tree scan reported
  `consent-purpose-contract: clean`.

## Review follow-up — basis-explicit family batch

- Added a pass-through counter on the real database pool for a four-child,
  complete-purpose-set family before replacing the per-person fan-out.
- Command: focused `consent-status-v2.integration.test.ts` run matching
  `basis-explicit purpose-set batch`.
- RED: observed 24 round trips; expected at most 4.
- GREEN: 1/1 passed at 4 round trips. The complete reducer + state-machine
  integration run subsequently passed 98/98.

## Review follow-up — child-detail organization isolation

- Mutation: temporarily removed the new
  `consentGrant.organizationId = organizationId` predicate from the latest-grant
  lookup.
- Command: focused `consent-v2.integration.test.ts` run matching
  `child detail respondedAt ignores`.
- RED: expected the in-org `2026-01-01` timestamp, received the newer foreign-org
  `2026-02-01` timestamp.
- Revert + GREEN: 1/1 passed; `git diff --check` remained clean.
