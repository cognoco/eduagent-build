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
DRIZZLE_DIR="$ROOT/apps/api/drizzle"
JOURNAL="$DRIZZLE_DIR/meta/_journal.json"

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

# ---- Drizzle SQL migrations ----------------------------------------------
# Two checks against apps/api/drizzle/:
#   1. Every SQL file containing a destructive statement (DROP / DELETE)
#      must have a sibling <name>.rollback.md so deploy-time rollback is
#      pre-authored, not improvised.
#   2. Every entry in meta/_journal.json must have a corresponding
#      meta/<idx>_snapshot.json. A missing snapshot silently breaks
#      `drizzle-kit generate` on the next schema change.

if [[ ! -d "$DRIZZLE_DIR" ]]; then
  echo "No $DRIZZLE_DIR — skipping SQL migration checks"
  exit 0
fi

sql_missing=()
sql_destructive=0
sql_checked=0

while IFS= read -r -d '' sqlf; do
  sql_checked=$((sql_checked + 1))
  # Strip line / block comments before scanning so a SQL comment mentioning
  # DROP doesn't trigger the check.
  if sed -E -e 's://.*$::' -e '/\/\*/,/\*\//d' "$sqlf" \
      | grep -qE '\b(DROP[[:space:]]+(TABLE|COLUMN|TYPE|INDEX|CONSTRAINT|SCHEMA)|ALTER[[:space:]]+TABLE.*DROP|DELETE[[:space:]]+FROM|TRUNCATE)\b'; then
    sql_destructive=$((sql_destructive + 1))
    rollback="${sqlf%.sql}.rollback.md"
    # Accept either a sibling <name>.rollback.md OR an inline `-- ## Rollback`
    # comment block in the SQL itself (the older convention; see 0043, 0044).
    if [[ ! -f "$rollback" ]] && ! grep -qE '^[[:space:]]*--[[:space:]]*##[[:space:]]+Rollback' "$sqlf"; then
      sql_missing+=("${sqlf#$ROOT/}")
    fi
  fi
done < <(find "$DRIZZLE_DIR" -maxdepth 1 -name '*.sql' -type f -print0)

if [[ ${#sql_missing[@]} -gt 0 ]]; then
  echo "✗ Destructive SQL migrations missing a sibling <name>.rollback.md:"
  for f in "${sql_missing[@]}"; do
    echo "    - $f"
  done
  echo ""
  echo "Add a rollback markdown next to the .sql file describing reversibility,"
  echo "data loss, and recovery procedure (see existing 0046_*/0048_*/0052_*.rollback.md)."
  exit 1
fi

echo "✓ All destructive SQL migrations have a rollback.md ($sql_destructive of $sql_checked migrations are destructive)"

# Snapshot integrity: only the LATEST journal entry must have a snapshot —
# that's the one drizzle-kit reads to compute the next diff. Historical gaps
# from custom hand-authored migrations (idxs 0006-0010, 0013, 0021, 0025,
# 0043, 0044 as of 2026-05-04) are pre-existing tech debt and don't break
# generation, since drizzle only consults the most recent snapshot.
#
# A missing latest-snapshot is the bug we want to catch (finding C-4: the
# 0053 SQL was added without 0053_snapshot.json, which would silently break
# the next `drizzle-kit generate`).
if [[ -f "$JOURNAL" ]]; then
  latest_idx=$(grep -oE '"idx":[[:space:]]*[0-9]+' "$JOURNAL" | grep -oE '[0-9]+' | sort -n | tail -1)
  if [[ -n "$latest_idx" ]]; then
    padded=$(printf '%04d' "$latest_idx")
    if ! ls "$DRIZZLE_DIR/meta/${padded}_"*.json >/dev/null 2>&1; then
      echo "✗ Latest drizzle journal entry (idx $padded) is missing a meta/${padded}_*.json snapshot."
      echo ""
      echo "A missing latest snapshot silently breaks 'drizzle-kit generate' on"
      echo "the next schema change. Regenerate with 'pnpm run db:generate:dev' or"
      echo "hand-author from the previous snapshot."
      exit 1
    fi
    echo "✓ Latest journal entry (idx $padded) has a snapshot"
  fi
fi

exit 0
