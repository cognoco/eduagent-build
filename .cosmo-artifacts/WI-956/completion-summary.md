**What was done:** Fixed WI-956 by exposing the disabled cooldown state of the RemediationCard secondary review/retest action to accessibility consumers.

**What changed:** Added `accessibilityState={{ disabled: cooldownActive }}` to `review-retest-button`, added enabled/disabled accessibility assertions, added an explicit-prop regression guard for the secondary `Pressable`, and replaced the edited test file's internal `RetentionSignal` mock with an external `@expo/vector-icons` stub so the real retention signal renders.

**Verification:** `pnpm exec jest src/components/progress/RemediationCard.test.tsx --runInBand --no-coverage` passed: 21 tests, 1 suite. `pnpm exec eslint apps/mobile/src/components/progress/RemediationCard.tsx apps/mobile/src/components/progress/RemediationCard.test.tsx` passed with the known Nx ProjectGraph cache warning. `& .\apps\mobile\node_modules\.bin\tsc.CMD --noEmit -p apps/mobile/tsconfig.json` passed.

**Caveats / Follow-ups:** The worktree keeps the prior ignored `apps/mobile/node_modules` junction noted in the checkpoint; no source follow-up is required for this item. Cosmo complete was intentionally not run per operator instruction.
