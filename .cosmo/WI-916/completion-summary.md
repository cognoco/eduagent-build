**What was done:** Fixed WI-916 by making overall progress choose the latest curriculum version deterministically for subjects with multiple curricula.

**What changed:** Ordered overall-progress curriculum queries by descending `curricula.version`, replaced last-row-wins `Map` construction with first-row-wins selection after latest-version ordering, and applied the same deterministic selection to `getOverallProgressBatch`. Added a regression test where a subject has an older one-topic curriculum and a newer two-topic curriculum; overall progress now reports the newer curriculum totals.

**Verification:** RED: `pnpm exec jest src/services/progress.test.ts --no-coverage --runInBand` from `apps/api` failed as expected before the fix with 1 failed suite, 1 failed test, 68 passed, 69 total. GREEN/pre-commit worker reruns passed with 1 suite and 69 tests. Coordinator reran `pnpm exec jest src/services/progress.test.ts --no-coverage --runInBand` from `apps/api`, which passed with 1 suite and 69 tests. Worker also reported eslint, API TypeScript check, GC1 guard, commit hooks, and pre-push validation passed.

**Caveats / Follow-ups:** `ts-jest` still emits the existing `TS151001` `esModuleInterop` warning during Jest runs. No PR was created.
