# WI-2898 red/green evidence

## RED — 2026-08-03

Command:

`pnpm exec jest --config apps/api/jest.config.cjs --runInBand apps/api/src/services/identity-v2/guardian-attachment.test.ts`

Result: the new fail-closed policy matrix failed before production implementation because `resolveGuardianAttachmentLawfulBasis` did not exist; the permissive US-versus-everything-else branch remained in the transaction.

## GREEN — 2026-08-03

- Focused policy matrix: same command — 9/9 passed.
- Formatting: `pnpm exec prettier --check apps/api/src/services/identity-v2/guardian-attachment.ts apps/api/src/services/identity-v2/guardian-attachment.test.ts apps/api/src/services/identity-v2/guardian-attachment.integration.test.ts` — passed.
- Targeted lint: `pnpm exec eslint apps/api/src/services/identity-v2/guardian-attachment.ts apps/api/src/services/identity-v2/guardian-attachment.test.ts apps/api/src/services/identity-v2/guardian-attachment.integration.test.ts` — passed with only the repository's standalone Nx project-graph cache warning.
- Real-database regression: authored in `apps/api/src/services/identity-v2/guardian-attachment.integration.test.ts`; the guarded local runner refused the stale disposable-database revision marker before Jest, so the PR's freshly provisioned CI target is the required execution evidence.
