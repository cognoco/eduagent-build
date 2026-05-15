#!/usr/bin/env bash
# record-test-receipt.sh - run scoped affected tests and write a receipt.
#
# Usage:  scripts/record-test-receipt.sh <scope>
#   scope: mobile           (currently the only supported scope)
#
# What this does
#   1. Identifies mobile TS/TSX files changed vs origin/main for the scope.
#   2. Runs Jest only for tests related to those affected files.
#   3. On pass, writes .test-receipts/<scope>.json with the affected file list
#      and timestamp. The pre-push hook validates that the receipt is passing,
#      covers the affected files, and is not older than 24 hours.
#
# The receipt is intentionally not content-hash-bound. A follow-up commit that
# touches the same files should not force a multi-hour suite rerun; freshness
# and affected-file coverage are the gate.

set -euo pipefail

RECEIPT_MAX_AGE_HOURS=24

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

join_command() {
  local out=""
  local arg
  for arg in "$@"; do
    if [[ -z "$out" ]]; then
      printf -v out '%q' "$arg"
    else
      printf -v out '%s %q' "$out" "$arg"
    fi
  done
  printf '%s' "$out"
}

SCOPE="${1:-}"
if [[ -z "$SCOPE" ]]; then
  cat >&2 <<EOF
usage: scripts/record-test-receipt.sh <scope>

Supported scopes:
  mobile     apps/mobile/src/**/*.{ts,tsx} -> related Jest tests only

After a green run, .test-receipts/<scope>.json is written. Stage and
commit it alongside your changes so the pre-push hook can verify it.
EOF
  exit 2
fi

case "$SCOPE" in
  mobile)
    GLOB='^apps/mobile/src/.+\.[jt]sx?$'
    TEST_CMD=(pnpm exec jest --config apps/mobile/jest.config.cjs --findRelatedTests)
    TEST_ARGS=(--runInBand --no-coverage --forceExit)
    ;;
  *)
    echo "unknown scope: $SCOPE (supported: mobile)" >&2
    exit 2
    ;;
esac

BASE=$(git merge-base HEAD origin/main 2>/dev/null \
       || git merge-base HEAD main 2>/dev/null \
       || echo "main")

CHANGED=$(git diff --name-only --diff-filter=d "$BASE..HEAD" 2>/dev/null \
          | grep -E "$GLOB" || true)
UNCOMMITTED=$(git diff --name-only --diff-filter=d 2>/dev/null \
              | grep -E "$GLOB" || true)
STAGED=$(git diff --cached --name-only --diff-filter=d 2>/dev/null \
         | grep -E "$GLOB" || true)

ALL_CHANGED=$(printf '%s\n%s\n%s\n' "$CHANGED" "$UNCOMMITTED" "$STAGED" \
              | grep -v '^$' | sort -u || true)

if [[ -z "$ALL_CHANGED" ]]; then
  echo "[receipt:$SCOPE] No $SCOPE files changed vs origin/main."
  echo "[receipt:$SCOPE] Nothing to record."
  exit 0
fi

mapfile -t AFFECTED_FILES <<< "$ALL_CHANGED"
COMMAND_DISPLAY=$(join_command "${TEST_CMD[@]}" "${AFFECTED_FILES[@]}" "${TEST_ARGS[@]}")

echo "[receipt:$SCOPE] Affected files in scope:"
printf '  %s\n' "${AFFECTED_FILES[@]}"
echo
echo "[receipt:$SCOPE] Command: $COMMAND_DISPLAY"
echo "[receipt:$SCOPE] Running..."
echo "--------------------------------------------------------------"

if ! "${TEST_CMD[@]}" "${AFFECTED_FILES[@]}" "${TEST_ARGS[@]}"; then
  echo
  echo "[receipt:$SCOPE] TESTS FAILED - receipt NOT written."
  echo "[receipt:$SCOPE] Fix the failures, then re-run this script."
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
  printf '  "maxAgeHours": %s,\n' "$RECEIPT_MAX_AGE_HOURS"
  printf '  "verifiedBy": "%s",\n' "$(json_escape "$USER_NAME @ $HOST")"
  printf '  "command": "%s",\n' "$(json_escape "$COMMAND_DISPLAY")"
  echo '  "passed": true,'
  echo '  "affectedFiles": {'
  FIRST=1
  for f in "${AFFECTED_FILES[@]}"; do
    if [[ $FIRST -eq 1 ]]; then
      FIRST=0
    else
      echo ','
    fi
    printf '    "%s": true' "$(json_escape "$f")"
  done
  echo
  echo '  }'
  echo '}'
} > "$RECEIPT"

echo
echo "--------------------------------------------------------------"
echo "[receipt:$SCOPE] Wrote $RECEIPT"
echo "[receipt:$SCOPE] Valid for $RECEIPT_MAX_AGE_HOURS hours if the affected file set stays covered."
echo "[receipt:$SCOPE] Stage and commit the receipt before pushing."