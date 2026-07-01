#!/usr/bin/env sh
# WI-1246 — shared-main commit guard.
#
# Refuses a commit when BOTH conditions hold:
#   1. the checkout is the shared (non-linked-worktree) one, AND
#   2. HEAD is `main`.
#
# Why: `/commit` runs as a forked general-purpose sub-agent whose cwd resolves
# to the SHARED main checkout, not the invoking worktree (the worktree path is
# never threaded into the fork). Every worktree-based guard the commit flow has
# (GIT_DIR != GIT_COMMON_DIR detection, --no-track) assumes the commit runs
# INSIDE the worktree, so against shared-main they all pass and the fork can
# commit/push straight to origin/main, bypassing PR gates. This hook is the
# mechanism-independent backstop: it fires for EVERY committer (raw git, human,
# skill) at the shell layer, regardless of what the caller believes.
#
# Shared-checkout detection: in the shared checkout `git rev-parse --git-dir`
# and `--git-common-dir` are the same path (both `.git`); in a linked worktree
# --git-dir is `.git/worktrees/<name>` and differs from the common dir. Equal
# ⇒ NOT a linked worktree ⇒ the shared main checkout.
#
# Escape for deliberate human main work: `git commit --no-verify`.

git_dir=$(git rev-parse --git-dir 2>/dev/null || echo unknown)
common_dir=$(git rev-parse --git-common-dir 2>/dev/null || echo unknown-common)
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)

if [ "$git_dir" = "$common_dir" ] && [ "$branch" = "main" ]; then
  echo ""
  echo "pre-commit: refusing to commit on 'main' in the shared checkout (WI-1246)."
  echo ""
  echo "  This is the shared main checkout, not a linked worktree. Committing here"
  echo "  lands on origin/main and bypasses PR review. The most common cause is a"
  echo "  /commit sub-agent whose cwd escaped its worktree onto shared main."
  echo ""
  echo "  Do your work in a worktree branch instead:"
  echo "    bash scripts/setup-worktree.sh <branch-name>"
  echo ""
  echo "  Deliberate human main work: git commit --no-verify"
  echo ""
  exit 1
fi

exit 0
