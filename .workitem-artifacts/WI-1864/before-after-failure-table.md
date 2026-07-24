# WI-1864 nightly release-APK failure table

Source runs:

- Original: https://github.com/cognoco/eduagent-build/actions/runs/29165021309
- Repeated scheduled failure: https://github.com/cognoco/eduagent-build/actions/runs/29557903038
- Latest reviewed-head diagnostic run: https://github.com/cognoco/eduagent-build/actions/runs/29849751862 (failed; all eight first failures dispositioned in the next candidate)
- Final green reviewed-head run: https://github.com/cognoco/eduagent-build/actions/runs/29976956056

| Shard | Selected scenario | First failing flow / assertion | Root-cause bucket | Final disposition |
|---|---|---|---|---|
| 3 | `more-impersonated-child` | `flows/account/more-impersonated-child.yaml`; obsolete proxy-entry journey remained executable despite its PARKED header | Planner admitted prose-only parking | Retained the rationale but tagged the flow `blocked`/`manual`; structural planner coverage proves every PARKED flow is machine-excluded. No proxy doorway was added. |
| 5 | `dictation-with-mistakes` | `flows/dictation/dictation-review-flow.yaml`; `practice-dictation` was below the visible viewport (and the later picker lacked a CI-planted image) | Release-APK flow prerequisite/navigation drift | Scrolls to the dictation control and the shard runner installs and media-scans a deterministic gallery fixture before Maestro. |
| 7 | `learner-mentor-memory-populated` | `flows/account/learner-mentor-memory-populated.yaml`; expected `learner-screen` from a parent seed and after a helper that now ends on child detail | Duplicate, unreachable legacy journey | Retired the duplicate flow; the supported parent-native `parent/child-mentor-memory-populated.yaml` remains scheduled as the distinct reachable coverage. |
| 8 | `learner-mentor-memory-empty` | `flows/account/learner-mentor-memory.yaml`; Android hardware Back returned to Mentor/home, so the following More-row assertion failed | Unsupported navigation assumption | Uses the screen's supported explicit return-to-More interaction and asserts More is restored before checking its rows. |

## Newly exposed failure isolation

| Source run / shard | Flow | Root cause | Machine isolation | PM intake / owner | Unblock condition |
|---|---|---|---|---|---|
| `29849751862` / 4 | `flows/onboarding/preview-self.yaml` | The release sign-in screen cannot render `try-mentomate-cta` while `PREVIEW_ENTRY_CTA_ENABLED` is hard-disabled. | Retained the journey and added `blocked`, so the planner excludes it from nightly execution. | [WI-2586 — restore the self-preview entry before re-enabling its nightly Maestro flow](https://www.notion.so/3a48bce91f7c815ca25bdb077de9054c); owner: MentoMate Program Manager (product decision and routing). | Product enables the flag, retains a user-visible release-build CTA, and this exact flow passes against the release APK before `blocked` is removed. |

The final nightly plan contains 132 executable flows across eight shards. Run
https://github.com/cognoco/eduagent-build/actions/runs/29976956056 completed all
eight Maestro shard jobs successfully at the reviewed PR head; the reviewed head
and landed squash commit have identical Git trees. None of the four first-flow
failures recorded above recurred: the obsolete proxy and duplicate-memory flows
were excluded by the machine-readable plan, while the corrected dictation and
empty-memory journeys ran successfully.
