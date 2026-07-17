# WI-2094 Mentor send regression evidence

This report preserves the red/green/revert/restore proof for **WI-2094 — Route valid Mentor statements instead of silently ignoring send; BID-13 Mentor loop launch-blocker; fixed on the WI branch**.

All commands ran from `/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2094`.

## Root cause and candidate

`matchBarIntent()` classified ordinary non-question declaratives as uncertain after the closed-catalog and question checks. `LearnerMentorScreen` handled that result with `setShowLightPractice(true)`, but thin/default feeds already rendered light practice, so the first enabled Send could leave the visible screen unchanged.

The candidate keeps questions and closed-catalog jumps intact, returns substantive declaratives as Mentor turns, keeps short/ambiguous/unsupported navigation-shaped inputs uncertain, and renders an accessible clarification state for that uncertain result. The production changes remain inside the learner-default dispatch path.

Candidate implementation commit: `2953184ddf154089219676024c34755d6179231d`.

Regression test blob: `3fcb7628d555cae6b7eda81ede8890867ec95e7f`.

## Immutable proof matrix

| Phase | Immutable revision | Production state | Result | Raw result |
| --- | --- | --- | --- | --- |
| RED | `1078e8dbcddf48002f8be639cbca561c34535ae7` | Both production files are byte-identical to baseline `00a9db01dfffe77b6ef6add3322dcb84762b26a7`; the new boundary tests remain present | 1 suite failed; 8 failed, 20 passed, 28 total | [red-baseline-replay.json](red-baseline-replay.json) |
| GREEN | `2953184ddf154089219676024c34755d6179231d` | Candidate production fix | 1 suite passed; 28 passed, 28 total | [green-candidate.json](green-candidate.json) |
| REVERT | `1078e8dbcddf48002f8be639cbca561c34535ae7` | Disposable commit reverts only the two production files; a separate invocation reproduces RED | 1 suite failed; 8 failed, 20 passed, 28 total | [revert-production-only.json](revert-production-only.json) |
| RESTORE | `6c4a30cdab0f4f1c1a061e00645365d9d4228abd` | Exact candidate production files restored | 1 suite passed; 28 passed, 28 total | [restore-green.json](restore-green.json) |

The first chronological RED, run before any production edit, also reported 8 failed and 20 passed. The durable RED replay above reconstructs the same state with immutable baseline production content and the immutable regression-test blob. `git diff 00a9db01dfffe77b6ef6add3322dcb84762b26a7 1078e8dbcddf48002f8be639cbca561c34535ae7 -- 'apps/mobile/src/app/(app)/mentor.tsx' apps/mobile/src/lib/bar-intent-match.ts` returns no output. `git diff 2953184ddf154089219676024c34755d6179231d 6c4a30cdab0f4f1c1a061e00645365d9d4228abd -- 'apps/mobile/src/app/(app)/mentor.tsx' apps/mobile/src/lib/bar-intent-match.ts` also returns no output.

## Exact phase commands

RED:

```bash
rtk pnpm exec jest --runTestsByPath '/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2094/apps/mobile/src/app/(app)/mentor.test.tsx' --runInBand --no-coverage --json --outputFile='/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2094/docs/evidence/WI-2094/red-baseline-replay.json'
```

GREEN:

```bash
rtk pnpm exec jest --runTestsByPath '/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2094/apps/mobile/src/app/(app)/mentor.test.tsx' --runInBand --no-coverage --json --outputFile='/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2094/docs/evidence/WI-2094/green-candidate.json'
```

REVERT:

```bash
rtk pnpm exec jest --runTestsByPath '/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2094/apps/mobile/src/app/(app)/mentor.test.tsx' --runInBand --no-coverage --json --outputFile='/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2094/docs/evidence/WI-2094/revert-production-only.json'
```

RESTORE:

```bash
rtk pnpm exec jest --runTestsByPath '/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2094/apps/mobile/src/app/(app)/mentor.test.tsx' --runInBand --no-coverage --json --outputFile='/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2094/docs/evidence/WI-2094/restore-green.json'
```

## Final validation at the restored candidate

- Impacted Jest command: `pnpm exec jest --runTestsByPath <absolute mentor.test.tsx> <absolute MentorInputBar.test.tsx> <absolute bar-intent-match.test.ts> <absolute bar-intent-match.adversarial.test.ts> --runInBand --no-coverage` — exit 0; 4 suites passed; 62 tests passed.
- `pnpm exec nx run @eduagent/mobile:typecheck` — exit 0; the mobile target and six dependencies succeeded (Nx cache hit).
- `pnpm exec nx run @eduagent/mobile:lint` — exit 0; 0 errors and the existing 51-warning baseline (Nx cache hit). No internal-mock warning points at the changed Mentor test after its three GC6 Pattern A conversions.
- `pnpm prepush` — exit 0; `tsc --build` succeeded.
- `pnpm format:check` — exit 0; the repository's three configured format targets succeeded.

Jest emitted the repository's existing warnings for the unsupported `passWithNoTests` config option, stale `baseline-browser-mapping` data, Expo native modules in Jest, missing inlined `EXPO_OS`, and the i18n test log. None changed the exit status or assertions.

## Environment and device check

Only Node `v24.18.0` and pnpm `10.19.0` were available; no `node22`, mise, fnm, or Volta executable was present. The repository requested Node 22 and emitted an engine warning under Node 24. The targeted tests, typecheck, lint, pre-push TypeScript build, and formatting checks all succeeded, so no result indicates that the engine mismatch affected this change.

Preview-Android preflight on this Linux host found no `adb` executable, no Maestro executable, and no Metro listener on port 8081. A live preview-device flow therefore could not run here. The public boundary test `small-screen-360` still verifies a 360px window, interactive input and send controls within the scroll container, keyboard tap persistence, and exact freeform navigation after arrow submission.

## Adversarial runtime-assumption review

- `matchBarIntent()` has one production consumer, the learner Mentor screen; supporter-hub/person dispatch remains outside the changed function body.
- Exact raw input crosses the existing session route unchanged with `mode=freeform`; no session creation, persistence, Challenge Round, or `WI-2112` behavior changed.
- Explicit deterministic deep links still use the existing closed mapper, questions keep the existing freeform path, and ambiguous catalog matches no longer fall through into declaratives.
- Unmatched navigation-shaped commands remain uncertain rather than becoming fabricated destinations; the clarification uses existing localized copy and an accessibility live region.
- The 360px interaction assertion checks containment and successful submission rather than a snapshot.
- The changed test converted all three pre-existing internal mocks to `jest.requireActual()` plus targeted overrides and introduced no new internal mock site.
