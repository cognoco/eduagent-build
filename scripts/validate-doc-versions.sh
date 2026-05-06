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

# Extract claimed numbers from the current CLAUDE.md snapshot format.
parse_snapshot_line() {
  local label="$1"
  grep -m1 "^- ${label}:" "$REPO_ROOT/CLAUDE.md" || true
}

parse_snapshot_value() {
  local label="$1" pattern="$2" occurrence="${3:-first}"
  local line matches

  line=$(parse_snapshot_line "$label")
  if [ -z "$line" ]; then
    return 0
  fi

  matches=$(printf "%s\n" "$line" | grep -oE "$pattern" || true)
  if [ -z "$matches" ]; then
    return 0
  fi

  if [ "$occurrence" = "last" ]; then
    printf "%s\n" "$matches" | tail -n1 | grep -oE '~?[0-9][0-9,]*' | head -n1
  else
    printf "%s\n" "$matches" | head -n1 | grep -oE '~?[0-9][0-9,]*' | head -n1
  fi
}

strip_claimed_count() {
  strip_commas "$1" | tr -d '~'
}

echo ""
echo "CLAUDE.md Validation Report"
echo "==========================="

# API tests
claimed_raw=$(parse_snapshot_value "API" '~?[0-9][0-9,]* tests' last)
if [ -n "$claimed_raw" ]; then
  report "API tests" "$(count_api_tests)" "$claimed_raw" "$(strip_claimed_count "$claimed_raw")"
else
  printf "  ? %-25s  (pattern not found in CLAUDE.md)\n" "API tests"
  failures=$((failures + 1))
fi

# Mobile tests
claimed_raw=$(parse_snapshot_value "Mobile" '~?[0-9][0-9,]* tests' last)
if [ -n "$claimed_raw" ]; then
  report "Mobile tests" "$(count_mobile_tests)" "$claimed_raw" "$(strip_claimed_count "$claimed_raw")"
else
  printf "  ? %-25s  (pattern not found in CLAUDE.md)\n" "Mobile tests"
  failures=$((failures + 1))
fi

# Integration suites
claimed_raw=$(parse_snapshot_value "Cross-package integration tests" '[0-9][0-9,]* suites')
if [ -n "$claimed_raw" ]; then
  report "Integration suites" "$(count_integration_suites)" "$claimed_raw" "$(strip_claimed_count "$claimed_raw")"
else
  printf "  ? %-25s  (pattern not found in CLAUDE.md)\n" "Integration suites"
  failures=$((failures + 1))
fi

# Route groups
claimed_raw=$(parse_snapshot_value "API" '[0-9][0-9,]* route groups')
if [ -n "$claimed_raw" ]; then
  report "Route groups" "$(count_route_groups)" "$claimed_raw" "$(strip_claimed_count "$claimed_raw")"
else
  printf "  ? %-25s  (pattern not found in CLAUDE.md)\n" "Route groups"
  failures=$((failures + 1))
fi

# Mobile suites
claimed_raw=$(parse_snapshot_value "Mobile" '[0-9][0-9,]* test suites')
if [ -n "$claimed_raw" ]; then
  report "Mobile suites" "$(count_mobile_suites)" "$claimed_raw" "$(strip_claimed_count "$claimed_raw")"
else
  printf "  ? %-25s  (pattern not found in CLAUDE.md)\n" "Mobile suites"
  failures=$((failures + 1))
fi

# Inngest functions (match line with a number before the keyword, skipping prose-only lines)
claimed_raw=$(parse_snapshot_value "API" '[0-9][0-9,]* Inngest functions')
if [ -n "$claimed_raw" ]; then
  report "Inngest functions" "$(count_inngest_functions)" "$claimed_raw" "$(strip_claimed_count "$claimed_raw")"
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
