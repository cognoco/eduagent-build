---
name: feedback_verify_directive_premise_before_build
description: Before building a fix for a directed "live error", verify the premise at primary source; if the fix already exists, stop and report — don't fabricate a no-op.
metadata:
  node_type: memory
  type: feedback
  created: 2026-06-18
  last_confirmed: 2026-06-20
  status: active
  originSessionId: 63b07dd7-01be-43cd-a7c0-cc959805e4b3
---

A directed "fix this live error" can rest on a grep that misses a caller-level branch: the unbranched read lives in a helper, but the guard/flag branch lives in the CALLER (cron/route/webhook seam). Grepping the helper alone yields a false "live error" (WI-779 ic-180: the trial-expiry cron caller `trial-expiry.ts:175` already branched to the v2 table; the "500" was a prediction, not an observation).

How to apply:
- Before building a directed fix, verify the premise by primary source — trace each suspect read UP to its entry point and confirm no caller-level branch routes elsewhere.
- If the fix already exists, STOP and report with evidence — do NOT fabricate a no-op (ponytail rung 1).
- A "no-gap"/fix verification must be COMPLETE: when the change names N variant surfaces, sweep ALL of them and ALL sibling call sites of the guard (the "3+ sibling locations" drift class), not just the first paths you check.

(The Quartet GATE-0 institutionalization + the reviewer≠executor backstop narrative are in the learning tracker `_wip/umbrella-program/quartet-learning-tracker.md` §E7.)
