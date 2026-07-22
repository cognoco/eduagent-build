---
name: agent-spawn-inherits-shell-cwd
description: "Subagents inherit the spawning session's current Bash cwd — spawning from inside a worktree misorients executors onto the wrong work item"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f1d7458c-1722-4db1-8fce-cf827833f39c
---

Agents spawned via the Agent tool inherit the parent session's persistent Bash working directory. During Batch 7 (2026-07-11) a wave of 4 executors was spawned while the shepherd's shell sat inside `.worktrees/WI-1513` (left there by a finalize command); two of the four misidentified their assignment — one "checked in" as the finished WI-1513 lane, one paused to ask — costing a correction round-trip each.

**Why:** the Bash tool's cwd persists across calls and becomes the spawned agent's starting cwd; an executor that wakes up inside a finished worktree pattern-matches it as its own assignment even when the brief names a different WI.

**How to apply:** before any Agent-tool wave, `cd` back to the repo root (or run the spawn turn with no prior cd); additionally, briefs should state "your starting cwd is not meaningful — cd to <repo root> first", which costs one line and makes the wave robust regardless of shell state. Related: [[bg_while_true_watcher_is_write_only]] for other multi-agent session mechanics.
