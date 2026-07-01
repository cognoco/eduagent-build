What was done: Consolidated the two standalone mobile lib micro-modules named by WI-1084.

What changed: Moved `LearningSubjectTint` into `apps/mobile/src/lib/subject-tints.ts` and retargeted all four type import sites. Inlined the tiny `copyRegisterFor()` role mapping at the two progress screen runtime call sites. Kept `CopyRegister` local to the progress hero view model, where it is the only remaining type consumer. Deleted `apps/mobile/src/lib/learning-subject-tints.ts` and `apps/mobile/src/lib/copy-register.ts`.

Verification: `pnpm exec nx lint mobile` passed. `pnpm exec nx run mobile:typecheck` passed after rerunning with a longer timeout. `cd apps/mobile; pnpm exec jest --findRelatedTests ... --no-coverage` passed for the changed import sites and `subject-tints.ts`. Pre-commit hook passed: lint-staged ESLint/Prettier, skills sync, i18n orphan keys, and keep-rot checks. Pre-push hook passed: incremental `tsc --build`, mobile Jest on the push delta, i18n orphan check, and i18n staleness check.

Caveats / Follow-ups: Focused Jest and pre-push Jest emitted existing Expo/native-module, baseline-browser-mapping, and React `act(...)` warnings, but both commands exited 0. No follow-up work identified.
