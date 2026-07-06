# WI-1654 review — DONE (2026-07-06)
Reviewer: claude-code:reviewer-ws44 | Workstream: WS-44 | Landing branch: main

## Item
family-v2 listFamilyMembersV2 has no ORDER BY — integration test asserts exact row order → intermittent CI flake
Type=Bug P2 | Executed By codex:shepherd:coverage-debt | Fixed In ebd42366 | PR #1949

## Evidence
- Fixed In ebd42366 = mergeCommit of PR #1949 (squash); MERGED 2026-07-06T17:20Z; ancestor of origin/main = YES
- CI on merged SHA: 9 SUCCESS / 0 FAIL. Flag-ON integration (IDENTITY_V2_ENABLED)=SUCCESS (exact symptom lane), API Quality Gate, Merge completeness, Playwright web smoke, CodeRabbit all green.
- claude-review: APPROVED, must-fix 0 / should-fix 0 / consider 0.
- Diff: 1 file, apps/api/src/services/billing/billing-v2/family-v2.ts (+6/-1). Adds .orderBy(CASE admin=ANY(roles) THEN 0 ELSE 1, asc displayName, asc id). Real behavioral fix.
- isOwner = roles.includes('admin') consistent with ordering key.
- Test file NOT modified — existing toEqual([Owner,Child]) exact-order assertion (family-v2.integration.test.ts:197-199) intact and now deterministic. Lane invariant satisfied (no weakened assertion, no internal mock, no faked evidence).
- Mechanical DoD: mechanicalOk=true (completion summary sectioned, Fixed In, dates, AC declares red-green-revert guard).
- Symptom-gone: pre-existing red = PR #1947 Flag-ON job 85388550577 row-order diff; now green on merged commit. Order-flake class → revert yields flakiness not clean red; AC explicitly permits "evidenced red against unordered impl" (wild red) + green-with-fix. Satisfied.
- Re-run note: authoritative focused re-run IS the CI Flag-ON integration lane (runs this suite) green on the merged SHA; +3 local green runs reported. Local re-run lower-value/higher-infra-risk; not performed.

## Disposition: DONE
