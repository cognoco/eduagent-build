---
name: monitor_silence_not_health
description: "Background monitors (Monitor tool, pollers) are session+host-scoped and can expire silently — silence ≠ healthy; use persistent:true and re-read after arming."
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-14
  last_confirmed: 2026-06-20
  status: active
  originSessionId: 4300a125-f90d-4b09-95ff-fbe74d4b868b
---

Background monitors (the Monitor tool, file/stage pollers) are session- and host-scoped, and fail in ways that look identical to "nothing changed":

- A host reboot or session end kills them; a Monitor-tool instance is **non-persistent by default and expires SILENTLY at its timeout mid-session** (not just on reboot). Use `persistent:true`, re-arm after any restart, and check an old one isn't still alive first (don't stack duplicates).
- A freshly-armed *differ*-style monitor baselines on its FIRST read, so it is blind to a transition that already happened (or lands inside its first poll interval). After arming — or after any state-write whose result you care about — explicitly RE-READ the state once; keep the monitor for *subsequent* changes only.
- Never trust prolonged silence — spot-check the source of truth directly at decision boundaries.

(The Quartet review-loop application — the Clacks-vs-Cosmo two-channel gap and the central reviewer-transition backstop — is in the learning tracker `_wip/umbrella-program/quartet-learning-tracker.md` §E6.)
