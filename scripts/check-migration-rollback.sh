#!/usr/bin/env bash
# CI guard: destructive migration plans must include a Rollback section.
#
# Background (CLAUDE.md → "Schema And Deploy Safety"):
# "Any migration that drops columns, tables, or types must include a `## Rollback`
# section in the plan specifying: (a) whether rollback is possible, (b) what
# data is lost, (c) what the recovery procedure is. If rollback is impossible,
# say so explicitly — 'rollback is not possible, data is permanently destroyed.'"
#
# Scope:
#   - Top-level docs/plans/*.md (the active plan dir).
#   - docs/plans/done/ is intentionally NOT scanned — historical plans, no longer
#     subject to enforcement.
#
# Detection:
#   - DROP COLUMN, DROP TABLE, DROP TYPE, ALTER TABLE ... DROP inside a fenced
#     code block (```...```). Prose mentions in single backticks (e.g. when a
#     plan documents the *check itself* — "scan for DROP TABLE") are NOT flagged.
#
# Exit codes:
#   0 - clean (no destructive plan, or every destructive plan has a Rollback section)
#   1 - one or more destructive plans missing '## Rollback'

set -euo pipefail

ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
PLAN_DIR="$ROOT/docs/plans"

if [[ ! -d "$PLAN_DIR" ]]; then
  echo "No $PLAN_DIR — nothing to check"
  exit 0
fi

ROLLBACK_RE='^##[[:space:]]+Rollback'

# Returns 0 if file contains a DROP inside a fenced code block.
has_destructive_sql() {
  awk '
    /^```/    { in_code = !in_code; next }
    in_code && /DROP[[:space:]]+(TABLE|COLUMN|TYPE)/ { found = 1 }
    in_code && /ALTER[[:space:]]+TABLE.*DROP/        { found = 1 }
    END { exit found ? 0 : 1 }
  ' "$1"
}

missing=()
checked=0
destructive=0

while IFS= read -r -d '' f; do
  checked=$((checked + 1))
  if has_destructive_sql "$f"; then
    destructive=$((destructive + 1))
    if ! grep -qE "$ROLLBACK_RE" "$f"; then
      missing+=("${f#$ROOT/}")
    fi
  fi
done < <(find "$PLAN_DIR" -maxdepth 1 -name '*.md' -type f -print0)

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "✗ Destructive migration plans missing a '## Rollback' section:"
  for f in "${missing[@]}"; do
    echo "    - $f"
  done
  echo ""
  echo "Per CLAUDE.md → 'Schema And Deploy Safety', the section must spell out:"
  echo "  (a) whether rollback is possible"
  echo "  (b) what data is lost"
  echo "  (c) the recovery procedure"
  echo "If rollback is impossible, say so explicitly."
  exit 1
fi

echo "✓ All destructive plans have Rollback ($destructive of $checked plans contain DROP)"
exit 0
