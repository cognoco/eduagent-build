#!/usr/bin/env bash
# record-test-receipt.sh — run scoped tests and write a verification receipt.
#
# Usage:  scripts/record-test-receipt.sh <scope>
#   scope: mobile           (currently the only supported scope)
#
# What this does
#   1. Identifies test files changed vs origin/main for the scope.
#   2. Runs the appropriate test command for that scope.
#   3. On pass, writes .test-receipts/<scope>.json with the current
#      content hash of each changed test file. The pre-push hook
#      validates against this — if you modify a test file after the
#      receipt was written, the push is blocked.
#
# Why
#   A green local test run is the only real evidence that a refactor
#   still works. Without a hash-bound receipt, "tests pass" is hearsay,
#   and the kind of regression that ate PR #257 ships unchecked.
#
# Bypass
#   SKIP_RECEIPT_CHECK=1 git push     (also honors git push --no-verify)
#   The bypass shows up in `git push` output so it's visible in chat
#   transcripts. Use only for emergency reverts.

set -euo pipefail

json_escape() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\b'/\\b}
  value=${value//$'\f'/\\f}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s' "$value"
}

SCOPE="${1:-}"
if [[ -z "$SCOPE" ]]; then
  cat >&2 <<EOF
usage: scripts/record-test-receipt.sh <scope>

Supported scopes:
  mobile     apps/mobile/src/**/*.test.tsx?  ->  pnpm exec nx run mobile:test

After a green run, .test-receipts/<scope>.json is written. Stage and
commit it alongside your test changes so the pre-push hook can verify it.
EOF
  exit 2
fi

case "$SCOPE" in
  mobile)
    GLOB='^apps/mobile/src/.+\.test\.tsx?$'
    TEST_CMD='pnpm exec nx run mobile:test'
    ;;
  *)
    echo "unknown scope: $SCOPE (supported: mobile)" >&2
    exit 2
    ;;
esac

# Determine merge base against origin/main. Fall back to main if origin/main
# is missing (e.g., fresh clone without fetched main).
BASE=$(git merge-base HEAD origin/main 2>/dev/null \
       || git merge-base HEAD main 2>/dev/null \
       || echo "main")

CHANGED=$(git diff --name-only --diff-filter=d "$BASE..HEAD" 2>/dev/null \
          | grep -E "$GLOB" || true)

# Include unstaged + staged changes that match the scope, too. A receipt
# written before commit would be confusing — but if the user has staged
# new test edits since the last commit, those should be in scope.
UNCOMMITTED=$(git diff --name-only --diff-filter=d 2>/dev/null \
              | grep -E "$GLOB" || true)
STAGED=$(git diff --cached --name-only --diff-filter=d 2>/dev/null \
         | grep -E "$GLOB" || true)

ALL_CHANGED=$(printf '%s\n%s\n%s\n' "$CHANGED" "$UNCOMMITTED" "$STAGED" \
              | grep -v '^$' | sort -u || true)

if [[ -z "$ALL_CHANGED" ]]; then
  echo "[receipt:$SCOPE] No $SCOPE test files changed vs origin/main."
  echo "[receipt:$SCOPE] Nothing to record. (If you expected changes, check"
  echo "[receipt:$SCOPE]  that you're on the right branch.)"
  exit 0
fi

echo "[receipt:$SCOPE] Test files in scope:"
echo "$ALL_CHANGED" | sed 's/^/  /'
echo
echo "[receipt:$SCOPE] Command: $TEST_CMD"
echo "[receipt:$SCOPE] Running…"
echo "──────────────────────────────────────────────────────────────"

if ! eval "$TEST_CMD"; then
  echo
  echo "[receipt:$SCOPE] ✗ TESTS FAILED — receipt NOT written."
  echo "[receipt:$SCOPE] Fix the failures, then re-run this script."
  echo
  echo "[receipt:$SCOPE] Common patterns:"
  echo "[receipt:$SCOPE]   - jest.mock factory references an out-of-scope variable"
  echo "[receipt:$SCOPE]     that doesn't start with 'mock'. Rename or inline-require."
  echo "[receipt:$SCOPE]   - Test asserts a testID/route the screen no longer renders."
  echo "[receipt:$SCOPE]   - Mock returns the wrong shape; assertion checks production shape."
  exit 1
fi

mkdir -p .test-receipts
RECEIPT=".test-receipts/$SCOPE.json"

TIMESTAMP=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
HOST=$(uname -n 2>/dev/null || echo unknown)
USER_NAME=$(git config user.name 2>/dev/null || echo unknown)

{
  echo '{'
  printf '  "scope": "%s",\n' "$(json_escape "$SCOPE")"
  printf '  "verifiedAt": "%s",\n' "$(json_escape "$TIMESTAMP")"
  printf '  "verifiedBy": "%s",\n' "$(json_escape "$USER_NAME @ $HOST")"
  printf '  "command": "%s",\n' "$(json_escape "$TEST_CMD")"
  echo '  "passed": true,'
  echo '  "testFiles": {'
  FIRST=1
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    # Hash the working-tree content (what tests just ran against).
    SHA=$(git hash-object "$f" 2>/dev/null || echo "MISSING")
    if [[ $FIRST -eq 1 ]]; then
      FIRST=0
    else
      echo ','
    fi
    printf '    "%s": "%s"' "$(json_escape "$f")" "$(json_escape "$SHA")"
  done <<< "$ALL_CHANGED"
  echo
  echo '  }'
  echo '}'
} > "$RECEIPT"

echo
echo "──────────────────────────────────────────────────────────────"
echo "[receipt:$SCOPE] ✓ Wrote $RECEIPT"
echo "[receipt:$SCOPE]"
echo "[receipt:$SCOPE] Stage the receipt before pushing:"
echo "[receipt:$SCOPE]   git add $RECEIPT"
echo "[receipt:$SCOPE] Commit it with the normal repo commit flow before pushing."
