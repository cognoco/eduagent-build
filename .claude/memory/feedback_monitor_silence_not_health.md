---
name: monitor_silence_not_health
description: "Session/host-scoped monitors (Monitor tool, Cosmo-Stage/outbox pollers) die on host reboot or session end; their silence is not a health signal."
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-14
  last_confirmed: 2026-06-14
  status: active
  originSessionId: 4300a125-f90d-4b09-95ff-fbe74d4b868b
---

Verdict/outbox monitors are session- and host-scoped — a host reboot or session end kills them silently, after which "no events" looks identical to "nothing changed." Spot-check Cosmo directly rather than trust prolonged silence, and re-arm monitors after any restart. Applies to the orchestrator's own verdict + outbox watchers and to each shepherd's verdict monitor (now noted in `_wip/identity-foundation/shepherd-protocol.md` → review loop). Source: PRG-11 shepherd operational lesson, 2026-06-14.
