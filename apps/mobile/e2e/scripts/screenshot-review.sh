#!/usr/bin/env bash
# Screenshot Review — Visual QA checklist generator
# Collects all Maestro screenshots from the e2e directory and generates
# a structured markdown review checklist for manual visual inspection.
#
# Usage: ./scripts/screenshot-review.sh [output-file]
# Default output: scripts/screenshot-review-YYYYMMDD-HHMMSS.md
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
E2E_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT="${1:-$SCRIPT_DIR/screenshot-review-$TIMESTAMP.md}"

cd "$E2E_DIR"

# Collect all PNG screenshots (compatible with Git Bash — no -printf)
mapfile -t SCREENSHOTS < <(ls -1 *.png 2>/dev/null | sort)

if [ ${#SCREENSHOTS[@]} -eq 0 ]; then
  echo "No screenshots found in $E2E_DIR"
  exit 1
fi

echo "Found ${#SCREENSHOTS[@]} screenshots. Generating review: $OUTPUT"

# Classify a screenshot filename into a group
classify() {
  local base="${1%.png}"
  case "$base" in
    signin-*)          echo "01-Auth" ;;
    auth-nav-*)        echo "01-Auth" ;;
    sign-*)            echo "01-Auth" ;;
    onboarding-*)      echo "02-Onboarding" ;;
    analogy-*)         echo "02-Onboarding" ;;
    subject-*)         echo "03-Subjects" ;;
    multi-subject-*)   echo "03-Subjects" ;;
    view-curriculum-*) echo "04-Curriculum" ;;
    curriculum-*)      echo "04-Curriculum" ;;
    core-learning-*)   echo "05-Learning" ;;
    first-session-*)   echo "05-Learning" ;;
    freeform-*)        echo "05-Learning" ;;
    learning-*)        echo "05-Learning" ;;
    session-*)         echo "05-Learning" ;;
    homework-*)        echo "06-Homework" ;;
    camera-ocr-*)      echo "06-Homework" ;;
    retention-*)       echo "07-Retention" ;;
    relearn-*)         echo "07-Retention" ;;
    failed-recall-*)   echo "07-Retention" ;;
    topic-detail-*)    echo "07-Retention" ;;
    assessment-*)      echo "08-Assessment" ;;
    parent-*)          echo "09-Parent" ;;
    demo-*)            echo "09-Parent" ;;
    consent-*)         echo "10-Consent" ;;
    coppa-*)           echo "10-Consent" ;;
    child-paywall-*)   echo "11-Billing" ;;
    subscription-*)    echo "11-Billing" ;;
    more-tab-*)        echo "12-Account" ;;
    nav-*)             echo "12-Account" ;;
    settings-*)        echo "12-Account" ;;
    profile-*)         echo "12-Account" ;;
    delete-*)          echo "12-Account" ;;
    account-*)         echo "12-Account" ;;
    empty-first-*)     echo "13-Edge" ;;
    debug-*)           echo "14-Debug" ;;
    *)                 echo "99-Other" ;;
  esac
}

# Build grouped output using temp files (avoids bash associative arrays
# which are not available in Git Bash / MSYS2 bash 4.x)
TMPDIR_GROUPS="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_GROUPS"' EXIT

for ss in "${SCREENSHOTS[@]}"; do
  group="$(classify "$ss")"
  echo "$ss" >> "$TMPDIR_GROUPS/$group"
done

# Write header
cat > "$OUTPUT" <<EOF
# E2E Screenshot Visual Review

**Generated:** $(date '+%Y-%m-%d %H:%M')
**Screenshots:** ${#SCREENSHOTS[@]}
**Reviewer:** _______________
**Verdict:** [ ] PASS / [ ] FAIL

---

## Checklist — Apply to Every Screenshot

For each screenshot below, verify:

- [ ] **Text readability** — All text fully rendered, no clipping or overflow
- [ ] **Tab bar** — All 3 tabs visible with icons (Home, Learning Book, More)
- [ ] **Keyboard avoidance** — If keyboard is open, input field is visible above it
- [ ] **Counter consistency** — Any displayed numbers match visible content
- [ ] **Theme consistency** — Colors match the active persona theme
- [ ] **Safe area** — Content not obscured by status bar or navigation bar
- [ ] **Touch targets** — Buttons/links have adequate size (min 44x44dp)

---

## Screenshots

EOF

# Output each group sorted by group name
GROUP_COUNT=0
for groupfile in $(ls "$TMPDIR_GROUPS/" | sort); do
  # Strip numeric prefix for display: "01-Auth" → "Auth"
  display_group="${groupfile#*-}"
  echo "### $display_group" >> "$OUTPUT"
  echo "" >> "$OUTPUT"

  while IFS= read -r ss; do
    base="${ss%.png}"
    display=$(echo "$base" | sed 's/-/ /g')
    echo "- [ ] **$display** — \`$ss\`" >> "$OUTPUT"
  done < "$TMPDIR_GROUPS/$groupfile"

  echo "" >> "$OUTPUT"
  ((GROUP_COUNT++))
done

# Add summary footer
cat >> "$OUTPUT" <<'FOOTER'
---

## Visual Bug Report

If any issues are found, log them here:

| Screenshot | Issue Type | Description | Severity |
|-----------|-----------|-------------|----------|
| | | | |

### Issue Types
- **TEXT_OVERFLOW** — Text clipped, truncated without ellipsis, or bleeding outside container
- **COUNTER_MISMATCH** — Displayed number doesn't match visible items
- **KEYBOARD_COVER** — Input field or button hidden behind keyboard
- **THEME_BREAK** — Wrong colors, missing dark/light mode support
- **LAYOUT_SHIFT** — Elements overlapping, misaligned, or shifted unexpectedly
- **SAFE_AREA** — Content under status bar, notch, or home indicator
- **ICON_MISSING** — Tab icon, button icon, or emoji not rendered
- **EMPTY_STATE** — Screen shows placeholder/loading when data should be present
FOOTER

echo "Review generated: $OUTPUT"
echo "Screenshots: ${#SCREENSHOTS[@]} across $GROUP_COUNT groups"
