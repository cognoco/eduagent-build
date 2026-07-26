# WI-1864 — release-APK nightly shard evidence redelivery

This report makes the acceptance evidence for **WI-1864 — Nightly Maestro
suite: 4 of 8 shards failing on first nightly since the release-APK switch**
durable in the reviewed revision. The implementation landed in PR #2439 at
`16ea47ddd342f7f45d82f5ae85dbd3edfd084841`; this follow-up changes no runtime
or test behavior.

## Before/after failure table

Source runs:

- Original failing nightly: https://github.com/cognoco/eduagent-build/actions/runs/29165021309
- Repeated scheduled failure: https://github.com/cognoco/eduagent-build/actions/runs/29557903038
- Final exact-head green nightly-mode run: https://github.com/cognoco/eduagent-build/actions/runs/29976956056

| Shard | Selected scenario | First failing flow / assertion | Root-cause bucket | Final disposition |
|---|---|---|---|---|
| 3 | `more-impersonated-child` | `flows/account/more-impersonated-child.yaml`; the obsolete proxy-entry journey remained executable even though its PARKED header said it was outside the manifest. | Planner admitted prose-only parking. | Retained the rationale, added the machine-readable `blocked` exclusion, and added structural planner coverage. No production proxy doorway was added. |
| 5 | `dictation-with-mistakes` | `flows/dictation/dictation-review-flow.yaml`; `practice-dictation` was below the visible viewport, and the later picker lacked a CI-planted image. | Release-APK navigation and fixture drift. | Scroll to the control; the runner installs and media-scans a deterministic gallery fixture before Maestro. |
| 7 | `learner-mentor-memory-populated` | `flows/account/learner-mentor-memory-populated.yaml`; it expected `learner-screen` from a parent seed and after a helper that now ends on child detail. | Duplicate, unreachable legacy journey. | Retired the duplicate; the distinct supported `flows/parent/child-mentor-memory-populated.yaml` journey remains scheduled. |
| 8 | `learner-mentor-memory-empty` | `flows/account/learner-mentor-memory.yaml`; Android hardware Back returned to Mentor/home, so the subsequent More-row assertion failed. | Unsupported navigation assumption. | Use the explicit return-to-More control and assert that More is restored before checking its rows. |

The final plan contained 132 executable flows. Run `29976956056` completed API
integration and all eight release-APK Maestro shard jobs. Neither excluded
obsolete flow ran, both corrected retained journeys completed, and none of the
four original first-flow failures recurred.

## Red/green/revert/restore receipt

Executed on Orion at `2026-07-26T14:47:02Z` against the landed implementation.
The regression guard is
`scripts/e2e-ci-injection-and-smoke-gate.test.ts`, test
`[WI-1864] keeps every prose-parked flow machine-excluded from scheduled suites`.

Every execution used:

```text
pnpm exec jest --config scripts/jest.config.cjs e2e-ci-injection-and-smoke-gate.test.ts --runInBand --testNamePattern="keeps every prose-parked flow machine-excluded"
```

1. Fixed baseline: `PASS (1) FAIL (0) skipped (136)`.
2. Controlled revert: removed only the `blocked` tag from
   `apps/mobile/e2e/flows/account/more-impersonated-child.yaml`.
3. Red result: `PASS (0) FAIL (1) skipped (136)`. The guard failed with
   `Expected: ArrayContaining [StringMatching /^(blocked|manual)$/]` and
   `Received: ["nightly", "account"]`.
4. Restore: restored the exact `blocked` tag.
5. Green result: `PASS (1) FAIL (0) skipped (136)`.
6. Cleanliness: `git diff --exit-code` returned 0 after restoration.

This proves that the guard detects the original prose-only-parking defect,
passes with the landed fix, fails when that fix is reverted, and passes again
after restoration.

The same focused guard was re-run after rebasing the evidence branch onto
`origin/main` at `4dc483b25320c2f046f1e8d28fddc1606da9ae94` and returned
`PASS (1) FAIL (0) skipped (159)`. The current planner still returns 132 flows.
GitHub's run metadata independently reports success for shard jobs 1 through 8.

## Scope and caveats

This is an evidence-only redelivery. The authoritative heavy/native receipt
remains run `29976956056`; no new APK run is necessary because this follow-up
does not change executable source, tests, workflow configuration, or native
artifacts. No deploy or EAS update was performed.
