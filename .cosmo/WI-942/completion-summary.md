**What was done:**
Recovered the contaminated `WI-942` worktree, removed the unrelated WI-977 API diffs, and implemented the subject-hub loading/empty-state recovery fix.

**What changed:**
`SubjectHubRoute` now uses `QueryStateView` for actionable loading/error states, times out stalled loading to retry/back controls, and renders a recoverable empty state when hub data settles without usable topics. `EmptyStateCard` now supports an optional secondary action, the common barrel exports `QueryStateView`, subject-hub empty-state copy was added to all locale files, and focused WI-942 regression coverage was added.

**Verification:**
Passed `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand --no-coverage --runTestsByPath 'apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.test.tsx'` (7 tests), `pnpm check:i18n`, `pnpm check:i18n:orphans`, and `pnpm exec tsc --noEmit --project apps/mobile/tsconfig.json --pretty false`.

**Caveats / Follow-ups:**
Focused Jest still prints existing Expo/Jest environment warnings (`EXNativeModulesProxy`, missing `EXPO_OS`, React act suspended warning, and baseline-browser-mapping age warning), but the suite passes. Cosmo completion was intentionally not run.
