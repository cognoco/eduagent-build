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
