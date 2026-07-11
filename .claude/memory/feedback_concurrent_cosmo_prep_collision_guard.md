---
name: feedback_concurrent_cosmo_prep_collision_guard
description: "Multi-session Cosmo backlog prep: state snapshots go stale in minutes — fan-out agents must run a pre-write collision guard (Modified timestamp + live claim), and briefs must say what to do on mismatch."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e4fddf1e-c6e3-4067-b3c4-777ec3856ceb
---

During the 2026-07-11 gate sweep, 13/17 of one agent's items and 8/15 of another's had been
advanced by OTHER concurrent sessions between my state pull and the agents' first write —
the briefs' premises were stale within ~1 hour. One agent caught it and asked; without the
guard the sweep would have double-triaged / stomped live edits.

**Why:** the operator runs 7–8 parallel sessions against the same Cosmo DBs; any orchestrator
snapshot is advisory, never current. Silence about this in a subagent brief converts stale
premises into conflicting writes.

**How to apply:** every fan-out brief that writes to Cosmo gets a standing preamble: (1) re-read
each item's live Stage/Modified/Claimed-By before first write; (2) skip-and-report anything
Closed, modified in the last ~20 min, or live-claimed ("in-flight elsewhere"); (3) if Stage
moved past the brief's premise, don't re-run lifecycle transitions — do only the narrow additive
work (e.g. missing HITL line) via the sanctioned reopen path. Post-hoc verification is an
acceptable fallback when the addendum arrives late, but preflight is the design.
See [[project_zdx_bundle_guard_family]].
