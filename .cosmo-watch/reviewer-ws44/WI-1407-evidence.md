# WI-1407 review evidence — reviewer claude-code:reviewer-ws44

## Round 2 — 2026-07-05T21:58Z — DISPOSITION: DONE (Reviewing→Closed, Resolution=Done)

Prior round-1 rework blocker (dod.4 "not landed") is RESOLVED. Full DoD verified NOW against reality.

### Landing (the round-1 blocker, now cleared)
- PR #1939 state=MERGED, mergedAt 2026-07-05T21:36:43Z, mergedBy crowka.
- Squash-merge commit `8b6dd54f3fd7fd1995f7e6b00b8e39c57f2361db` = current `origin/main` tip.
- `Fixed In` correctly re-pointed 637d09dc → 8b6dd54 (squash sha). Branch commit 637d09dc is not
  an ancestor of main by design (squash creates a new commit) — not a gap.
- Reviewed the LANDED commit via `git show 8b6dd54`, not the working tree (local main was behind).

### CI on merged commit 8b6dd54 (verified NOW)
- `gh pr checks 1939`: 13 passed, 0 failed (ota-update SKIPPED — expected).
- Required lanes green: main, API Quality Gate, Merge completeness, maestro-validator,
  Playwright web smoke, run-smoke, changes, Flag-ON integration, decision-adr-link, adr-provenance,
  reference-only-gate, rollback-section, claude-review.
- claude-review verdict comment: APPROVED, review green: true, 0 must/should/consider.

### AC-by-AC (against landed diff — real behavior, lane invariant respected)
- AC1 ProfileBasicsStep.test.tsx `[WI-1407] blocks child save when the parent birth year is under 18`:
  renders real component, under-18 parent birth year (currentYear-16); asserts save-basics-adult-required
  renders, Continue disabled, mockFetch (network boundary) NOT called, onComplete NOT called. REAL.
- AC2 mentor-memory.test.tsx `[WI-1407] self privacy writes` grant/decline: real MentorMemoryScreen,
  consent pending; POST learner-profile/consent body {consent:'granted'|'declined'}, url NOT
  /test-profile-id/ (self, no childProfileId), via globalThis.fetch boundary — real api-client. REAL.
- AC3 injection toggle → POST learner-profile/injection {memoryInjectionEnabled:false}; clear-all →
  learner-profile/all. REAL.
- AC4 e2e/flows/onboarding/preview-parent-minor-owner-rejected.yaml (94 lines): tagged `manual`,
  header marks verify-at-e2e-run; asserts save-basics-adult-required visible + save-confirm-land NOT
  reached. Honestly deferred device evidence — no faked device run. Lane invariant respected.
- AC-test red-green-revert: completion summary documents remove adultGatePasses → regression fails →
  restore → green.

### Lane invariant (tests exercise real behavior)
- WI-1407 diff adds NO new internal jest.mock — only new createRoutedMockFetch routes + new it/describe
  blocks. GC1 clean. Pre-existing mocks are external-boundary (api-client transport, theme/nativewind,
  expo-router, SecureStore, platform-alert, sentry, safe-area) and gc1-allow-annotated.
- GC6 deferral (3+7 pre-existing internal mocks) documented in completion summary with counts — acceptable.

### Producer-is-not-closer
- Executed By codex:builder:WI-1407 ≠ reviewer claude-code:reviewer-ws44. Independent close OK.

### Policy overrides applied
- Landing branch = main (lane policy). WP-child formality waived (direct Item, no WP) — WS-44 lane policy.

### Cosmo mutations
- Stage: Reviewing → Closed; Resolution=Done; Completed 2026-07-05T21:58; claim cleared.
- Close comment posted: 3948bce9-1f7c-81c0-8e51-001d1ec4fba7.
