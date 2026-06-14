---
name: worktree-setup
description: Use when starting isolated work in this repo (parallel agents, autonomous WI execution, risky changes that should not touch the main checkout). Use this instead of Claude Code's EnterWorktree tool or superpowers:using-git-worktrees — both will place the worktree in the wrong location.
---

<!--
  Vendored and adapted from superpowers:using-git-worktrees
  (MIT, https://github.com/obra/superpowers).
  Adapted for eduagent-build to enforce canonical placement and add
  repo-specific setup (pnpm install + Doppler env:sync). The original's
  Step 1a (defer to native tool) and Step 1b (directory cascade) are
  intentionally removed — they were the source of the worktree-location
  drift this skill exists to prevent.
-->

# Worktree Setup

## Overview

Create an isolated git worktree at `.worktrees/<branch-name>/` from `origin/main`, install dependencies, and sync secrets. Designed for parallel agent work, autonomous WI execution, and any change that benefits from isolation from the main checkout.

**Canonical placement:** `.worktrees/<branch-name>/` — always. Do not use Claude Code's `EnterWorktree` tool or `superpowers:using-git-worktrees` for this repo (both place the worktree elsewhere).

**Announce at start:** "I'm using the worktree-setup skill to create an isolated workspace."

## Step 0: Detect Existing Isolation

Before creating anything, check whether you are already in an isolated workspace:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

**Submodule guard:** `GIT_DIR != GIT_COMMON` is also true inside a git submodule. Verify you are not in a submodule before concluding "already in a worktree":

```bash
git rev-parse --show-superproject-working-tree 2>/dev/null
```

If that returns a path, you are in a submodule — treat as a normal repo.

**If `GIT_DIR != GIT_COMMON` (and not a submodule):** you are already in a linked worktree. Skip the rest of this skill. Do NOT create another worktree.

**If `GIT_DIR == GIT_COMMON`:** you are in the main repo checkout — continue.

## Step 1: Choose a Branch Name

- **If the work is a Cosmo work item:** use the WI ID exactly, e.g. `WI-78`.
- **Otherwise:** a short kebab-case slug derived from the task intent. Lowercase, alphanumeric + dashes, no leading dash or digit, max ~50 characters.

Examples: `WI-78`, `worktree-rules`, `dictation-prompt-fix`.

The setup script sanitizes input and rejects invalid names — agents may pass slightly imperfect input and rely on the sanitizer.

## Step 2: Run the Setup Script

```bash
bash scripts/setup-worktree.sh <branch-name>
```

The script:

1. Validates and sanitizes the branch name.
2. Verifies `.worktrees/` is gitignored.
3. Verifies you are running from the main repo checkout (not a worktree).
4. Fetches `origin/main`.
5. Runs `git worktree add .worktrees/<branch-name> -b <branch-name> origin/main` (or reuses an existing worktree at that path on that branch).
6. `cd`s into the new worktree.
7. Runs `pnpm install`.
8. Runs `pnpm env:sync` (Doppler — populates `.env.development.local`).
9. Reports the absolute path of the new worktree.

If any step fails, the script exits non-zero and reports which step. Do not proceed with a partial setup.

## Step 3: Continue Work in the Worktree

The script reports `Worktree ready at <full-path>`. All subsequent work happens in that directory. Subsequent commands must run from there (use `cd` or pass paths explicitly). The main repo checkout is unchanged.

## What to do if the script fails

| Failure | Likely cause | Recovery |
|---|---|---|
| `.worktrees/ is not gitignored` | Someone removed the entry | Add `.worktrees/` to `.gitignore`, commit, retry |
| `You are inside an existing worktree` | Script invoked from a worktree | `cd` to the main repo checkout and retry |
| `git worktree add` permission denied | Sandbox or filesystem restriction | Report to user; do not silently fall back to the main checkout |
| `pnpm install` errors | Lockfile drift or network | Investigate; do not skip. Setup is incomplete without dependencies |
| `pnpm env:sync` fails | Doppler not authenticated or no access | Confirm `doppler` is on PATH and the user is logged in. Setup is incomplete without secrets |

## Common Mistakes

- **Using Claude Code's `EnterWorktree` tool.** Default path is `.claude/worktrees/`, not `.worktrees/`. Always use this skill.
- **Using `superpowers:using-git-worktrees`.** Its directory cascade may pick `.worktrees/`, `worktrees/`, `~/.config/superpowers/worktrees/`, or trigger a native-tool fallback. Always use this skill.
- **Running the script from inside a worktree.** Step 0's detection catches this; the script also rejects it. Do not skip Step 0.
- **Creating the worktree but committing back to the main checkout.** Once in the worktree, the worktree IS the workspace until you `cd` out.
- **Skipping `pnpm install` or `pnpm env:sync` "because it's slow".** The skill exists to prevent this. A partial worktree is broken.

## Red Flags — STOP

- Creating a worktree when Step 0 detects existing isolation
- Calling `git worktree add` directly without running this script (skips dependency install + secrets)
- Falling back to `EnterWorktree` or `superpowers:using-git-worktrees` because this skill "isn't working" — fix the actual failure
- Marking work complete with setup errors unresolved (= broken workspace)

## Cleanup

When the work is merged or abandoned, remove the worktree from the main repo checkout:

```bash
# Run from the main repo checkout, not from inside the worktree
git worktree remove .worktrees/<branch-name>
git worktree prune
```

If `git worktree remove` complains about untracked files or uncommitted changes, the worktree has unfinished state — stash, commit, or discard first.
