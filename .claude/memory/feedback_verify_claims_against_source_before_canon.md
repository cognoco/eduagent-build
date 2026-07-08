---
name: feedback_verify_claims_against_source_before_canon
description: "Before asserting what code does — especially in an ADR or standard — read the source, not the deployed cache, not your own earlier prose; three canon corrections in one WI came from skipping this."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 21c2badf-43d7-4e6a-ac7e-909be767a3fc
---

Before writing any claim about implementation behavior into canon (ADR, standard,
completion summary), **read the current source** and cite `file:line`. Not the deployed
plugin cache, not a prior grep, not your own earlier sentence.

**Why:** ZDX-ADR-0014 needed three corrections in one session, all self-inflicted:
(1) "bulk-close never implemented" — false; `close.ts` on marketplace `main` had it. My
grep hit the stale `0.6.46` plugin cache, not source. A builder subagent caught it.
(2) "synthesised brief" — the tool writes `(fill in: …)` placeholders; the brief is a DoR
gate authored at refine. Caught by dogfooding, not by re-reading my own text.
(3) "ADR-0014 raised the bar" — false; the standard already said the same thing. Caught
only after the operator pushed back and I finally read `definition-of-ready.md`.

Each time the failure was the same: reasoning from what I wrote rather than what exists.

**How to apply:** cache ≠ source (a version bump makes the cache lie). Dry-run before
writing. When correcting canon, grep for *every* site of the claim — 0014's wording lived
in 4 files, and I first fixed only one. Surface the correction explicitly; never quietly
patch a claim you previously asserted. See [[project_zdx_bundle_guard_family]].
