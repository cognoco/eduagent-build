---
name: 586_gate_delegation
description: WI-586 cutover — gate delegation (#4/#6 to orchestrator; #8/#11 operator-only)
metadata:
  node_type: memory
  type: project
  created: 2026-06-15
  last_confirmed: 2026-06-16
  status: active
  originSessionId: 70f541f3-fdda-4b86-9098-8a8cf1398fca
---

WI-586 prod cutover (PRG-06 / WS-18): operator (Jorn) delegated gate **#4** (cutover-window entry) + gate **#6** (STOP-1, pre-reseed ≈ §4 step-3 ownerless-disposal STOP) to the orchestrator, under conditions — run against go/abort criteria (staging rehearsal green + parity exact), abort-to-operator on any deviation, notify operator at each. Gates **#8** (flag-flip, §4 step-7) + **#11** (DROP, §4 step-8) remain operator-only (commitment + irreversible destruction). **Any STOP not explicitly delegated (e.g. the §4 step-6 M-REPOINT STOP) defaults to operator** per plan §4 "Roles" until explicitly delegated.

REQUIRED safety step: a **Neon BRANCH snapshot** taken after freeze / before ownerless disposal = the primary rollback point (PITR marker + pre-drop pg_dump = secondary fallbacks). It is the orchestrator's pre-disposal abort net that makes owning #4/#6 safe. PROD PREREQ: provision `neonctl` + `NEON_API_KEY` for the prod Neon project — staging lacked them and degraded to PITR-only; that gap must not recur.

**Re-affirmed by operator 2026-06-16** after the prior local-only record was removed by the shared-checkout resync; now recorded durably in git (this file, pushed) + Cosmo (WI-586 page comments) + plan §4 "Roles" (lockstep). Runbook: `_wip/identity-foundation/2026-06-11-cutover-plan.md` §4.
