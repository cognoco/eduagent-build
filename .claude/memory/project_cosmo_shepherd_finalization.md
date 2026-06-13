---
name: project_cosmo_shepherd_finalization
description: "Finalizing Cosmo WIs for the autonomous /cosmo:review loop — execute complete is rejected by the LLM reviewer; use replace_content + property PATCH, set Fixed In manually, single-line Caveats/Follow-ups."
metadata: 
  node_type: memory
  type: project
  created: 2026-06-13
  last_confirmed: 2026-06-13
  status: active
  originSessionId: 1016f4be-3435-435c-96f3-2974525e33e7
---

When shepherding a Cosmo workstream through the autonomous `/cosmo:review` loop (proved on PRG-17 new-llm, 2026-06-13), `execute complete` v0.1.0 is unusable for finalization: it APPENDS (stacking duplicate summaries on every rework) and writes non-rendered LITERAL text — the LLM reviewer rejects both ("plain paragraph labels and an addendum"). Finalize each unit instead via:
1. `replace_content` with ONE canonical RENDERED summary — `## Completion Summary` heading + bold `**What was done:** / **What changed:** / **Verification:**` + a **single-line** `**Caveats / Follow-ups:**` (the `dod.5.summary_sections` regex `/Caveats.*Follow-?ups:/i` needs both words on the same line — separate `Caveats:`/`Follow-ups:` lines FAIL).
2. A Notion property PATCH mirroring complete's writes (`Stage=Reviewing`, `State=Active`, `Resolved=now`, clear the four claim props) PLUS **`Fixed In` = landed commit** — `complete` v0.1.0 never writes Fixed In, and `dod.7.fixed_in` requires it.
3. Verify `bun <cosmo>/skills/review/review.ts --check WI-NN` → `mechanicalOk:true` BEFORE the reviewer next polls (Reviewing items are reviewed; Executing ones are skipped, so edit the body while Executing or race-safely).

Pickup gotchas: sliced items can land at `Stage=Backlog` (not Ready) with wrong `Altitude` — `refine.ts` CANNOT promote a childless `WP` (its `wp.children`/`wp.brief` gates fire unconditionally); the sanctioned Captured→Backlog writer is `triage.ts --disposition backlog`, then `refine.ts --to-ready` (set `executionPath` or it stays Backlog). Canonical narrative: `_wip/new-llm-integration/execution-tracker.md` §4.
