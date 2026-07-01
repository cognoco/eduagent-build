**What was done:**
- Fixed WI-951 (Onboarding pronouns Skip fires mutate with no onError/Sentry) by making the Skip pronoun-clear mutation observable when its best-effort network call fails.

**What changed:**
- `apps/mobile/src/app/(app)/onboarding/pronouns.tsx`: imported the local Sentry wrapper and added an `onError` callback to `updatePronouns.mutate({ pronouns: null }, ...)` in the Skip path. The callback captures the error with `screen=onboarding_pronouns` and `action=skip_clear_pronouns`; navigation still happens before the best-effort clear.
- `apps/mobile/src/app/(app)/onboarding/pronouns.test.tsx`: extended existing Skip assertions to require an `onError` callback and added regression coverage that invokes the callback, asserts Sentry capture, and confirms no blocking error alert is shown.

**Verification:**
- RED: `pnpm test:mobile:unit -- --runTestsByPath 'apps/mobile/src/app/(app)/onboarding/pronouns.test.tsx' --no-coverage` failed before the fix with `Test Suites: 1 failed, 1 total` and `Tests: 4 failed, 20 passed, 24 total`; failures showed Skip mutation calls lacked the expected options object / `onError`.
- GREEN: same focused command passed after the fix with `Test Suites: 1 passed, 1 total` and `Tests: 24 passed, 24 total`.
- Final focused test after formatting: same focused command passed with `Test Suites: 1 passed, 1 total` and `Tests: 24 passed, 24 total`.
- `pnpm exec eslint 'apps/mobile/src/app/(app)/onboarding/pronouns.tsx' 'apps/mobile/src/app/(app)/onboarding/pronouns.test.tsx'` passed; output included only the known Nx project-graph cache warning and no lint findings.
- `pnpm exec tsc -p apps/mobile/tsconfig.json --noEmit` passed with no output.
- `git push origin HEAD:WI-951` pushed the local commit; remote readback: `bc48a6d302968b0a8d5e9c9067e658ef102274e0 refs/heads/WI-951`.

**Caveats / Follow-ups:**
- No Cosmo complete was run, per coordinator instruction.
- Jest emitted existing environment warnings about Expo native module shims / `EXPO_OS` and a stale `baseline-browser-mapping` notice; the test suite still passed.
