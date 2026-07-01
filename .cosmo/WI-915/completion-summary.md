**What was done:** Fixed `getSessionXpEntry` so pending, unapplied reflection multipliers report `reflectionBonusXp: 0` instead of a phantom bonus. Updated the XP service regression test to lock the pending-reflection behavior.

**What changed:** `apps/api/src/services/xp.ts`; `apps/api/src/services/xp.test.ts`.

**Verification:** `pnpm exec jest --config apps/api/jest.config.cjs --runInBand apps/api/src/services/xp.test.ts --no-coverage` passed 32 tests. `pnpm exec eslint apps/api/src/services/xp.ts apps/api/src/services/xp.test.ts` exited 0. `git diff --check -- apps/api/src/services/xp.ts apps/api/src/services/xp.test.ts` exited 0. `git push origin HEAD:WI-915` passed repo pre-push validation after `pnpm exec nx reset`.

**Caveats / Follow-ups:** First push attempt hit unrelated/cache-stale mobile test type errors in pre-push `tsc --build`; after `pnpm exec nx reset`, the same push passed. No follow-ups.
