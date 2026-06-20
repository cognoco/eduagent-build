---
name: feedback_flag_collapse_breaks_legacy_pinned_unit_mocks
description: "Collapsing a feature flag to one arm mass-breaks legacy-pinned mock-DB unit tests; diagnose by crash-site histogram (seams, not bespoke) and verify counts vs base."
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-20
  last_confirmed: 2026-06-20
  status: active
  originSessionId: 63b07dd7-01be-43cd-a7c0-cc959805e4b3
---

WI-867 (collapse `IDENTITY_V2_ENABLED`→v2-only) turned 69 suites / 1041 unit tests red. Root cause: collapsing to the v2 arm makes v2 service SEAMS (`resolveIdentityV2` etc.) run UNCONDITIONALLY that flag-off unit tests previously skipped; their mock DBs never satisfied the v2 reads → undefined → 500.

**Why / how to apply (recurs for every flag-removal incl. WI-868/869):**
- **Diagnose by CRASH-SITE histogram, not test-file** (`grep -oE 'at <fn> \(file:line\)' | sort | uniq -c`). 113 files crashing in ~12 shared fns = SEAMS (fix harness, tractable) — NOT bespoke. `resolveIdentityV2` alone = 436 of them.
- **Verify the count vs base before quoting.** LLM-provider unit tests (gemini-class) fail at BASE too (local-env, main is CI-green) — they inflate the raw number. Run HEAD vs HEAD~1.
- **Delete-vs-migrate discriminator** = "does the asserted behavior survive the NEXT phase / is it covered by a NAMED integration twin?" Crash-on-seam + business-logic (no integration twin) → KEEP + seam-mock; asserts v2 guardian/consent behavior w/ integration twin → DELETE (burn-down); asserts removed flag-opts threading → UPDATE assertion; asserts legacy-handler-called → DELETE.
- **Sub-agent builders stall** on long silent full-suite runs (600s watchdog) → mandate targeted cluster runs + backgrounding + incremental commits + progress lines.

Extends [[feedback_verify_directive_premise_before_build]] (verify the crux at primary source — I produced 3 successive wrong diagnoses by drilling one cluster deep each time; the histogram settled it).
