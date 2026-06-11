---
name: Subagents commit only from isolated worktrees — coordinator commits in shared tree
description: Subagents may run /commit only from within an isolated worktree they own. In the coordinator's working tree, subagents must NOT run git add/commit/push — the coordinator handles all git operations.
type: feedback
originSessionId: 5645a29e-c558-4303-a17d-e24178d3892a
---
Subagents (agents spawned via the Agent tool) may run `/commit` only when they are operating inside an isolated worktree they own (created via `git worktree add .worktrees/<name> -b <name>`). When working in the coordinator's shared working tree, subagents must NEVER run `git add`, `git commit`, or `git push`.

**Why:** When multiple agents share the same working tree, concurrent `git add` and `git commit` calls race on the single `.git/index` file — agents staging/unstaging/committing simultaneously delete each other's work, create mixed commits, and cause cascading failures. This was a recurring time sink across multiple sessions (2026-04-19). Each worktree has its own `.git/index`, so worktree-isolated subagents are safe to commit. `/commit` remains the source of truth for commit message format, hook handling, and push behavior regardless of context.

**How to apply (shared-tree case — no worktree isolation):**
- When spawning any subagent that works in the main tree, include in its prompt: "Do NOT run git add, git commit, or git push. Do NOT use /commit."
- Subagents write code, run tests, and report which files they created or modified (relative paths, one per line).
- The coordinator commits after agents complete, using `/commit` for all changes or staging per-agent file lists for separate commits.
- This rule applies to ALL agents in ALL environments (CLI, VS Code, web).
- The rule is also in CLAUDE.md so agents see it automatically, but always reinforce it in the agent prompt.

**How to apply (worktree-isolated case):**
- A subagent that was dispatched into its own `.worktrees/<name>` directory owns that branch and may use `/commit` normally.
- The coordinator should still review the subagent's commits before merging the worktree branch.
