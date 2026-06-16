---
name: feedback_cosmo_write_discipline
description: "Before any Cosmo create/PATCH, verify select values vs the live schema; pick Altitude by the sub-item test (WP only if creating sub-items, else Item)"
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-16
  last_confirmed: 2026-06-16
  status: active
  originSessionId: 70f541f3-fdda-4b86-9098-8a8cf1398fca
---

Rule: (1) Notion selects auto-create unknown values **silently** (no error) — ALWAYS verify every `select` value against the live data_source schema before a create/PATCH. The enum value is `WP`, NOT the prose label "Work Package" the work-items skill table displays. (2) Altitude = `WP` ONLY when you are creating the sub-items it bundles (a WP absorbs its children's scope/AC); WP-*sized* scope with no sub-items → `Item`. Refine can't promote childless WPs.

Why: Created WI-805 with a bogus Altitude `Work Package` (polluted the select) AND wrong altitude (no sub-items planned). Root cause = copied the skill's prose label without schema-verifying + applied a size heuristic instead of the sub-item test; the careful A/B reasoning consumed deliberation budget and object-creation went autopilot. The verify-before-asserting discipline applies to WRITES, not just reads.

How to apply: pre-write, `curl .../data_sources/<ds> | jq '.properties.<Prop>.select.options[].name'`; for Altitude run the sub-item test. See [[project_cosmo_shepherd_finalization]], [[project_prg11_arch_cleanout_lane]].
