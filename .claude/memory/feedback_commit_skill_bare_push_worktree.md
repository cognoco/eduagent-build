---
name: feedback_commit_skill_bare_push_worktree
description: "Forked /commit bare `git push` in a worktree tracking origin/new-llm fast-forwards the shared integration branch directly, bypassing the PR/review gate."
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-19
  last_confirmed: 2026-06-19
  status: active
  originSessionId: 70f541f3-fdda-4b86-9098-8a8cf1398fca
---

**Incident (2026-06-19, PRG-17 r2):** an executor's forked `/commit` ran a BARE `git push`. The worktree branch's upstream was `origin/new-llm` (worktree-setup default tracking, not the WI feature branch), so the bare push **fast-forwarded `origin/new-llm` directly** — bypassing the per-WI PR, claude-review, and the orchestrator's merge authority. FF-only (no rewrite); work was fully validated so it was ACCEPTed, but the gate was skipped by accident.

**Rule:** in any worktree whose upstream tracks a shared integration branch (`origin/new-llm` etc.), NEVER bare-`git push` — always push with an explicit refspec `HEAD:<wi-branch>`. The land/merge into the shared branch stays an orchestrator/operator act via PR, never an executor's push.

**How to apply:** harden the commit skill + worktree-setup so a bare push from a worktree tracking a protected/integration branch is refused or auto-rewritten to `HEAD:<branch>`. Related: [[feedback_agent_checkpoint_cadence]] (no git from subagents), [[feedback_never_switch_branch]].
