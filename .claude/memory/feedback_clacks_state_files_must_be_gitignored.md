---
name: feedback_clacks_state_files_must_be_gitignored
description: "git-tracked clacks _state/*.jsonl silently reverted by concurrent shared-tree resets; untrack them, trust the untracked handoff"
metadata: 
  node_type: memory
  type: feedback
  created: 2026-07-02
  last_confirmed: 2026-07-08
  status: active
  originSessionId: e984303e-3452-4f56-87a6-4922e784832b
---

Clacks channel files (`_wip/<lane>/_state/inbox.jsonl`, `outbox.jsonl`) that are **git-TRACKED** get reverted to the committed snapshot whenever a concurrent session advances shared `main` (commit/reset/FF cycle) — silently dropping working-tree appends (lost inbox orch-096..110 + outbox acks on 2026-07-02, HEAD 53ec7b1e6 / WI-1254 #1822).

**Why:** the shared-checkout `chore(wip): update agent state` cycle + FF resets overwrite uncommitted channel appends. **How to apply:** keep the shepherd's `SESSION-HANDOFF.md` UNTRACKED (immune) and treat it as authoritative over the tracked channel files. The line-count inbox poller re-emits history on each shrink (benign — cross-check acted `orch-NNN`).

**Corrections, verified against source 2026-07-08:**
- The gitignore fix **has landed**: nexus `.gitignore:166` ignores `_quartet/working/lanes/*/_state/*.jsonl`. Do not re-do it.
- **`monitor-manifest.json` is deliberately TRACKED** and re-included (`.gitignore:165`). The original prescription to gitignore it is WRONG — do not follow it.
- **WI-1245 is `Closed / Superseded`**, not open. The Supabase substrate replaces the layer this patch relocated; the cutover lives in WS-50 (Clacks Substrate & Comms) under WI-1263. Chasing WI-1245 sends you to a closed item.

Related: shared-checkout branch discipline; [[feedback_orchestrator_liveness_and_mcp_independence]].
