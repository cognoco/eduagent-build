What was done:

Fixed WI-920 by preventing `use-nudges` read mutations from invalidating unread nudge queries when no active profile id is available.

What changed:

- Added guards in `useMarkNudgeRead` and `useMarkAllNudgesRead` before calling `queryClient.invalidateQueries`.
- Added regression tests covering mark-one and mark-all read success responses with no active profile.

Verification:

- RED: `use-nudges.test.ts` failed because both mutations invalidated `['nudges', 'unread', undefined]`.
- GREEN: `jest.CMD -c apps/mobile/jest.config.cjs apps/mobile/src/hooks/use-nudges.test.ts --no-coverage --runInBand` passed, 2 tests.
- `eslint.CMD apps/mobile/src/hooks/use-nudges.ts apps/mobile/src/hooks/use-nudges.test.ts` exited 0.
- `tsx.CMD scripts/check-gc1-pattern-a.ts` exited 0.
- `tsc.CMD --noEmit -p apps/mobile/tsconfig.json` exited 0.

Caveats / Follow-ups:

- Worktree-local dependency install was incomplete after the repaired setup, so verification used the main checkout's installed tool binaries against the WI-920 worktree files.
