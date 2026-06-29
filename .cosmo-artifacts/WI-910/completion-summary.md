**What was done:** Fixed WI-910 by preserving celebration queue entries that are filtered into eligibility but do not fit under the per-batch display cap.

**What changed:** Added a stable queue-entry key helper in `apps/mobile/src/hooks/use-celebration.tsx`. Changed queue ingestion so `seenQueueKeysRef` is updated only after `toShow` is selected. Added a regression test in `apps/mobile/src/hooks/use-celebration.test.tsx` proving a third over-cap celebration remains eligible when a later batch arrives.

**Verification:** RED: `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand apps/mobile/src/hooks/use-celebration.test.tsx --no-coverage` failed before the fix with 1 failed, 18 passed, 19 total; the overflow entry was skipped and the new batch entry appeared first. GREEN worker run passed with 1 suite and 19 tests. Coordinator reran the same focused test, which passed with 1 suite and 19 tests. Worker also reported lint, mobile typecheck, whitespace check, and pre-push hook passed, including related mobile Jest with 3 suites and 77 tests.

**Caveats / Follow-ups:** Jest emitted existing Expo/native warning noise during focused and pre-push test runs, but all invoked tests passed. Nx reported `@eduagent/mobile:typecheck` as flaky even though the explicit rerun passed. No PR was created.
