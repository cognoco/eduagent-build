**What was done:** Fixed WI-926 by making the CelebrationAnimation animated-path test assert behavior instead of only rendering.

**What changed:** Updated `apps/mobile/src/components/common/CelebrationAnimation.test.tsx`. The animated-path test now asserts `onComplete` is not called synchronously on mount when reduced motion is disabled, and the stale explanatory comment that previously stood in for an assertion was removed.

**Verification:** Worker red proof temporarily added `expect.hasAssertions()` and observed the test fail because no assertion was called. Worker green/final focused Jest passed with 1 suite and 10 tests, plus eslint, mobile typecheck, GC6 scan, and pre-push validation. Coordinator reran `pnpm exec jest src/components/common/CelebrationAnimation.test.tsx --runInBand --no-coverage`, which passed 1 suite and 10 tests. Remote `origin/WI-926` matches commit `ee68ac1b8c6580afc22612508168aa3d71f5ea85`.

**Caveats / Follow-ups:** `pnpm env:sync` during worktree setup temporarily changed `apps/mobile/eas.json`; that setup drift was restored before commit. Jest emitted the existing `baseline-browser-mapping` age warning during test runs. No PR was created.
