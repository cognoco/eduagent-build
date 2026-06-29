**What was done:**
Fixed WI-954 stale banner state in ChangePassword, FeedbackSheet, and WithdrawalCountdownBanner.

**What changed:**
- ChangePassword clears success/error banners when any password field changes.
- FeedbackSheet resets submitted/error state on reopen and clears stale submit errors when the message changes.
- WithdrawalCountdownBanner clears the restored-success message when the grace-period child list changes.
- Added focused regression coverage for all three variants.

**Verification:**
- `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand --forceExit --runTestsByPath apps/mobile/src/components/change-password.test.tsx apps/mobile/src/components/feedback/FeedbackSheet.test.tsx apps/mobile/src/components/family/WithdrawalCountdownBanner.test.tsx` passed: 3 suites, 21 tests.
- `pnpm exec eslint apps/mobile/src/components/change-password.tsx apps/mobile/src/components/change-password.test.tsx apps/mobile/src/components/feedback/FeedbackSheet.tsx apps/mobile/src/components/feedback/FeedbackSheet.test.tsx apps/mobile/src/components/family/WithdrawalCountdownBanner.tsx apps/mobile/src/components/family/WithdrawalCountdownBanner.test.tsx` passed.
- Pre-push validation passed: `tsc --build`, related mobile Jest, and i18n checks.

**Caveats / Follow-ups:**
- Focused mobile Jest emits existing native-module/i18n setup warnings; tests still pass.
