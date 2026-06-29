**What was done:** Fixed unbraced multi-digit superscript and subscript formatting in the mobile math formatter.

**What changed:** Added regression coverage for `$x^23$` and `$a_12$` in `apps/mobile/src/lib/math-format.test.ts`. Updated `apps/mobile/src/lib/math-format.ts` so unbraced superscript and subscript digit regexes capture full digit runs with `\d+`. Existing single-digit and braced superscript/subscript behavior remains covered.

**Verification:** RED: `pnpm exec jest src/lib/math-format.test.ts --no-coverage --runInBand` failed as expected with 1 failed suite, 2 failed tests, 38 passed tests, 40 total; `x^23` rendered `x²3` and `a_12` rendered `a₁2`. GREEN/pre-commit/post-commit worker reruns passed with 1 suite and 40 tests. Coordinator reran `pnpm exec jest src/lib/math-format.test.ts --no-coverage --runInBand` and it exited 0. Worker also reported eslint, mobile typecheck, GC1 guard, commit hooks, and push pre-push validation passed; related Jest passed 8 suites and 260 tests.

**Caveats / Follow-ups:** Push-related Jest emitted existing Expo/native-module and React act warnings in unrelated related-test suites, but all pushed validation tests passed. No PR was created.
