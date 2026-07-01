**What was done:**

Implemented WI-943 (PersonScopeStructuralSubjects has no empty state) in the isolated `.worktrees/WI-943` worktree. A successful empty `subjects: []` response now renders a visible empty-state card instead of leaving only the heading and an empty view.

**What changed:**

- Added an empty-state branch to `apps/mobile/src/components/support/PersonScopeStructuralSubjects.tsx` using the shared `EmptyStateCard`.
- Added translated empty-state title/message keys for all supported UI locales.
- Added a focused regression test covering the successful zero-subject response, the empty-state copy, the absence of subject cards, and the retry action.

**Verification:**

- Red proof: `pnpm exec jest src/components/support/PersonScopeStructuralSubjects.test.tsx --runInBand --no-coverage` failed before the component fix because `person-scope-subjects-empty-state` was not rendered.
- Green proof: `pnpm exec jest src/components/support/PersonScopeStructuralSubjects.test.tsx --runInBand --no-coverage` passed after the fix: 1 suite passed, 1 test passed.
- `pnpm check:i18n` passed.
- `pnpm check:i18n:orphans` passed.
- `pnpm check:i18n:jsx-literals` passed.
- `pnpm exec nx lint mobile` passed with 0 errors and existing warning-only output.
- `pnpm exec tsc --noEmit` from `apps/mobile` passed.
- `git diff --check` passed.

**Caveats / Follow-ups:**

- The focused Jest run still emits existing Expo/Jest environment warnings about native modules/polyfills and stale `baseline-browser-mapping`; the test itself passes.
- `pnpm exec nx run mobile:typecheck` previously timed out while the local Nx workspace database was locked, so the final type verification used the direct mobile TypeScript check instead.
- Cosmo complete was intentionally not run; coordinator review will complete the item.
