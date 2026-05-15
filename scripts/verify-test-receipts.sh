#!/usr/bin/env bash
# verify-test-receipts.sh - invoked by .husky/pre-push.
#
# For each tracked scope, if mobile TS/TSX files changed vs origin/main,
# require a passing receipt at .test-receipts/<scope>.json. The receipt must
# cover every affected file and must be less than 24 hours old. It is not
# content-hash-bound; freshness plus affected-file coverage is the gate.
#
# Exit codes
#   0 - receipts valid (or no in-scope changes)
#   1 - at least one scope is missing, stale, expired, or incomplete
#
# Bypass
#   SKIP_RECEIPT_CHECK=1 git push     (or git push --no-verify)
#   Visible in shell history so reviewers can ask why.

set -u

RECEIPT_MAX_AGE_SECONDS=$((24 * 60 * 60))

if [[ "${SKIP_RECEIPT_CHECK:-0}" == "1" ]]; then
  echo "-- Test-receipt check: bypassed via SKIP_RECEIPT_CHECK=1"
  exit 0
fi

# Scope registry. Add new scopes here as their receipt support lands.
#   format: scope_name|file-glob-regex
SCOPES=(
  "mobile|^apps/mobile/src/.+\\.[jt]sx?$"
)

read_json_string_field() {
  local receipt="$1"
  local field="$2"
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg field "$field" '.[$field] // empty' "$receipt" 2>/dev/null
  else
    grep -oE '"'"$field"'"[[:space:]]*:[[:space:]]*"[^"]+"' "$receipt" \
      | head -n 1 \
      | sed -E 's/.*:[[:space:]]*"([^"]+)".*/\1/'
  fi
}

read_json_bool_field() {
  local receipt="$1"
  local field="$2"
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg field "$field" '.[$field] // empty' "$receipt" 2>/dev/null
  else
    grep -oE '"'"$field"'"[[:space:]]*:[[:space:]]*(true|false)' "$receipt" \
      | head -n 1 \
      | grep -oE '(true|false)' || true
  fi
}

receipt_covers_file() {
  local receipt="$1"
  local file="$2"
  if command -v jq >/dev/null 2>&1; then
    [[ "$(jq -r --arg f "$file" '.affectedFiles[$f] == true' "$receipt" 2>/dev/null)" == "true" ]]
  else
    local escaped
    escaped=$(printf '%s' "$file" | sed 's/[][\/.^$*]/\\&/g')
    grep -Eq '"'"$escaped"'"[[:space:]]*:[[:space:]]*true' "$receipt"
  fi
}

timestamp_to_epoch() {
  node -e 'const value = process.argv[1]; const ts = Date.parse(value); if (!Number.isFinite(ts)) process.exit(1); console.log(Math.floor(ts / 1000));' "$1" 2>/dev/null
}

now_epoch() {
  node -e 'console.log(Math.floor(Date.now() / 1000));' 2>/dev/null
}

BASE=$(git merge-base HEAD origin/main 2>/dev/null \
       || git merge-base HEAD main 2>/dev/null \
       || echo "main")

FAILED=0

for entry in "${SCOPES[@]}"; do
  scope="${entry%%|*}"
  glob="${entry#*|}"
  receipt=".test-receipts/$scope.json"

  # Pre-push validates only committed branch content because that is what will
  # be pushed. The recorder includes staged/unstaged edits so users can create
  # the receipt before making the commit that contains it.
  changed=$(git diff --name-only --diff-filter=d "$BASE..HEAD" 2>/dev/null \
            | grep -E "$glob" || true)

  if [[ -z "$changed" ]]; then
    continue
  fi

  echo "-- Test-receipt check: $scope --"
  echo "Files changed in this branch vs main:"
  echo "$changed" | sed 's/^/  /'

  if [[ ! -f "$receipt" ]]; then
    echo
    echo "Missing receipt: $receipt"
    echo
    echo "  This branch modifies $scope files but has no recorded verification. Run:"
    echo
    echo "    bash scripts/record-test-receipt.sh $scope"
    echo
    echo "  Then commit the receipt and push again."
    FAILED=1
    continue
  fi

  passed=$(read_json_bool_field "$receipt" passed)
  if [[ "$passed" != "true" ]]; then
    echo
    echo "Receipt is not in pass state ($receipt)."
    echo "  Re-run: bash scripts/record-test-receipt.sh $scope"
    FAILED=1
    continue
  fi

  verified_at=$(read_json_string_field "$receipt" verifiedAt)
  verified_epoch=$(timestamp_to_epoch "$verified_at" || true)
  current_epoch=$(now_epoch || true)

  if [[ -z "$verified_at" || -z "$verified_epoch" || -z "$current_epoch" ]]; then
    echo
    echo "Receipt has an invalid verifiedAt timestamp ($receipt)."
    echo "  Re-run: bash scripts/record-test-receipt.sh $scope"
    FAILED=1
    continue
  fi

  age_seconds=$((current_epoch - verified_epoch))
  if [[ $age_seconds -lt -300 ]]; then
    echo
    echo "Receipt timestamp is in the future: $verified_at"
    echo "  Re-run: bash scripts/record-test-receipt.sh $scope"
    FAILED=1
    continue
  fi
  if [[ $age_seconds -lt 0 ]]; then
    age_seconds=0
  fi

  if [[ $age_seconds -gt $RECEIPT_MAX_AGE_SECONDS ]]; then
    age_hours=$((age_seconds / 3600))
    echo
    echo "Receipt is too old ($age_hours hours; max 24): $receipt"
    echo "  Re-run: bash scripts/record-test-receipt.sh $scope"
    FAILED=1
    continue
  fi

  missing=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if ! receipt_covers_file "$receipt" "$f"; then
      echo
      echo "Receipt does not cover affected file: $f"
      missing=1
    fi
  done <<< "$changed"

  if [[ $missing -ne 0 ]]; then
    echo
    echo "  Re-run so the receipt covers the current affected file set:"
    echo "    bash scripts/record-test-receipt.sh $scope"
    FAILED=1
    continue
  fi

  file_count=$(echo "$changed" | grep -c . || true)
  age_minutes=$((age_seconds / 60))
  echo "Receipt valid ($file_count affected file(s), ${age_minutes}m old, max 24h)."
  echo
done

exit $FAILED