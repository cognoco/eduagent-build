---
name: plan-cutover-ownership
description: Never assert a build-new/replace plan is complete without the switch-flip check — a wave must own migrating callers to the new system
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-12
  last_confirmed: 2026-06-12
  status: active
  originSessionId: 7d8da397-eb81-4153-af7d-d3224b90f8bd
---

**What happened (2026-06-12):** The IF master plan built the new identity model
(schema, policy engine, guards) and secured legacy code, but NO wave owned the
application cutover — ~80 runtime files kept reading legacy tables, and the
cutover hid inside WI-586's "S-sized" *drop* scope ("remove legacy readers").
The program session had assured the operator post-P delivery was fully planned.
Caught only by the executor's mandatory plan-phase stop, pre-code.

**Why:** "Remove legacy readers" reads as cleanup when it is actually the
migration of every caller. Build-new plans naturally enumerate construction and
securing work; caller migration belongs to neither side and silently falls out.

**How to apply:** Before asserting any replace/rewrite plan is complete (and at
every plan ratification), ask the switch-flip question explicitly: *which unit
makes the system actually USE the new thing, and which unit owns the data/state
convergence at the flip?* If no unit answers both, the plan has a missing wave.
Corollary for execution: piecemeal MERGES are fine only with the single-live-
store invariant (new paths inert until one atomic convergence step); partial
per-domain activation = split-brain and is never acceptable without dual-model
sync (which the clean-cut doctrine forbids).
