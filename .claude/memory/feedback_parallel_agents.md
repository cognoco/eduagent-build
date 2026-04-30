---
name: Parallel agent execution rules
description: When and how to parallelize agent work — same working tree, no worktrees, coordinator commits sequentially
type: feedback
originSessionId: 5645a29e-c558-4303-a17d-e24178d3892a
---
Parallel agent execution is allowed when tasks touch independent (non-overlapping) files. Agents work in the same tree — do NOT use `isolation: "worktree"`.

**Why:** Windows worktrees lack `node_modules` (pnpm doesn't symlink into worktrees), pre-commit hooks fail with EPERM errors, and cleanup is unreliable. Observed across multiple sessions (2026-04-19). The real isolation problem — git index races — is solved by having agents never touch git at all.

**How to apply:**
- Before dispatching parallel agents, verify file lists don't overlap
- Always keep one coordinating agent in control (dispatching, reviewing, committing)
- Do NOT use `isolation: "worktree"` — agents work in the main tree
- Agents must NOT run git add, git commit, or git push (see `feedback_agents_commit_push.md`)
- Agents report their changed file list when done; coordinator commits sequentially
- Reviews (read-only) can always run in background without special handling
- Maximum 3 parallel implementation agents to limit file conflict risk
