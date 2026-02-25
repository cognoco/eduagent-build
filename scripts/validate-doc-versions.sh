#!/usr/bin/env bash
# validate-doc-versions.sh — Compare actual codebase counts against CLAUDE.md claims
# Exit 0 if all match (within tolerance), exit 1 if any mismatch.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_doc-counts.sh"

TOLERANCE=5  # percent
failures=0

# Check if two numbers are within tolerance
within_tolerance() {
  local actual=$1 claimed=$2
  if [ "$claimed" -eq 0 ]; then
    [ "$actual" -eq 0 ] && return 0 || return 1
  fi
  local diff=$(( actual - claimed ))
  [ "$diff" -lt 0 ] && diff=$(( -diff ))
  local threshold=$(( claimed * TOLERANCE / 100 ))
  [ "$threshold" -lt 1 ] && threshold=1
  [ "$diff" -le "$threshold" ]
}

# Print a single check result
# Usage: report "Label" actual claimed_display claimed_numeric
report() {
  local label="$1" actual="$2" display="$3" claimed="$4"

  if [ "$actual" -eq "$claimed" ]; then
    printf "  ✓ %-25s  actual: %-6s  claimed: %-6s  — OK\n" "$label" "$actual" "$display"
  elif within_tolerance "$actual" "$claimed"; then
    printf "  ~ %-25s  actual: %-6s  claimed: %-6s  — CLOSE ENOUGH (within %d%%)\n" "$label" "$actual" "$display" "$TOLERANCE"
  else
    printf "  ✗ %-25s  actual: %-6s  claimed: %-6s  — MISMATCH\n" "$label" "$actual" "$display"
    failures=$((failures + 1))
  fi
}

# Extract claimed numbers from CLAUDE.md
# Strategy: grep -oE to isolate "number + keyword", then grab the number.
# This avoids sed greedy-matching pitfalls with comma-separated numbers like "1,300".
parse_before() {
  # Extract number immediately before a keyword: "1,300 API tests" → "1,300"
  local keyword="$1"
  grep -m1 "[0-9][0-9,]* ${keyword}" "$REPO_ROOT/CLAUDE.md" \
    | grep -oE "[0-9][0-9,]* ${keyword}" \
    | grep -oE '^[0-9][0-9,]*'
}

parse_after_all() {
  # Extract number after "All": "All 20 route groups" → "20"
  grep -m1 "All [0-9]" "$REPO_ROOT/CLAUDE.md" \
    | grep -oE 'All [0-9,]+' \
    | grep -oE '[0-9,]+'
}

parse_paren_suites() {
  # Extract number in parens: "(41 test suites)" → "41"
  grep -m1 '([0-9].*test suites)' "$REPO_ROOT/CLAUDE.md" \
    | grep -oE '[0-9,]+ test suites' \
    | grep -oE '^[0-9,]+'
}

echo ""
echo "CLAUDE.md Validation Report"
echo "==========================="

# API tests
claimed_raw=$(parse_before "API tests")
if [ -n "$claimed_raw" ]; then
  report "API tests" "$(count_api_tests)" "$claimed_raw" "$(strip_commas "$claimed_raw")"
else
  printf "  ? %-25s  (pattern not found in CLAUDE.md)\n" "API tests"
  failures=$((failures + 1))
fi

# Mobile tests
claimed_raw=$(parse_before "mobile tests")
if [ -n "$claimed_raw" ]; then
  report "Mobile tests" "$(count_mobile_tests)" "$claimed_raw" "$(strip_commas "$claimed_raw")"
else
  printf "  ? %-25s  (pattern not found in CLAUDE.md)\n" "Mobile tests"
  failures=$((failures + 1))
fi

# Integration suites
claimed_raw=$(parse_before "integration test suites")
if [ -n "$claimed_raw" ]; then
  report "Integration suites" "$(count_integration_suites)" "$claimed_raw" "$(strip_commas "$claimed_raw")"
else
  printf "  ? %-25s  (pattern not found in CLAUDE.md)\n" "Integration suites"
  failures=$((failures + 1))
fi

# Route groups
claimed_raw=$(parse_after_all)
if [ -n "$claimed_raw" ]; then
  report "Route groups" "$(count_route_groups)" "$claimed_raw" "$(strip_commas "$claimed_raw")"
else
  printf "  ? %-25s  (pattern not found in CLAUDE.md)\n" "Route groups"
  failures=$((failures + 1))
fi

# Mobile suites
claimed_raw=$(parse_paren_suites)
if [ -n "$claimed_raw" ]; then
  report "Mobile suites" "$(count_mobile_suites)" "$claimed_raw" "$(strip_commas "$claimed_raw")"
else
  printf "  ? %-25s  (pattern not found in CLAUDE.md)\n" "Mobile suites"
  failures=$((failures + 1))
fi

# Inngest functions (match line with a number before the keyword, skipping prose-only lines)
claimed_raw=$(grep -m1 "[0-9] Inngest functions" "$REPO_ROOT/CLAUDE.md" \
  | grep -oE '[0-9,]+ Inngest' \
  | grep -oE '^[0-9,]+')
if [ -n "$claimed_raw" ]; then
  report "Inngest functions" "$(count_inngest_functions)" "$claimed_raw" "$(strip_commas "$claimed_raw")"
else
  printf "  ? %-25s  (pattern not found in CLAUDE.md)\n" "Inngest functions"
  failures=$((failures + 1))
fi

echo "==========================="

if [ "$failures" -gt 0 ]; then
  echo "$failures mismatch(es) found. Run: bash scripts/update-claude-md.sh"
  exit 1
else
  echo "All counts match. CLAUDE.md is up to date."
  exit 0
fi
