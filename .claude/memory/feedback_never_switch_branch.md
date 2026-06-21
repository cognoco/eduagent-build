---
name: Never switch branches without explicit permission
description: NEVER run git checkout/switch to change branches unless the user explicitly asks — this has caused repeated frustration
type: feedback
last_confirmed: 2026-06-21 (shared-checkout PR work correction)
---

NEVER switch git branches (git checkout, git switch, or any equivalent) unless the user explicitly asks to change branches.

**Why:** This has happened repeatedly and the user finds it extremely annoying. Switching branches silently can lose staged changes, confuse the working state, and disrupt the user's flow. Agents and subagents have been the main offenders.

**How to apply:**
- Before ANY git checkout/switch command, ask yourself: "Did the user ask me to change branches?" If not, DON'T.
- If working in the shared/current checkout and a different branch seems necessary, ask for permission first and wait.
- For existing PR work from the shared/current checkout, prefer `gh` commands (`gh pr view`, `gh pr checks`, `gh pr diff`, `gh pr checkout` only after permission) instead of changing branches.
- This applies to the main agent AND all subagents/parallel agents.
- If a task seems like it needs a different branch, ASK the user first — never assume.
- When dispatching subagents, explicitly instruct them to stay on the current branch.
- The only exception is if the user literally says "switch to X branch" or "checkout X".

**Carve-out — worktree creation is not a branch switch.** Creating an isolated worktree via the repo's worktree skill (`git worktree add .worktrees/<name> -b <name>`) creates a new branch in a separate directory; the current CWD's branch is untouched. This is allowed and is the standard pattern for parallel/isolated work. The rule above applies only to `git checkout`/`git switch` operations on the current working tree.
