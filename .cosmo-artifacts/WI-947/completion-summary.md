**What was done:**
- Fixed WI-947 so the child-detail route shows a loading state instead of rendering `common.loading` as the child title while child identity data is still resolving.

**What changed:**
- Added a `child-profile-loading` branch in `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` when no usable child display name exists and profile/detail/dashboard data is still loading.
- Changed the post-loading child-name fallback from `common.loading` to the existing `parentView.index.yourChild` copy.
- Added a focused `[WI-947]` regression test in `apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx`.

**Verification:**
- Red: `node '..\..\apps\mobile\node_modules\jest-expo\bin\jest.js' --config apps/mobile/jest.config.cjs --runInBand --forceExit --runTestsByPath 'apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx' --testNamePattern 'WI-947'` failed before the production fix because `child-profile-loading` was absent and `common.loading` rendered in the title.
- Green: same focused `[WI-947]` command passed after the fix.
- Green: `node '..\..\apps\mobile\node_modules\jest-expo\bin\jest.js' --config apps/mobile/jest.config.cjs --runInBand --forceExit --runTestsByPath 'apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx'` passed, 39/39 tests.
- Green: `node '..\..\node_modules\eslint\bin\eslint.js' 'apps/mobile/src/app/(app)/child/[profileId]/index.tsx' 'apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx'` passed.
- Green: `node '..\..\node_modules\typescript\bin\tsc' --noEmit --project apps/mobile/tsconfig.json` passed.

**Caveats / Follow-ups:**
- The `.worktrees/WI-947` local `node_modules/.bin` shims were still incomplete from the prior interrupted setup, so verification used the parent checkout's installed Jest/ESLint/TypeScript binaries from inside the WI-947 worktree.
- Jest emitted pre-existing Expo native-module/environment warnings during the mobile test run; tests still exited successfully.
