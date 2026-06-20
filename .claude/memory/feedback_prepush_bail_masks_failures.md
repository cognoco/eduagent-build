---
name: feedback_prepush_bail_masks_failures
description: Pre-push --bail + a leading flake masks downstream real test failures; verify the affected set WITHOUT --bail before any SKIP_PRE_PUSH. tsc + integration tests do NOT catch stale mock toHaveBeenCalledWith arg-count assertions.
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-17
  last_confirmed: 2026-06-17
  status: active
  originSessionId: 63b07dd7-01be-43cd-a7c0-cc959805e4b3
---

The repo pre-push hook (`scripts/pre-push-tests.sh`) runs `jest --findRelatedTests $delta --bail`.
`--bail` STOPS at the first failing suite — so "N passed / 1 failed" is **bail-truncated**, NOT a
complete result. A pre-existing unrelated flake that sorts first (e.g. `snapshot-aggregation.test.ts`
`setTimeout is not defined` under the surgical net) hides every real failure behind it.

**Why:** On WI-809 I used `SKIP_PRE_PUSH=1` after seeing only that flake; underneath were 9 real
STALE-ASSERTION fails in my own changed files' unit suites — CI Gate-1 caught them (the backstop worked,
but my "verified/complete" claim was premature).

**How to apply:**
- BEFORE any `SKIP_PRE_PUSH=1`, re-run the affected suites **without `--bail`** (run each co-located unit
  suite directly, in BOTH flag states via `IDENTITY_V2_ENABLED`) to prove the failing set is genuinely
  only the unrelated flake. The pre-push net's `--findRelatedTests` is delta-scoped — a source-file push
  pulls more (incl. transitive flakes) than a test-only push.
- When you thread a NEW arg through a function (e.g. an `opts`/`identityV2Enabled` param), `tsc` and
  integration tests will NOT catch stale `toHaveBeenCalledWith` arg-count assertions in co-located UNIT
  suites — grep the callers AND run those unit suites. Fix pattern (mirror WI-586 `subjects.test:232`):
  add the new trailing arg to the assertion (flag-off default) + add a non-vacuous flag-ON variant; for
  flag-dependent args use the suite's `{ identityV2Enabled: process.env['IDENTITY_V2_ENABLED'] === 'true' }`
  flag-adaptive pattern. Related: [[feedback_code_review_should_fix]].
