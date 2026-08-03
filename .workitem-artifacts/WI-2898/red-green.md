# WI-2898 red/green evidence

## RED — 2026-08-03

Command:

`pnpm exec jest --config apps/api/jest.config.cjs --runInBand apps/api/src/services/identity-v2/guardian-attachment.test.ts`

Result: the new fail-closed policy matrix failed before production implementation because `resolveGuardianAttachmentLawfulBasis` did not exist; the permissive US-versus-everything-else branch remained in the transaction.

## GREEN — 2026-08-03

- Focused policy matrix: same command — 9/9 passed.
- Formatting: `pnpm exec prettier --check apps/api/src/services/identity-v2/guardian-attachment.ts apps/api/src/services/identity-v2/guardian-attachment.test.ts apps/api/src/services/identity-v2/guardian-attachment.integration.test.ts` — passed.
- Targeted lint: `pnpm exec eslint apps/api/src/services/identity-v2/guardian-attachment.ts apps/api/src/services/identity-v2/guardian-attachment.test.ts apps/api/src/services/identity-v2/guardian-attachment.integration.test.ts` — passed with only the repository's standalone Nx project-graph cache warning.
- Real-database regression: `pnpm run test:api:integration --jest apps/api/src/services/identity-v2/guardian-attachment.integration.test.ts --runInBand --no-coverage` against the isolated `wi-2898-test-db-1` PostgreSQL 16 container — 25/25 passed. The COPPA mapping case deliberately uses the synthetic XG policy's guardian-required threshold of 16: the product excludes under-13 credentialed learners, so the canonical US threshold-13 admission path cannot reach guardian attachment. The country-policy suites own the real US threshold; this suite isolates the transaction's regime-to-basis behavior.
