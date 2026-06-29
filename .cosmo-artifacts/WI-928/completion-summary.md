**What was done:**
Finished WI-928 (Three assertion-free unmount race-condition tests) by converting the three `useSpeechRecognition` unmount race tests from "no crash" checks into assertions that prove post-unmount work is guarded.

**What changed:**
- `apps/mobile/src/hooks/use-speech-recognition.test.ts` now asserts the slow `startListening()` path does not call `start()` after unmount and leaves the last observable hook state unchanged.
- The late result-event test now captures the registered listener before unmount and asserts the post-unmount payload is not read.
- The late error-event test now captures the registered listener before unmount and asserts the post-unmount error payload is not read.
- No production hook code is changed in the final commit.

**Verification:**
- Red proof: temporarily removed the three relevant `mountedRef` guards in `apps/mobile/src/hooks/use-speech-recognition.ts`; `pnpm exec jest src/hooks/use-speech-recognition.test.ts -t 'unmount race condition' --runInBand --no-coverage` failed all three unmount-race tests.
- Green focused test: `pnpm exec jest src/hooks/use-speech-recognition.test.ts --runInBand --no-coverage` passed, 17 tests passed.
- Focused lint: `pnpm exec eslint apps/mobile/src/hooks/use-speech-recognition.test.ts` passed.
- GC6/internal mock check: `rg -n 'jest\.mock' apps/mobile/src/hooks/use-speech-recognition.test.ts` found no matches.
- Commit hooks ran and passed: lint-staged eslint/prettier, sync-skills, and i18n orphan/keep checks.
- Pre-push validation passed: incremental `tsc --build`, related mobile Jest test, `check:i18n:orphans`, and `check:i18n`.
- Pushed commit `15d5a8d77617a3d1acd1d842068ed2476db664e5` to `origin/WI-928`.

**Caveats / Follow-ups:**
- `pnpm install` printed cleanup warnings for stale partial `node_modules/.pnpm` entries left by the earlier interrupted setup, but install completed successfully and verification passed.
- Jest/pre-push printed the existing `baseline-browser-mapping` age advisory and a forced-exit note after related tests; the commands exited 0 on green runs.
- Per instruction, Cosmo complete was not run.
