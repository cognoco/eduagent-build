---
name: feedback_orphan_writer_fleet_survives_parent_kill
description: "A parallel writer-fleet spawned by a sub-agent survives the parent's kill (orphaned) and keeps racing the shared worktree; never run >1 writer on one tree."
metadata:
  node_type: memory
  type: feedback
  created: 2026-06-20
  last_confirmed: 2026-06-20
  status: active
  originSessionId: 63b07dd7-01be-43cd-a7c0-cc959805e4b3
---

WI-867: a sub-agent ("builder-867b", an in_process_teammate) spawned a coordinator + ~8-15 parallel WRITER sub-agents to do a per-file rollout. When the operator killed the parent, the children were ORPHANED-BUT-ALIVE and kept editing the shared worktree for minutes — the "killed the wrong one" symptom. Two concurrent writers on one tree had already caused a commit/stage race earlier.

**Why / how to apply:**
- **Never run >1 writer agent on a single worktree.** For parallel rollouts use read-only **Explore** mappers (can't write → zero race) -> a SINGLE applier, OR give each writer its own `isolation: worktree`. This is the ic-205/206 ruling and the root-cause fix.
- **Killing a parent agent does NOT kill its descendants.** After any agent kill, DIRECT-scan for live sub-agents (transcript mtime < ~15s in `.../subagents/*.jsonl`) AND recent worktree edits before declaring quiescent; re-confirm by primary source, not by the parent's death.
- **`TaskStop` WORKS on `local_agent` sub-agents** (returns "Successfully stopped … local_agent") but NOT on an `in_process_teammate` ("No task found"). So a shepherd CAN cull a rogue local_agent fleet itself; an in_process_teammate must be shut via SendMessage shutdown_request (which it only processes when it next rests) or operator kill.
- **Protect in-flight uncommitted work as a `/tmp` patch + repo `_state` backup** the moment a race is detected — git index/commit races are recoverable but messy.

Extends [[feedback_adversarial_fork_isolation]] (read-only/worktree isolation for agents that share a tree) and [[feedback_monitor_silence_not_health]] (silence != dead — direct-check).
EOF
