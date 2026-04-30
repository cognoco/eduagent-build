---
name: Subagents never commit — coordinator only
description: Subagents must NEVER run git add/commit/push. Only the coordinator (main conversation) commits, using /commit. Prevents git index race conditions when multiple agents work in parallel.
type: feedback
originSessionId: 5645a29e-c558-4303-a17d-e24178d3892a
---
Subagents (agents spawned via the Agent tool) must NEVER run `git add`, `git commit`, or `git push`. They must NOT use `/commit`. Only the coordinator (main conversation) handles all git operations.

**Why:** When multiple parallel agents share the same working tree, concurrent `git add` and `git commit` calls race on the single `.git/index` file. Agents staging/unstaging/committing simultaneously delete each other's work, create mixed commits, and cause cascading failures. This was a recurring time sink across multiple sessions (2026-04-19).

**How to apply:**
- When spawning any subagent, include in its prompt: "Do NOT run git add, git commit, or git push. Do NOT use /commit."
- Subagents write code, run tests, and report which files they created or modified (relative paths, one per line)
- The coordinator commits after agents complete, using `/commit` for all changes or staging per-agent file lists for separate commits
- This rule applies to ALL agents in ALL environments (CLI, VS Code, web) — no exceptions
- The rule is also in CLAUDE.md so agents see it automatically, but always reinforce it in the agent prompt
