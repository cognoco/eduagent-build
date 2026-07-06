# WI-1401 review evidence — 2026-07-06, reviewer claude-code:reviewer-ws44

WI-1401 (Retire or fix stale + placeholder e2e yamls reporting false coverage)
Workstream: WS-44 Coverage Debt (3938bce9-1f7c-81ad-add6-f36bf7c317bc)
PR: https://github.com/cognoco/eduagent-build/pull/1941 (MERGED 2026-07-06T11:00:32Z, base main)
Fixed In: 25cb0887142073f6ea8726e68a10dc89f426a590 (= squash merge commit; ancestor of origin/main, verified via `git branch -a --contains` after fetch)

## Commands run
- `bun <cosmo>/skills/review/review.ts --check WI-1401` → mechanical DoD ✓ (0 gaps), 6 manual checks
- `bun <cosmo>/skills/qa/qa.ts verify WI-1401 --repo . --skip-tests` → initial "commit NOT found" was stale local clone; resolved by `git fetch` (commit exists on origin/main)
- `gh pr view 1941` → MERGED, mergeCommit = Fixed In
- `gh pr checks 1941` → 14 passed / 0 failed
- `gh api .../commits/25cb088.../check-runs` → maestro-validator SUCCESS; Mobile Maestro E2E Tests SUCCESS (but see masking below)
- `git grep` at 25cb088 for removed literals (Tonight, Conversation starters, titleEvening, grace-period-banner, switch-to-teen, cancel-deletion-button) in e2e flows → comments only, ZERO live assertions ✓
- `git grep` at 25cb088 for new testIDs in src → all exist:
  - parent-home-child-starter-${child.id} → ParentHomeScreen.tsx:526
  - parent-home-family-summary → ParentHomeScreen.tsx:600
  - consent-withdrawn-empty-state → child/[profileId]/index.tsx:976
  - consent-withdrawn-request-cta → index.tsx:992; withdraw-consent-button → :733; child-detail-scroll → :1033
- `gh run view 28787489102 --log` (E2E Tests on merge commit) → full analysis below

## AC-by-AC
- AC1 ✓ (static): all five scoped YAMLs addressed in the diff; none asserts removed copy/testIDs.
- AC2 ✓ (static): Tonight / Conversation starters assertions replaced with specific testIDs (not generic screen-visible). Both testIDs exist in ParentHomeScreen.tsx.
- AC3 ✓: post-auth-comprehensive-devclient.yaml demoted (tag `blocked`, in-file rationale, QA-02 inventory rows updated in mobile-app-flow-inventory.md + flow-revision-plan). Hard-taps remain only in the parked body; file matches no CI include-tag set (tags: blocked,devclient,post-auth,comprehensive vs CI smoke/nightly/pr-blocking).
- AC4 ✓ (static): grace-period-banner wait replaced by consent-withdrawn-empty-state → restore CTA → child-detail-scroll → withdraw button path; matches index.tsx testIDs and index.test.tsx:1179-1230 (WI-263). Both inventory docs updated.
- AC5 ✓: retention/library.yaml relabeled Library navigation (tags retention→library,navigation; pr-blocking + nightly pre-existing, header comment was stale). LEARN-08/LEARN-16/gap-table doc claims reconciled.
- AC6 ✗ PARTIAL — grep/static check ✓ (independently re-run), syntax validation ✓ (maestro-validator green on merge commit), but **emulator execution of the repaired flows: MISSING**. Completion summary admits it (no device, no Metro). CI did not and can not supply it (below).

## CI e2e findings (pre-existing infra, NOT introduced by WI-1401)
Run 28787489102 "E2E Tests" on merge commit, job "Mobile Maestro E2E Tests", step "Run Maestro E2E tests":
1. `maestro test apps/mobile/e2e/flows/ --include-tags=smoke,pr-blocking` selected only 2 flows — app-launch, app-launch-devclient (both at flows/ root). ~29 flows carry smoke or pr-blocking tags, all in subdirectories, none ran. CI Maestro coverage is effectively 2 root-level launch flows.
2. Both selected flows FAILED ("2/2 Flows Failed", 11:20:50Z; app-launch: sign-in-button not visible; app-launch-devclient: welcome-chooser not visible) yet the step/job/check concluded SUCCESS: android-emulator-runner executes each script line as a separate `sh -c`, so `MAESTRO_EXIT` set on the maestro line is lost and `exit ${MAESTRO_EXIT:-0}` always exits 0 (e2e-ci.yml:472-479). The failure-screenshot/logcat conditional lines are dead for the same reason. The "Mobile Maestro E2E Tests" green check is structurally vacuous.
3. Consequence for this WI: the completion summary's "GitHub PR checks completed successfully" is true for required checks but provides zero device-execution evidence for the repaired flows (parent flows are nightly/parent-tagged and in subdirs — never selected on any trigger given finding 1).

## Runtime risk making AC6's device run non-waivable
parent-dashboard.yaml hard-asserts `parent-home-child-starter-${CHILD_PROFILE_ID}`; that node renders only when `resolveParentCardCopy(dashboardChild, latestRecap, t)` yields a starter AFTER the dashboard row loads (ParentHomeScreen.tsx:394-401, 525-531; parent-card-copy.ts:161 has a fallbackStarter, so data-presence is likely OK, but load-timing is a plain assertVisible race). Only an emulator run proves the repaired flows pass.

## Disposition
REWORK — AC6 emulator-execution evidence missing for the repaired flows
(parent/parent-dashboard.yaml, parent/multi-child-dashboard.yaml, parent/consent-management.yaml).
Policy overrides applied: WP-child formality waived for WS-44 (kickoff) — not needed here (direct Item, no WP). No other DoD relaxation.
