# WI-2901 red/green evidence

## Red

The loading policy was deliberately mutated to return `true` for every background profile fetch, reproducing the rejected global-loading behavior. Running the focused `resolveProfileAuthorityLoadingState` matrix failed exactly these two cases:

- same-session learner-only mount refresh — expected usable (`false`), received loading (`true`)
- joined learner foreground refresh — expected usable (`false`), received loading (`true`)

Separately, the resolver-first TDD run failed all new matrix rows before the resolver existed, and the cached-new-session case failed until the pre-refetch render gap was closed.

## Green

- Restored focused loading-policy matrix: 9/9 passed.
- Full `apps/mobile/src/lib/profile.test.tsx`: 56/56 passed, including cold/unvalidated authority, owner capability, explicit proxy, joined learner, repeated `AppState` refresh, transition, success, and failure paths.
- Full `apps/mobile/src/app/(app)/_layout.test.tsx`: 149/149 passed, including learner-shell continuity and loading precedence over redirect, create-profile, and consent gates.
- `pnpm exec nx run @eduagent/mobile:typecheck`: passed.
- Targeted ESLint: passed with no errors and one existing `no-loop-func` warning in the test harness.
- Prettier and `git diff --check`: passed.

The production implementation was restored exactly after mutation before the final green runs.
