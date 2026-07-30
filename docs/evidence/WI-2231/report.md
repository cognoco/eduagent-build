# WI-2231 — V2 profile/consent exits and first Mentor session evidence

Date: 2026-07-30

## Root cause and correction

Successful first-profile creation and successful legal-consent completion
closed their screens through history-aware navigation whose fallback was the
legacy Home route. In the V2 shell this could return a new user to Home instead
of Mentor. Completion now uses the existing shell-aware post-auth destination;
cancel, pending-consent, and ordinary add-profile exits retain their existing
history behavior. The parent first-setup child leg carries an explicit
completion marker so it also exits to the active shell.

The first-session journeys now cover the same deterministic opener from the
pre-profile gate through the cold Mentor card, one persisted learner/assistant
pair, reflection, celebration, and return to a warm Mentor surface. An
E2E-build-only transcript marker distinguishes exactly one persisted opening
pair from a duplicate.

## Red, green, production revert, restore

The exit tests were authored first. Against the original production code:

```bash
pnpm test:mobile:unit --runTestsByPath \
  apps/mobile/src/app/create-profile.test.tsx \
  apps/mobile/src/app/consent.test.tsx \
  --runInBand
```

The run exited 1 with eight new failures: flags-off, V0, V1, and V2 for each
exit. The existing 93 cases passed. After the correction, the two complete
suites passed 102 of 102 tests.

The persisted-opener markers were likewise authored before their production
surface. Their focused run exited 1 with two missing-marker failures, then
passed after the marker implementation.

For the final controlled production-revert proof, only the completion calls
were restored to history-aware close and the two transcript markers were
suppressed. No test code changed. This command:

```bash
pnpm test:mobile:unit --runTestsByPath \
  apps/mobile/src/app/create-profile.test.tsx \
  apps/mobile/src/app/consent.test.tsx \
  'apps/mobile/src/app/(app)/session/index.test.tsx' \
  --runInBand --silent --testNamePattern='\[WI-2231\]'
```

exited 1 with exactly 11 failures: four first-profile shell variants, four
consent shell variants, the V2 parent first-setup child leg, and both
exactly-once transcript-marker cases. After restoring the production
correction, the identical command exited 0 with 11 passed and 188 skipped.
This isolates the named guards' dependence on the production behavior.

## Acceptance mapping

- Profile creation: flags-off, V0, and V1 remain Home; V2 reaches Mentor.
- Legal-consent success: flags-off, V0, and V1 remain Home; V2 reaches Mentor.
- Parent first setup: the add-child continuation reaches Mentor under V2.
- Browser journey: pre-profile legal/profile gate, cold Mentor, exact opener,
  one server transcript exchange with distinct event identities, reflection,
  celebration, and warm Mentor return.
- Release-APK journey: the same user-visible sequence plus the exactly-once
  transcript evidence marker is registered in the V2 CI manifest.

## Local verification boundary

Only unit, typecheck, lint, formatting, and static Maestro validation are
authorized with the staging-sourced local environment. No integration, E2E,
database, or release-APK execution was performed locally. The browser and
release-APK journeys are intended for their trusted CI environments.

After advancing to current `origin/main`, final local verification produced:

- 199/199 tests passing across the complete create-profile, consent, and
  session-screen unit suites.
- An uncached mobile typecheck passing with all six dependent projects.
- Changed-file ESLint passing with no errors; its two warnings are pre-existing
  hook-dependency warnings in the touched production files.
- Prettier and `git diff --check` passing.
- All seven Maestro static-validator checks passing.
- The hard V2 plan builder selecting
  `flows/v2/v2-first-mentor-session.yaml` with `pre-profile` on shard 1.

A fresh adversarial review found that the initial flow omitted its required
source seed marker and could tap through the full-screen Mentor-birth ceremony.
The final flow declares `SEED_SCENARIO: "pre-profile"` and waits for
`mentor-born-ceremony-overlay` to disappear; the hard plan and static validator
then passed.

The test diff adds no internal production-module mock (GC6 deferral: none).
