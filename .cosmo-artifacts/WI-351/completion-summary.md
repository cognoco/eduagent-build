**What was done:**

- Renamed the real-database `apply-retention-update` suite from API unit-test scope to `apply-retention-update.db.integration.test.ts`.
- Added an API unit-test guard that fails if future `*.test.ts` files directly open or resolve a real database.
- Added coverage proving `scripts/check-change-class.sh --run` executes the Husky typecheck gate for TypeScript changes.
- Documented the pre-push Doppler/database boundary and adjusted Jest globbing so script and API integration configs work correctly from linked worktrees.

**What changed:**

- `apps/api/src/services/apply-retention-update.test.ts` was renamed to `apps/api/src/services/apply-retention-update.db.integration.test.ts`.
- `apps/api/src/test-utils/unit-db-boundary.guard.test.ts` scans API unit tests for direct `loadDatabaseEnv()` and `createDatabase()` calls.
- `scripts/check-change-class.test.ts` now fakes `pnpm` in `--run` mode and asserts `pnpm exec tsc --build` is actually invoked.
- `scripts/jest.config.cjs` and `apps/api/jest.integration.config.cjs` use globs that resolve correctly inside `.worktrees`.
- `scripts/pre-push-tests.sh` now states that real database credentials are caller-provided and not wrapped by the pre-push hook itself.

**Verification:**

- `pnpm exec jest --config scripts/jest.config.cjs scripts/check-change-class.test.ts --runInBand --no-coverage`
- `pnpm --filter @eduagent/api exec jest src/test-utils/unit-db-boundary.guard.test.ts --runInBand --no-coverage`
- `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/idempotency-assistant-state.test.ts apps/api/src/test-utils/unit-db-boundary.guard.test.ts --runInBand --no-coverage`
- `pnpm exec jest --config apps/api/jest.integration.config.cjs apps/api/src/services/apply-retention-update.db.integration.test.ts --runInBand --no-coverage`
- `pnpm exec tsc --build`
- Commit and push hooks passed on branch `WI-351`.

**Caveats / Follow-ups:**

- The integration test exits 0 but emits the existing Jest open-handle warning after completion.
- The original item's Doppler hardcoded-path premise was partially stale; the committed change documents the actual boundary rather than inventing a wrapper inside pre-push.
