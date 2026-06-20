What was done: Closed the remaining accommodation-related branch-coverage gaps flagged in the flow-revision plan for ACCOUNT-08 (accommodation picker) and CC-07 (accommodation badge surfaces), with deterministic tests. No source changes — test + doc only. Delivered via PR #1313, squash-merged to main.

What changed:
- apps/mobile/src/app/(app)/mentor-memory.test.tsx — added "shows older label for adult bracket": asserts the adult/`older` age-bracket badge branch (`return labels.older` → "Accommodation mode: …"), previously unexercised (both prior tests asserted only the adolescent `.mid` "Learning style: …" label). Red-green verified.
- apps/mobile/src/app/(app)/more/accommodation.test.tsx — added "does not PATCH when the already-active mode is re-selected": covers the picker restore/no-op edge (`handleSelectAccommodation` early-returns on `mode === currentMode`).
- apps/mobile/src/app/(app)/child/[profileId]/index.test.tsx — added "shows the None accommodation subtitle when the mode is none": covers the child-settings row `none`-mode subtitle branch.
- docs/flows/plans/flow-revision-plan-2026-06-17.md — updated the ACCOUNT-08 and CC-07 rows to cite the new deterministic coverage instead of "source-checked".

CC-07's other surfaces were already deterministically covered (role-gated `setByParent` caption both ways; self picker; child row render/nav/active-name; WITHDRAWN→restore gate). The ACCOUNT-08 child-editor consent-withdrawn → restore path is covered by the existing WI-263 block.

Verification:
- jest on all 3 affected suites: 82 passed.
- tsc --noEmit (mobile): clean (the nx mobile:typecheck TS6305 errors were the known cold-cache stale-dist trap in untouched files, absent from CI).
- No new internal jest.mock (GC1/GC6 clean) — all tests use real-implementation harnesses against the routed mock fetch.
- PR #1313 CI: all required checks green — main, Playwright web smoke, API Quality Gate, Merge completeness check. claude-review = APPROVED (0 must-fix / 0 should-fix / 0 consider).
- Squash-merged to main as 4621d1dccbeaa3ad6dba444f596c8ec5e800b212.

Caveats / Follow-ups:
- The non-required "Flag-ON integration (IDENTITY_V2_ENABLED)" lane was red on the PR, but the failures are env/infra (VOYAGE_API_KEY not available, "No provider registered for: openai", safe-send timeouts, "Cannot log after tests are done") in the API integration suite — zero file overlap with this mobile+doc diff, so not a regression from this change. It is not a required check.
- The `noLearningPreferenceSet` fallback subtitle (child settings) is effectively unreachable for valid accommodation modes (`'none'` resolves to the "None" option), so it was intentionally NOT tested — forcing an invalid mode would be an unreal test. No follow-up needed unless an invalid-mode path is introduced.
