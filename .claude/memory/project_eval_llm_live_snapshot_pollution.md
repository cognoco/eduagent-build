---
name: project_eval_llm_live_snapshot_pollution
description: pnpm eval:llm --live pollutes eval snapshots with live output; discard before pushing a PR
metadata: 
  node_type: memory
  type: project
  created: 2026-07-12
  last_confirmed: 2026-07-12
  status: active
  originSessionId: 9de690ff-6947-4cf4-b828-7dc15bf0b9e9
---

`pnpm eval:llm --live` (Tier-2) appends a `## Live LLM response` block to every
`apps/api/eval-llm/snapshots/**` file it touches (~295 files in a full run) —
non-deterministic live output, NOT the committed Tier-1 baseline. Left
uncommitted it blocks a clean PR and looks like drift. Fix: `git restore
apps/api/eval-llm/snapshots/` before pushing; the committed Tier-1 snapshots are
the intended state. Seen WI-1823 when a builder's `--live` run stranded 295
modified snapshots on the branch.
