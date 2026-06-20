---
name: feedback_adversarial_fork_isolation
description: "Claude Code fork tooling — a non-isolated fork shares the parent cwd and inherits Edit/Write (a \"read-only\" instruction is NOT enforced); isolation:worktree pins the parent cwd."
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-17
  last_confirmed: 2026-06-20
  status: active
  originSessionId: 70f541f3-fdda-4b86-9098-8a8cf1398fca
---

Two general Claude Code fork-tooling facts (the adversarial-review chain-of-custody rationale that motivated them is in the Quartet learning tracker, `_wip/umbrella-program/quartet-learning-tracker.md` §E2):

- A `subagent_type:"fork"` spawned WITHOUT isolation runs in the SAME working directory as the parent and inherits the Edit/Write tools, so a "read-only" instruction is **not enforced** — a fork can (and did) edit the shared worktree despite being told not to. To actually enforce no-edit, use the `Explore` agent type (no Edit/Write tools) or `isolation:"worktree"` (a physically separate copy).
- CAVEAT: launching a fork with `isolation:"worktree"` PINS the parent session cwd into `.claude/worktrees/agent-*` — the Edit/Write tools then refuse shared-checkout paths; write to absolute paths via Bash+python until un-pinned.
