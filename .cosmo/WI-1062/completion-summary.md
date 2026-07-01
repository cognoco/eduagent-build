**What was done:**
Completed the mobile query-key registry adoption slice for subscription, usage, RevenueCat, profiles, settings, and onboarding invalidation keys.

**What changed:**
Added registry factories in `apps/mobile/src/lib/query-keys.ts`, replaced the touched inline query keys and invalidations in the related hooks/screens, and added regression coverage for the new scoped key shapes. Follow-up challenger fix normalized nullable identity scope IDs so Clerk `userId: null` cannot trip `tsc --build`.

**Verification:**
- `pnpm exec tsc --build` passed after the nullable-scope fix.
- Focused Jest passed: `query-keys`, `use-profiles`, `use-settings`, `use-subscription`, and `use-revenuecat` suites: 5 suites, 65 tests.
- `git diff --check` passed before commit.
- Commit hooks passed for both commits.
- `git push origin HEAD:WI-1062` passed the pre-push gate: incremental `tsc --build`, routed mobile Jest, and i18n checks.

**Caveats / Follow-ups:**
Pre-push still prints existing Expo/native-module and React act warnings, but exited successfully. No PR was created in this step.
