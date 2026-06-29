**What was done:** Aligned `formatRelativeDate` with `getRelativeDateParts` for the 7-29 day range.

**What changed:** Added regression coverage for 7, 13, 14, and 29 day boundaries in `apps/mobile/src/lib/format-relative-date.test.ts`. Updated `apps/mobile/src/lib/format-relative-date.ts` so 7-13 days formats as `last week`, 14-29 days formats as rounded week counts matching `getRelativeDateParts`, and under-7-day plus 30+-day behavior remains covered.

**Verification:** RED: `pnpm exec jest src/lib/format-relative-date.test.ts --no-coverage --runInBand` failed as expected with 1 failed suite, 1 failed test, 15 passed tests, 16 total; 7 days returned `7d` instead of `last week`. GREEN/pre-commit/post-commit worker reruns passed with 1 suite and 16 tests. Coordinator reran `pnpm exec jest src/lib/format-relative-date.test.ts --no-coverage --runInBand` and it exited 0. Worker also reported eslint, mobile typecheck, GC1 guard, and commit hooks exited successfully.

**Caveats / Follow-ups:** The first `git push origin HEAD:WI-918` command timed out locally after 304 seconds, but coordinator and worker both verified `origin/WI-918` points to the exact local commit SHA `b6c5450baa251672a937ba37691e45e4017fe97d`. No PR was created.
