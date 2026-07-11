#!/usr/bin/env bash
# scripts/setup-worktree.sh — create an isolated worktree for this repo.
#
# Usage: bash scripts/setup-worktree.sh <branch-name>
#
# Creates .worktrees/<branch-name>/ from origin/main, runs pnpm install,
# runs pnpm env:sync. The skill at .agents/skills/worktree-setup/SKILL.md
# describes the full agent workflow.
#
# Cross-platform: runs on macOS, Linux, and Windows (Git Bash / MSYS / Cygwin).

set -euo pipefail

# ── Arg validation ───────────────────────────────────────────────────────
if [ $# -ne 1 ]; then
  echo "Usage: $0 <branch-name>" >&2
  echo "Example: $0 WI-78" >&2
  exit 2
fi

RAW_NAME="$1"

# Sanitize. WI-NN format passes through unchanged (common case for Cosmo work
# items). Otherwise: lowercase, alphanumeric + dash, max 50 chars, no leading
# dash/digit, no consecutive dashes.
if [[ "$RAW_NAME" =~ ^WI-[0-9]+$ ]]; then
  BRANCH="$RAW_NAME"
else
  BRANCH=$(echo "$RAW_NAME" \
    | tr '[:upper:]' '[:lower:]' \
    | tr -c 'a-z0-9-' '-' \
    | sed 's/-\{2,\}/-/g' \
    | sed 's/^-//;s/-$//')
  if [ ${#BRANCH} -gt 50 ]; then
    BRANCH="${BRANCH:0:50}"
    BRANCH="${BRANCH%-}"
  fi
  if [ -z "$BRANCH" ] || [[ "$BRANCH" =~ ^[0-9-] ]]; then
    echo "ERROR: branch name '$RAW_NAME' sanitizes to '$BRANCH' which is invalid" >&2
    echo "       (empty, or starts with a digit/dash). Pick a different name." >&2
    exit 1
  fi
fi

if [ "$BRANCH" != "$RAW_NAME" ]; then
  echo "Sanitized branch name: '$RAW_NAME' -> '$BRANCH'"
fi

# ── Verify we are in the main repo checkout, not a worktree ─────────────
GIT_DIR_PATH=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON_PATH=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
if [ "$GIT_DIR_PATH" != "$GIT_COMMON_PATH" ]; then
  # We're inside an existing worktree. Refuse — agent should detect this in
  # Step 0 of the skill, but humans may not.
  echo "ERROR: You are inside an existing git worktree." >&2
  echo "       Run this script from the main repo checkout, not from a worktree." >&2
  exit 1
fi

# ── Guard against a shared .git/config flipped to core.bare=true ───────
# A concurrent worktree-add race on the shared .git/config can momentarily
# leave core.bare=true, which makes `git rev-parse --show-toplevel` fail
# outright (a bare repo has no work tree) with a raw git error before this
# script's own error handling can engage. Detect it and fail loudly with an
# actionable remediation instead of surfacing that raw error.
if [ "$(git config --get core.bare 2>/dev/null || echo false)" = "true" ]; then
  echo "ERROR: the shared .git/config has core.bare=true." >&2
  echo "       This repo must never be bare; something (a rare worktree-add" >&2
  echo "       race, or a manual edit) toggled it. Fix it and retry:" >&2
  echo "         git config core.bare false" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

WORKTREE_REL=".worktrees/$BRANCH"
WORKTREE_ABS="$REPO_ROOT/$WORKTREE_REL"

# ── Verify .worktrees/ is gitignored ────────────────────────────────────
if [ -f .gitignore ] && grep -qE '^\.worktrees/?$' .gitignore; then
  : # ok
else
  echo "ERROR: .worktrees/ is not in .gitignore." >&2
  echo "       Add '.worktrees/' to .gitignore, commit, and retry." >&2
  exit 1
fi

# ── Already exists at the requested path? ───────────────────────────────
if [ -d "$WORKTREE_ABS" ]; then
  EXISTING_BRANCH=$(git -C "$WORKTREE_ABS" branch --show-current 2>/dev/null || echo "")
  if [ "$EXISTING_BRANCH" = "$BRANCH" ]; then
    echo "Worktree already exists at $WORKTREE_ABS on branch $BRANCH — reusing."
  else
    echo "ERROR: $WORKTREE_ABS exists but is on branch '$EXISTING_BRANCH' (expected '$BRANCH')." >&2
    echo "       Remove it manually: git worktree remove $WORKTREE_REL" >&2
    exit 1
  fi
else
  echo "Fetching origin/main..."
  git fetch origin main --quiet

  echo "Creating worktree at $WORKTREE_REL on new branch $BRANCH from origin/main..."
  # --no-track --no-guess-remote: the new branch must NOT track origin/main or
  # any other remote branch. A bare `git push` from the worktree must fail with
  # "no upstream configured" so executors cannot accidentally fast-forward a
  # shared integration branch. Pushes must always supply an explicit refspec
  # (git push origin HEAD:<branch>). See commit skill §Worktree push rule.
  git worktree add --no-track --no-guess-remote "$WORKTREE_REL" -b "$BRANCH" origin/main
fi

# ── Setup: pnpm install + env:sync ──────────────────────────────────────
cd "$WORKTREE_ABS"

echo "Running pnpm install (this may take a few minutes)..."
pnpm install

echo "Running pnpm env:sync..."
pnpm run env:sync

# ── Report ──────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Worktree ready at: $WORKTREE_ABS"
echo "  Branch:            $BRANCH (from origin/main)"
echo ""
echo "  All subsequent work for this task happens in that directory."
echo "════════════════════════════════════════════════════════════════"
