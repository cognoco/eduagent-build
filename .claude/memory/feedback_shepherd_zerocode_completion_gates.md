---
name: feedback_shepherd_zerocode_completion_gates
description: "Shepherd zero-code re-completion of a bounced WI must verify no unresolved review findings + green Fixed-In rollup, not just \"content already on main\""
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-30
  last_confirmed: 2026-06-30
  status: active
  originSessionId: 8f3f2c65-df38-47b3-ba78-1245d05eb737
---

When a bounced WI looks "zero-code" (feature already on `main`, PR diff empty), DO NOT re-complete on that basis alone. The reviewer's closure gate checks BOTH: (a) AC content present on main, AND (b) no valid unresolved PR-review finding remains in landed source, AND (c) the cited `Fixed In` commit's OWN `main` status rollup is green. WI-1132 (WS-27/PR-cleanup, 2026-06-30) was zero-code-completed in error and correctly re-bounced on an unresolved a11y finding (identical `accessibilityLabel` per row) buried in already-merged source; its Fixed-In `f41b342b1` also had a red post-merge `main` (ambient @inngest-admin gap). Fix = fix-forward PR (a11y label + locale key + regression + baseline regen) → new green squash as Fixed-In.

**Why:** "diff empty vs main" only proves AC presence; it is blind to a still-open review finding and to a red historical rollup on the Fixed-In SHA — both of which the reviewer re-pulls.

**How to apply:** Before any zero-code `/cosmo:execute complete`, grep the WI's last reviewer comment for an UNRESOLVED finding, and check the Fixed-In commit's rollup (`gh api .../commits/<sha>/status`). If either is bad, fix-forward instead. Related: builders must NOT self-run `/cosmo:execute complete` on bounced items (lifecycle is shepherd-owned; `fetch` is Stage=Ready-gated) — the per-ID Cosmo monitor's Executing→Reviewing alarm catches a premature builder completion (b-1059 did this, cited the old buggy SHA). See [[feedback_verify_directive_premise_before_build]].
