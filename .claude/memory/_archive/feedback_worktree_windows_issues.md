---
name: Agent tool `isolation: "worktree"` limitations on Windows
description: Worktrees lack node_modules; pre-commit hooks (lint-staged, tsc, jest) fail. Windows EPERM prevents clean `pnpm install` inside worktree. Workaround: extract staged diff, apply to main tree, commit there.
type: feedback
---

## The problem (observed 2026-04-19 during parallel agent run)

When dispatching 4 parallel agents with `isolation: "worktree"` on the Agent tool, three of four hit the same wall:

1. Agent's worktree at `.claude/worktrees/agent-<id>/` is created from a git ref — but **no node_modules symlinks**. Worktrees don't inherit pnpm's node_modules layout.
2. Pre-commit hooks (husky → lint-staged → tsc → jest) fail because `lint-staged`, `tsc`, `pnpm exec *` all resolve from node_modules.
3. Running `pnpm install` inside the worktree hits Windows **EPERM** errors on `@typescript-eslint` rename operations — file locks don't release cleanly. Error reproduces on retry.

## Symptoms from the session

- Agent 2 (dictation): timed out at 27 min / 121 tool uses. Staged all 12 files but never committed because pre-commit hook failed. Reported "completed" with "commit not landed yet".
- Agent 3 (memory block): used `--no-verify` to bypass hooks. Verified manually instead.
- Agent 4 (tone pass): succeeded cleanly — but committed to `improvements` directly, not its worktree branch. Unknown why the SDK skipped worktree creation for Agent 4 only.
- Agent 1 (quiz): outcome pending at time of this note.

## Workaround that worked

When the agent died before committing but had everything staged:

1. `git stash push -u -m "main tree WIP"` — clear main tree of any in-flight unrelated work
2. `cd <worktree-path> && git diff --cached > /tmp/agent.patch` — extract the staged diff
3. `cd <main-tree> && git apply --3way /tmp/agent.patch` — apply with 3-way merge
4. Resolve conflicts manually (expect them when worktree base < main HEAD)
5. `git add` + `git commit` from main tree — hooks run cleanly because node_modules exists
6. `git push`
7. `git stash pop` — restore the unrelated WIP (may need conflict resolution again)

This was used successfully for Agent 2's work → commit `970a82a5`.

For Agent 3 which did commit via `--no-verify`: `git cherry-pick <agent-commit-hash>` from main tree works cleanly if no base conflicts.

## What didn't work

- `pnpm install` retries in the worktree — same EPERM every time
- `git worktree remove --force` — fails with "Directory not empty" on Windows file locks. Workaround: leave the dir, it's harmless; `git worktree prune` clears git metadata even when filesystem won't release
- `git stash pop` after partial apply — often leaves UU unmerged markers and keeps the stash; cascading conflicts

## How to apply next time

When dispatching parallel agents on Windows:

- **Expect** at least one agent to fail at the commit step
- Don't rely on agents' commits landing automatically — plan on merging their work yourself
- Extract via diff + 3-way apply, or cherry-pick if they managed to commit
- If an agent reports "completed" but says commit didn't land, **check the worktree status** — their work is staged, just needs a commit from a place where hooks can run
- Consider pre-seeding worktrees with node_modules via a setup script, OR dispatching agents in a way that uses the main tree with careful scope isolation (like Agent 4 did accidentally) — neither validated yet
- `.claude/worktrees/agent-*` dirs may accumulate with stale node_modules; periodic manual `rmdir /s /q` when Windows releases locks
