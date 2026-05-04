#!/usr/bin/env bash
# CI guard: forbid [MARKER] tokens in LLM prompt builders.
#
# Background (CLAUDE.md → "Non-Negotiable Engineering Rules"):
# LLM responses that drive state-machine decisions must use the structured
# `signals` envelope (services/llm/envelope.ts). Embedding bracket tokens like
# [CLOSE_INTERVIEW] or [ESCALATE] in free-text replies is the legacy antipattern
# we migrated away from. New uses regress that migration.
#
# Scope:
#   - All apps/api/src/services/**/*-prompts.ts files.
#
# Allowed bracket-tokens (SSE sentinels, not LLM directives):
#   [DONE] [OK]
#
# Lines that are *warning the LLM off* a marker are also allowed (e.g. the
# system prompt that says "Do not include markers like [PARTIAL_PROGRESS]").
# Detected via negation phrases on the same line.
#
# Exit codes:
#   0 - clean
#   1 - one or more unallowed marker tokens found

set -euo pipefail

ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
SEARCH_DIR="$ROOT/apps/api/src/services"

if [[ ! -d "$SEARCH_DIR" ]]; then
  echo "No $SEARCH_DIR — nothing to check"
  exit 0
fi

# Pattern: 3+ uppercase/underscore/digit chars in [BRACKETS], starting with letter.
TOKEN_RE='\[[A-Z][A-Z0-9_]{2,}\]'
# SSE sentinels — strip these out before re-checking the line for any remaining marker.
ALLOWLIST_RE='\[(DONE|OK)\]'
# Lines that are *describing a forbidden marker* rather than emitting one.
NEGATION_RE="(do not|don't|never use|avoid|instead of|markers like|not \[|no \[)"

found=0
findings=""

while IFS= read -r -d '' f; do
  while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    lineno="${match%%:*}"
    line="${match#*:}"

    # Strip allowlisted sentinels; if no marker pattern remains, skip line.
    stripped=$(printf '%s' "$line" | sed -E "s/$ALLOWLIST_RE//g")
    if ! printf '%s' "$stripped" | grep -qE "$TOKEN_RE"; then
      continue
    fi

    # Skip lines that are documenting forbidden markers (negation context).
    if printf '%s' "$line" | grep -qiE "$NEGATION_RE"; then
      continue
    fi

    findings+="${f#$ROOT/}:$lineno:$line"$'\n'
    found=$((found + 1))
  done < <(grep -nE "$TOKEN_RE" "$f" || true)
done < <(find "$SEARCH_DIR" -name '*-prompts.ts' -type f -print0)

if [[ $found -gt 0 ]]; then
  printf '%s' "$findings"
  echo ""
  echo "✗ $found unauthorized [MARKER] token(s) in prompt files."
  echo "  Use the structured signals envelope (services/llm/envelope.ts) — not free-text markers."
  echo "  See CLAUDE.md → 'Non-Negotiable Engineering Rules' → LLM Response Envelope."
  exit 1
fi

echo "✓ No marker tokens in prompt files"
exit 0
