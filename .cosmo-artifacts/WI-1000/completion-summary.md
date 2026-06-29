**What was done:**
Wrapped `requestSelfUnlink` revocation persistence in a single database transaction so the supportership edge revoke, visibility contract revoke, audit event, and notice write commit or roll back together.

**What changed:**
Changed `apps/api/src/services/supportership-revocation.ts` to use `db.transaction` and the transaction handle for all four dependent writes. Added `apps/api/src/services/supportership-revocation.integration.test.ts` with real-DB rollback coverage for contract-update failure, notice-write failure, and the no-contract ghost-edge path.

**Verification:**
Red: `pnpm exec jest --config apps/api/jest.integration.config.cjs --testMatch "**/apps/api/src/services/supportership-revocation.integration.test.ts" --runInBand --no-coverage` failed before the fix because `supportership.revokedAt` remained `2026-06-22T12:00:00.000Z` after injected downstream failures. Green: same focused integration suite passed after the fix with 3 tests passed. `pnpm exec tsc --build apps/api/tsconfig.json --pretty false` passed. `pnpm exec eslint apps/api/src/services/supportership-revocation.ts apps/api/src/services/supportership-revocation.integration.test.ts` passed with the known Nx project-graph cache warning. Commit `edce90807f79a42501a83f8a6ac7cfc32d9e2866` pushed to `origin/WI-1000`; remote SHA matches local. Pre-push validation passed.

**Caveats / Follow-ups:**
The integration Jest config does not discover tests from inside `.worktrees` on Windows without a `--testMatch` override; CI/main-checkout discovery should not need that workaround. Existing concurrency semantics are preserved: the active-link read remains outside the new write transaction, matching the prior behavior and WI scope.
