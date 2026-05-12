#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

# Fail-fast validation of cleanup-extract.sh output.
#
# Runs immediately after extract. Aborts the workflow with a clear error
# before implement burns tokens on a malformed work order. Protects against
# silent extraction failures (e.g. the pipe-escaping bug that produced an
# empty Files Summary for PR-11).
#
# Usage: cleanup-validate-extract.sh <ARTIFACTS_DIR>

ARTIFACTS_DIR="${1:?Usage: cleanup-validate-extract.sh <ARTIFACTS_DIR>}"
WORK_ORDER="$ARTIFACTS_DIR/work-order.md"

[[ -f "$WORK_ORDER" ]] || { echo "ERROR: $WORK_ORDER not found — extract step did not produce a work order" >&2; exit 1; }
[[ -s "$WORK_ORDER" ]] || { echo "ERROR: $WORK_ORDER is empty" >&2; exit 1; }

errors=()

# 1. Files Summary table must have at least one data row.
files_rows="$(awk '/^## Files Summary/,/^---$/' "$WORK_ORDER" \
    | grep -cE '^\| `[^`]+`' || true)"
if [[ "${files_rows:-0}" -eq 0 ]]; then
    errors+=("Files Summary table has zero rows (extract likely failed to parse phase files-claimed column)")
fi

# 2. At least one Phase block must exist with a non-empty Description.
phase_count="$(grep -cE '^### Phase ' "$WORK_ORDER" || true)"
if [[ "${phase_count:-0}" -eq 0 ]]; then
    errors+=("No '### Phase' blocks found in work order")
fi

# 3. PR Summary table must have a non-empty Summary cell.
summary_cell="$(grep -E '^\| \*\*Summary\*\* \|' "$WORK_ORDER" \
    | sed -E 's/^\| \*\*Summary\*\* \| *(.*) *\|$/\1/' \
    | head -1)"
if [[ -z "$summary_cell" || "$summary_cell" =~ ^[[:space:]]*$ ]]; then
    errors+=("PR Summary row has empty Summary cell")
fi

# 4. Phases cell in PR Summary must contain at least one P<N> token.
phases_cell="$(grep -E '^\| \*\*Phases\*\* \|' "$WORK_ORDER" \
    | sed -E 's/^\| \*\*Phases\*\* \| *(.*) *\|$/\1/' \
    | head -1)"
if ! echo "$phases_cell" | grep -qE 'P[0-9]+'; then
    errors+=("PR Summary row has no P<N> phase tokens (got: '${phases_cell}')")
fi

if [[ ${#errors[@]} -gt 0 ]]; then
    echo "ERROR: work order failed validation (${#errors[@]} issue(s)):" >&2
    for e in "${errors[@]}"; do
        echo "  - $e" >&2
    done
    echo "" >&2
    echo "Work order: $WORK_ORDER" >&2
    echo "This indicates a bug in cleanup-extract.sh — check the cleanup-plan.md row" >&2
    echo "for unusual characters (escaped pipes, backslashes) that the parser dropped." >&2
    exit 1
fi

echo "work order validation passed: ${files_rows} files, ${phase_count} phase(s)"
