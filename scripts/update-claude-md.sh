#!/usr/bin/env bash
# update-claude-md.sh — Update quantitative counts in CLAUDE.md from actual codebase state
#
# Updates the Snapshot block (lines 5-7) plus the "Counts verified YYYY-MM-DD" line.
# Patterns are line-anchored so the same number that appears twice in the file
# (e.g. "43 route groups" and a different "43" elsewhere) cannot collide.
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

today=$(date -u +%Y-%m-%d)

changes=0

# Helper: line-anchored sed replacement. Scopes substitution to lines matching
# $anchor, so the same numeric pattern elsewhere in the file is untouched.
update_line() {
  local label="$1" anchor="$2" pattern="$3" replacement="$4"
  local before after

  before=$(grep -m1 -- "$anchor" "$TARGET" 2>/dev/null || true)
  if [ -z "$before" ]; then
    printf "  SKIP %-25s  (anchor not found: %s)\n" "$label" "$anchor"
    return
  fi

  if ! echo "$before" | grep -qE -- "$pattern"; then
    printf "  SKIP %-25s  (pattern not found on anchor line)\n" "$label"
    return
  fi

  # `/anchor/ s/pat/repl/` — anchor scopes the substitution
  sed -i "/$anchor/ s/$pattern/$replacement/" "$TARGET"

  after=$(grep -m1 -- "$anchor" "$TARGET" 2>/dev/null || true)

  if [ "$before" != "$after" ]; then
    printf "  UPD  %-25s\n" "$label"
    printf "       - %s\n" "$before"
    printf "       + %s\n" "$after"
    changes=$((changes + 1))
  else
    printf "  OK   %-25s  (already correct)\n" "$label"
  fi
}

# Mobile line: "- Mobile: ~80 screens, 240 test suites, ~2,390 tests"
update_line "Mobile suites" \
  "^- Mobile:" \
  "[0-9][0-9,]* test suites" \
  "${suites} test suites"

update_line "Mobile tests" \
  "^- Mobile:" \
  "~[0-9][0-9,]* tests$" \
  "~${mobile_fmt} tests"

# API line: "- API: 43 route groups, 187 test suites, ~3,470 tests, 45 Inngest functions"
update_line "Route groups" \
  "^- API:" \
  "[0-9][0-9,]* route groups" \
  "${routes} route groups"

# API tests use the "~N tests," shape (trailing comma distinguishes from "test suites")
update_line "API tests" \
  "^- API:" \
  "~[0-9][0-9,]* tests," \
  "~${api_fmt} tests,"

update_line "Inngest functions" \
  "^- API:" \
  "[0-9][0-9,]* Inngest functions" \
  "${inngest} Inngest functions"

# Cross-package integration line: "- Cross-package integration tests: 42 suites in `tests/integration/`, ~290 cases"
update_line "Integration suites" \
  "^- Cross-package integration tests:" \
  "[0-9][0-9,]* suites" \
  "${integration} suites"

# "> Counts verified YYYY-MM-DD." — refresh date so reviewers see when the
# counts were last re-snapshot.
update_line "Verified date" \
  "^> Counts verified " \
  "Counts verified 20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]" \
  "Counts verified ${today}"

echo ""
echo "==========================="
if [ "$changes" -gt 0 ]; then
  echo "$changes count(s) updated in CLAUDE.md"
else
  echo "CLAUDE.md already up to date — no changes made."
fi
