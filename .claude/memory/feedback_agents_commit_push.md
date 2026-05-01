---
name: Subagents never commit — coordinator only (unless user instructs)
description: Subagents must NEVER run git add/commit/push by default. Only the coordinator (main conversation) commits, using /commit. Prevents git index race conditions when multiple agents work in parallel. Exception — user may explicitly instruct a one-off subagent commit.
type: feedback
originSessionId: 5645a29e-c558-4303-a17d-e24178d3892a
---
Subagents (agents spawned via the Agent tool) must NEVER run `git add`, `git commit`, or `git push` on their own initiative. They must NOT use `/commit`. By default, only the coordinator (main conversation) handles all git operations.

**Why:** When multiple parallel agents share the same working tree, concurrent `git add` and `git commit` calls race on the single `.git/index` file. Agents staging/unstaging/committing simultaneously delete each other's work, create mixed commits, and cause cascading failures. This was a recurring time sink across multiple sessions (2026-04-19).

**Exception — user-instructed subagent commit (added 2026-04-30):**

If the user *explicitly* asks the coordinator to spawn a subagent to commit and push (e.g. "spawn a haiku sub-agent to commit your changes and push"), the coordinator may dispatch a subagent for that single git operation. The user is consciously overriding the default to save coordinator context for ongoing work. In that case:
- Brief the subagent on exact scope (which files to stage; which to leave untouched).
- Subagent does the commit + push and reports the resulting SHA / push status.
- Do not generalise — this is a one-off override, not a relaxation of the default.
- If unsure whether the user is overriding, flag the rule and ask before dispatching.

**How to apply (default case — no user override):**
- When spawning any subagent, include in its prompt: "Do NOT run git add, git commit, or git push. Do NOT use /commit."
- Subagents write code, run tests, and report which files they created or modified (relative paths, one per line)
- The coordinator commits after agents complete, using `/commit` for all changes or staging per-agent file lists for separate commits
- This rule applies to ALL agents in ALL environments (CLI, VS Code, web)
- The rule is also in CLAUDE.md so agents see it automatically, but always reinforce it in the agent prompt
