## Completion Summary — WI-865 ([CC-05] prove recovery marker wins continuation priority collision)

**What was done:** Added deterministic [CC-05] unit proof that a fresh SecureStore
recovery marker wins the home coach-band when a server resume target and an overdue
review target also collide, completed the continuation-priority matrix, and documented
the native cold-start boundary as a parked-E2E path with a unit-side proof citation.

**What changed:** `apps/mobile/src/components/home/LearnerScreen.test.tsx` (+156):
3-way priority collision test (recovery beats resume beats overdue), a sibling test
proving resume beats overdue when no recovery marker is present, and a
`toHaveBeenNthCalledWith` assertion pinning that `pushLearningResumeTarget` seeds
`/(app)/home` BEFORE the session push (cross-tab ancestor-chain ordering).
`apps/mobile/e2e/flows/learning/resume-crash-recovery.yaml` cites the new [CC-05]
tests as the unit-side proof for the parked native E2E path.

**Verification:** Delivered via PR #1251 (author `crowka`), squash-merged to `main`
as `fc8a6be10`. `main` branch-protection required checks green at merge. Red-green
verified in-PR (neutralizing the recovery arm fails the collision test). Reuses the
existing gc1-allow session-recovery / api-client / expo-router mocks — no new internal
mocks. CodeRabbit ordering finding addressed.

**Caveats / Follow-ups:** Native cold-start crash-recovery E2E remains parked; this
WI delivers the unit-side proof only. Test + doc only. No follow-ups.
