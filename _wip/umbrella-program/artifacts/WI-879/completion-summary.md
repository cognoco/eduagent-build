# WI-879 — Update consent browser journeys for Mentor home and Family readiness

**What was done:** Fixed two Playwright Chrome consent journeys (J-13, J-21) that
asserted stale legacy readiness destinations while the current staging nav shell
routes those accounts elsewhere. Verified both green against staging Chrome, opened
PR #1312, and squash-merged to `main`.

**What changed:**

- J-13 (`apps/mobile/e2e-web/flows/journeys/j13-consent-pending-parent-approval.spec.ts`):
  post-approval destination changed from `create-subject-name | learner-screen`
  (stale V0 onboarding-funnel contract) to `mentor-screen`. A freshly-approved
  learner lands on the Mentor home feed (`apps/mobile/src/app/(app)/mentor.tsx:233`).
  Confirmed by the live page snapshot rendering the Mentor feed (title "Mentor",
  "What do you want to work on?" composer, homework/teach/question prompts) — not
  `LearnerScreen` (which would render `home-action-homework` / `home-action-study-new`)
  and not the legacy create-subject screen. The e2e-web nav posture is V0+V1 on, V2
  off, sourced from Doppler stg in both the local `doppler run -c stg` flow and the
  CI e2e-web export.
- J-21 (`apps/mobile/e2e-web/flows/journeys/j21-parent-consent-management.spec.ts`):
  readiness contract `landingTestId` changed from `learner-screen` to
  `parent-home-screen`. A `parent-multi-child` adult owner resolves as a guardian and
  lands directly on FamilyHome — verified in `navigation-contract.ts` for both V1-on
  (`familyShape`) and flags-off (`showLegacyFlagsOffFamilyHome`) postures. Mirrors the
  WI-801 fix to the `ownerWithChildren` auth scenario in
  `apps/mobile/e2e-web/fixtures/scenarios.ts`. No consent behavior assertion was
  weakened in either spec — pending-gate block, parent web approval, gate clearing,
  withdraw/paused-copy/request-again all retained.

**Verification:** `pnpm exec tsc --noEmit` (mobile) green;
`doppler run -c stg -- playwright test --project=setup --project=later-phases -g "J-13"`
= 3 passed; same for `-g "J-21"` = 3 passed. PR #1312: all 4 REQUIRED checks SUCCESS
(`main`, `Playwright web smoke`, `API Quality Gate`, `Merge completeness check`);
`claude-review` ran, verdict APPROVED (0 must-fix / 0 should-fix / 0 consider).
Squash-merged to `main` as `493b0a0adecea4d750c2e64ad5757598d047e74e`.

**Caveats / Follow-ups:** The non-required check "Flag-ON integration
(IDENTITY_V2_ENABLED)" failed on the PR (and on re-run) in
`apps/api/src/services/family-bridge.undo-orphan.integration.test.ts` — a
`subjects_profile_id_profiles_id_fk` violation in the test's `seedFamily` /
`seedLearningTree` setup. Unrelated to this WI's diff (two mobile e2e-web Playwright
specs cannot affect an API integration test's DB seed); it is shared-staging-DB
pollution from concurrent consent/identity teardown work (WI-880 consent-seed FK
ordering; WI-849 whole-org erasure edge teardown). The same job was green on `main`
at the base commit `f41344ba`. Not a required check; merge proceeded on the 4 green
required checks. Follow-up: WI-880's consent-test-seed FK ordering fix should clear
the staging-DB pollution. Coordination: rebased onto current `origin/main` (incl.
WI-849) before merge; no spec conflicts with WI-880 (it had not landed any J-13/J-21
changes to `main`).
