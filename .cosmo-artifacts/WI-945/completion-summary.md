**What was done:**
Fixed WI-945 (Mentor-memory interest-context change reverts silently on failure) by surfacing recovery feedback when an optimistic interest-context update fails.

**What changed:**
Updated `InterestContextRow` to keep the optimistic rollback behavior, show an inline "Could not update memory" error, and provide a "Try Again" button that re-attempts the failed context change. Added a regression test covering rollback, visible feedback, and retry wiring.

**Verification:**
`pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand --runTestsByPath apps/mobile/src/components/mentor-memory-sections.test.tsx` passed.
`pnpm exec eslint apps/mobile/src/components/mentor-memory-sections.tsx apps/mobile/src/components/mentor-memory-sections.test.tsx` passed.
`pnpm exec tsc --build apps/mobile/tsconfig.json --pretty false` passed.
`git diff --check` passed.
Pre-push validation passed: incremental `tsc --build`, related mobile Jest suites (`mentor-memory-sections.test.tsx`, `mentor-memory.test.tsx`, `child/[profileId]/mentor-memory.test.tsx`) with 35 tests passing, `check:i18n:orphans`, and `check:i18n`.

**Caveats / Follow-ups:**
No known caveats. Did not run Cosmo complete; coordinator will verify and complete.
