#!/usr/bin/env bash
# verify-test-receipts.sh — invoked by .husky/pre-push.
#
# For each tracked scope, if test files changed vs origin/main, require
# a matching receipt at .test-receipts/<scope>.json. The receipt must
# record the current content hash of every changed test file. Modifying
# a file after recording invalidates the receipt.
#
# Exit codes
#   0 — receipts valid (or no in-scope changes)
#   1 — at least one scope is missing or stale; push should be blocked
#
# Bypass
#   SKIP_RECEIPT_CHECK=1 git push     (or git push --no-verify)
#   Visible in shell history so reviewers can ask why.

set -u

if [[ "${SKIP_RECEIPT_CHECK:-0}" == "1" ]]; then
  echo "── Test-receipt check: bypassed via SKIP_RECEIPT_CHECK=1"
  exit 0
fi

# Scope registry. Add new scopes here as their receipt support lands.
#   format: scope_name|file-glob-regex
SCOPES=(
  "mobile|^apps/mobile/src/.+\\.test\\.tsx?$"
)

BASE=$(git merge-base HEAD origin/main 2>/dev/null \
       || git merge-base HEAD main 2>/dev/null \
       || echo "main")

FAILED=0

for entry in "${SCOPES[@]}"; do
  scope="${entry%%|*}"
  glob="${entry#*|}"
  receipt=".test-receipts/$scope.json"

  changed=$(git diff --name-only --diff-filter=d "$BASE..HEAD" 2>/dev/null \
            | grep -E "$glob" || true)

  if [[ -z "$changed" ]]; then
    continue
  fi

  echo "── Test-receipt check: $scope ──"
  echo "Files changed in this branch vs main:"
  echo "$changed" | sed 's/^/  /'

  if [[ ! -f "$receipt" ]]; then
    echo
    echo "✗ Missing receipt: $receipt"
    echo
    echo "  This branch modifies $scope test files but has no recorded"
    echo "  verification that the suite passes. Run:"
    echo
    echo "    bash scripts/record-test-receipt.sh $scope"
    echo
    echo "  Then commit the receipt (it's a tiny JSON file) and push again."
    FAILED=1
    continue
  fi

  # Parse the receipt with jq if available, else with grep. The receipt
  # is small + well-formed (we wrote it) so grep is fine.
  if command -v jq >/dev/null 2>&1; then
    passed=$(jq -r '.passed' "$receipt" 2>/dev/null || echo "")
  else
    passed=$(grep -oE '"passed":[[:space:]]*(true|false)' "$receipt" \
             | grep -oE '(true|false)' || echo "")
  fi

  if [[ "$passed" != "true" ]]; then
    echo
    echo "✗ Receipt is not in pass state ($receipt)."
    echo "  Re-run: bash scripts/record-test-receipt.sh $scope"
    FAILED=1
    continue
  fi

  # Validate that every changed file's current hash is recorded in the receipt.
  mismatch=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    current=$(git hash-object "$f" 2>/dev/null || echo "MISSING")
    if command -v jq >/dev/null 2>&1; then
      recorded=$(jq -r --arg f "$f" '.testFiles[$f] // "MISSING"' "$receipt" 2>/dev/null)
    else
      # Best-effort grep — works as long as we wrote the receipt and didn't
      # hand-edit it. Falls back to MISSING if not found.
      recorded=$(grep -oE "\"$(printf '%s' "$f" | sed 's/[][\/.^$*]/\\&/g')\":[[:space:]]*\"[a-f0-9]+\"" "$receipt" \
                 | grep -oE '"[a-f0-9]+"$' | tr -d '"' || echo "MISSING")
      [[ -z "$recorded" ]] && recorded="MISSING"
    fi

    if [[ "$recorded" != "$current" ]]; then
      echo
      echo "✗ Stale receipt entry for $f"
      echo "    recorded: $recorded"
      echo "    current : $current"
      mismatch=1
    fi
  done <<< "$changed"

  if [[ $mismatch -ne 0 ]]; then
    echo
    echo "  The receipt was written against earlier content. Re-run:"
    echo "    bash scripts/record-test-receipt.sh $scope"
    echo "  Then amend or commit the updated receipt."
    FAILED=1
    continue
  fi

  echo "✓ Receipt valid (all $(echo "$changed" | wc -l | tr -d ' ') file(s) verified)."
  echo
done

exit $FAILED
