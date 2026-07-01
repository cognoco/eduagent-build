**What was done:**
Strengthened WI-933's family-bridge integration assertion so clone-created IDs must be UUID-shaped, not merely defined.

**What changed:**
- Added a UUID-shape regex in `tests/integration/family-bridge.integration.test.ts`.
- Replaced `toBeDefined()` assertions for `createdIds.topicId`, `createdIds.subjectId`, and `createdIds.bookId` with `expect.stringMatching(UUID_REGEX)`.

**Verification:**
- `pnpm exec eslint tests/integration/family-bridge.integration.test.ts` passed.
- `pnpm run db:push:dev` succeeded and applied the missing dev DB schema changes.
- `pnpm run db:generate:dev` succeeded with `No schema changes, nothing to migrate`.
- `C:/Tools/doppler/doppler.exe run -- pnpm exec jest --config tests/integration/jest.config.cjs tests/integration/family-bridge.integration.test.ts --runInBand --no-coverage` passed: 1 suite, 9 tests.
- Pre-push `tsc --build` passed during `git push origin HEAD:WI-933`.

**Caveats / Follow-ups:**
- The focused Jest run still prints the existing post-run open-handle warning after passing.
- No Cosmo complete was run; coordinator should complete/review.
