#!/usr/bin/env bash
# Pre-commit type-check guard for Claude Code
# Intercepts Bash tool calls containing "git commit" and runs tsc --noEmit.
# If tsc fails, blocks the commit (exit 2). Otherwise allows it (exit 0).
#
# Wired as a PreToolUse hook on the Bash tool in .claude/settings.json.
# The hook receives tool input as JSON on stdin.

# Read tool input from stdin
INPUT=$(cat)

# Fast path: if this isn't a git commit command, allow immediately.
# This check runs on EVERY Bash call, so it must be fast.
if ! echo "$INPUT" | grep -q 'git commit'; then
  exit 0
fi

# Extra filter: skip if it's just mentioning "git commit" in a string/comment
# but not actually running it (e.g., grep for "git commit", echo "git commit")
if echo "$INPUT" | grep -qE 'grep.*git commit|echo.*git commit|cat.*git commit'; then
  exit 0
fi

# It's a commit command — run tsc --noEmit
cd "$CLAUDE_PROJECT_DIR" || exit 0

TSC_OUTPUT=$(pnpm exec tsc --noEmit 2>&1)
TSC_EXIT=$?

if [ $TSC_EXIT -ne 0 ]; then
  echo "BLOCKED: tsc --noEmit found type errors. Fix them before committing."
  echo ""
  echo "$TSC_OUTPUT" | head -30
  if [ "$(echo "$TSC_OUTPUT" | wc -l)" -gt 30 ]; then
    echo "... (truncated, run 'pnpm exec tsc --noEmit' to see all errors)"
  fi
  exit 2
fi

# tsc passed — allow the commit
exit 0
