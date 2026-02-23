#!/usr/bin/env bash
# update-claude-md.sh — Update quantitative counts in CLAUDE.md from actual codebase state
#
# Updates: API tests, mobile tests, integration suites, route groups, mobile suites, Inngest function count.
# Does NOT update: Inngest function name list, feature descriptions, or qualitative text.
#
# Note: Uses GNU sed (-i with no backup suffix). On macOS, install GNU sed via `brew install gnu-sed`
# and use `gsed` or adjust the sed calls to `sed -i ''`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_doc-counts.sh"

TARGET="$REPO_ROOT/CLAUDE.md"

# Format number with comma for thousands: 1302 → "1,302"
format_number() {
  printf "%'d" "$1" 2>/dev/null || echo "$1"
}

echo "Updating CLAUDE.md counts..."
echo ""

# Collect actual counts
api=$(count_api_tests)
mobile=$(count_mobile_tests)
integration=$(count_integration_suites)
routes=$(count_route_groups)
suites=$(count_mobile_suites)
inngest=$(count_inngest_functions)

api_fmt=$(format_number "$api")
mobile_fmt=$(format_number "$mobile")

changes=0

# Helper: run sed replacement and report
update_pattern() {
  local label="$1" pattern="$2" replacement="$3"
  local before after

  before=$(grep -m1 "$pattern" "$TARGET" 2>/dev/null || true)
  if [ -z "$before" ]; then
    printf "  SKIP %-25s  (pattern not found)\n" "$label"
    return
  fi

  sed -i "s/${pattern}/${replacement}/" "$TARGET"

  after=$(grep -m1 "$(echo "$replacement" | head -c 20)" "$TARGET" 2>/dev/null || true)

  if [ "$before" != "$after" ]; then
    printf "  UPD  %-25s\n" "$label"
    printf "       - %s\n" "$before"
    printf "       + %s\n" "$after"
    changes=$((changes + 1))
  else
    printf "  OK   %-25s  (already correct)\n" "$label"
  fi
}

# API tests: "1,300 API tests" → "1,302 API tests"
update_pattern "API tests" \
  "[0-9][0-9,]* API tests" \
  "${api_fmt} API tests"

# Mobile tests: "331 mobile tests" → "315 mobile tests"
update_pattern "Mobile tests" \
  "[0-9][0-9,]* mobile tests" \
  "${mobile_fmt} mobile tests"

# Integration suites: "3 integration test suites" → "8 integration test suites"
update_pattern "Integration suites" \
  "[0-9][0-9,]* integration test suites" \
  "${integration} integration test suites"

# Route groups: "All 20 route groups" → "All 21 route groups"
update_pattern "Route groups" \
  "All [0-9][0-9,]* route groups" \
  "All ${routes} route groups"

# Mobile suites: "(41 test suites)" → "(41 test suites)"
update_pattern "Mobile suites" \
  "([0-9][0-9,]* test suites)" \
  "(${suites} test suites)"

# Inngest function count: "8 Inngest functions" → "9 Inngest functions"
# Only update the line with a number (not "Inngest functions orchestrate steps")
update_pattern "Inngest functions" \
  "[0-9][0-9,]* Inngest functions" \
  "${inngest} Inngest functions"

echo ""
echo "==========================="
if [ "$changes" -gt 0 ]; then
  echo "$changes count(s) updated in CLAUDE.md"
else
  echo "CLAUDE.md already up to date — no changes made."
fi
