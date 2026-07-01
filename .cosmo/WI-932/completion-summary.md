**What was done:**
Finished WI-932 (profile-scope test uses fragile double-invocation try/catch for status) by refactoring the `requireProfileId` and `requireAccount` negative-path tests to assert the thrown `HTTPException` from a single helper invocation.

**What changed:**
- `apps/api/src/middleware/profile-scope.test.ts` now uses `captureHttpException()` to capture the thrown error once and assert it is an `HTTPException`.
- The `requireProfileId(undefined)` test now asserts status `400` on the captured exception and verifies the helper was called exactly once.
- The `requireAccount(undefined)` test now asserts status `401`, the account-required message, and exactly one helper call.
- No production middleware code is changed in the final commit.

**Verification:**
- Red proof: temporarily swapped the production helper statuses in `apps/api/src/middleware/profile-scope.ts`; `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/middleware/profile-scope.test.ts -t 'throws HTTPException' --runInBand --no-coverage` failed both helper negative tests.
- Green focused test: `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/middleware/profile-scope.test.ts --runInBand --no-coverage` passed, 11 tests passed.
- Focused lint: `pnpm exec eslint apps/api/src/middleware/profile-scope.test.ts` passed.
- Secret-pattern scan on the edited file found no matches.
- Commit hooks ran and passed: lint-staged eslint/prettier and sync-skills.
- Pre-push validation passed: incremental `tsc --build` and related API Jest test.
- Pushed commit `56cc3e3a3a3b0e59d9d8cce0abc2c84aa797524f` to `origin/WI-932`.

**Caveats / Follow-ups:**
- `apps/api/src/middleware/profile-scope.test.ts` still has two pre-existing `gc1-allow` targeted internal mocks; they were left untouched to keep WI-932 scoped and are noted in the commit body.
- Jest printed the existing `ts-jest` `esModuleInterop` warning and pre-push printed the existing forced-exit open-handle note; green commands exited 0.
- Per instruction, Cosmo complete was not run.
