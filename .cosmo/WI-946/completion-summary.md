**What was done:**
- Fixed WI-946 so failed NudgeBanner mark-all-read dismissals stay recoverable instead of silently closing and reappearing later.

**What changed:**
- `NudgeBanner` now closes the unread modal only after `markAllRead` succeeds.
- Failed mark-all-read mutations keep the modal open, show the existing generic recoverable error copy, and let the user retry from the same dismiss button.
- `NudgeUnreadModal` now accepts an inline error message and pending state for the dismiss action.
- Added a focused `[WI-946]` regression test covering failed mark-all-read dismissal and retry.

**Verification:**
- Red: `node '..\..\apps\mobile\node_modules\jest-expo\bin\jest.js' --config apps/mobile/jest.config.cjs --runInBand --forceExit --runTestsByPath 'apps/mobile/src/components/nudge/NudgeBanner.test.tsx' --testNamePattern 'WI-946'` failed before the fix because the modal disappeared after the failed mutation.
- Green: same focused `[WI-946]` command passed after the fix.
- Green: `node '..\..\apps\mobile\node_modules\jest-expo\bin\jest.js' --config apps/mobile/jest.config.cjs --runInBand --forceExit --runTestsByPath 'apps/mobile/src/components/nudge/NudgeBanner.test.tsx' 'apps/mobile/src/components/nudge/NudgeUnreadModal.test.tsx'` passed, 17/17 tests.
- Green: `node '..\..\node_modules\eslint\bin\eslint.js' 'apps/mobile/src/components/nudge/NudgeBanner.tsx' 'apps/mobile/src/components/nudge/NudgeUnreadModal.tsx' 'apps/mobile/src/components/nudge/NudgeBanner.test.tsx'` passed.
- Green: `node '..\..\node_modules\typescript\bin\tsc' --noEmit --project apps/mobile/tsconfig.json` passed.
- Green: pre-push validation passed on push, including `tsc --build`, related mobile Jest (5 suites, 80/80 tests), and i18n checks.

**Caveats / Follow-ups:**
- Jest emitted pre-existing Expo native-module/environment warnings and unrelated `EarlyAdopterCard` act warnings during related pre-push tests; all test suites exited successfully.
- Cosmo complete was intentionally not run; coordinator will verify and complete.
