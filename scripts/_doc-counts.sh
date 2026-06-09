#!/usr/bin/env bash
# _doc-counts.sh — Shared counting functions for CLAUDE.md validation/update
# Sourced by validate-doc-versions.sh and update-claude-md.sh. Not executable standalone.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

count_api_tests() {
  grep -rc '^\s*\(test\|it\)(' "$REPO_ROOT/apps/api/src" --include="*.test.ts" 2>/dev/null \
    | awk -F: '{s+=$2}END{print s+0}'
}

count_mobile_tests() {
  grep -rc '^\s*\(test\|it\)(' "$REPO_ROOT/apps/mobile" --include="*.test.ts" --include="*.test.tsx" 2>/dev/null \
    | grep -v node_modules \
    | awk -F: '{s+=$2}END{print s+0}'
}

count_integration_suites() {
  find "$REPO_ROOT/tests/integration" -name "*.integration.test.ts" 2>/dev/null | wc -l | tr -d ' '
}

count_route_groups() {
  ls "$REPO_ROOT/apps/api/src/routes/"*.ts 2>/dev/null \
    | grep -v ".test.ts" \
    | grep -v "test-seed" \
    | wc -l | tr -d ' '
}

count_inngest_functions() {
  grep -rl "inngest.createFunction" "$REPO_ROOT/apps/api/src/inngest/functions/" --include="*.ts" 2>/dev/null \
    | wc -l | tr -d ' '
}

count_mobile_suites() {
  find "$REPO_ROOT/apps/mobile" -name "*.test.ts" -o -name "*.test.tsx" 2>/dev/null \
    | grep -v node_modules \
    | wc -l | tr -d ' '
}

# Extract the first number matching a pattern from CLAUDE.md
# Usage: extract_claimed "API tests"  →  returns "1,300" (raw text including commas)
extract_claimed() {
  local pattern="$1"
  grep -m1 "$pattern" "$REPO_ROOT/CLAUDE.md" 2>/dev/null
}

# Strip commas from a number string: "1,300" → "1300"
strip_commas() {
  echo "$1" | tr -d ','
}
