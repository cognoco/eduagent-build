#!/usr/bin/env bash
# Run ALL E2E flows for regression testing.
# Updated 2026-03-13 to reflect current seed scenario mappings from Sessions 15-18.
#
# Usage: cd apps/mobile/e2e && ./scripts/run-all-regression.sh
#
# Prerequisites:
#   - API server running at localhost:8787
#   - Android emulator running with dev-client APK
#   - Metro bundler + bundle proxy running
#   - ADB reverse ports set up (8081, 8082, 8787)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
E2E_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$E2E_DIR"

SEED_SCRIPT="./scripts/seed-and-run.sh"
NOSEED_SCRIPT="./scripts/run-without-seed.sh"
MAESTRO="${MAESTRO_PATH:-/c/tools/maestro/bin/maestro}"

export TEMP="${TEMP:-C:\\tools\\tmp}"
export TMP="${TMP:-C:\\tools\\tmp}"

RESULTS_FILE="$E2E_DIR/scripts/regression-results-$(date +%Y%m%d-%H%M%S).txt"
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
PARTIAL_COUNT=0
TOTAL=0

log_result() {
  local status="$1"
  local flow="$2"
  local note="${3:-}"
  echo "[$status] $flow $note" | tee -a "$RESULTS_FILE"
  case "$status" in
    PASS) ((PASS_COUNT++)) ;;
    FAIL) ((FAIL_COUNT++)) ;;
    SKIP) ((SKIP_COUNT++)) ;;
    PARTIAL) ((PARTIAL_COUNT++)) ;;
  esac
  ((TOTAL++))
}

run_seeded() {
  local scenario="$1"
  local flow="$2"
  echo ""
  echo "=========================================="
  echo "[$((TOTAL+1))] SEEDED: $scenario → $flow"
  echo "=========================================="
  if FAST=1 $SEED_SCRIPT "$scenario" "$flow"; then
    log_result "PASS" "$flow"
  else
    log_result "FAIL" "$flow" "(scenario: $scenario)"
  fi
}

run_noseed() {
  local flow="$1"
  echo ""
  echo "=========================================="
  echo "[$((TOTAL+1))] NO-SEED: $flow"
  echo "=========================================="
  if FAST=1 $SEED_SCRIPT --no-seed "$flow"; then
    log_result "PASS" "$flow"
  else
    log_result "FAIL" "$flow" "(no-seed)"
  fi
}

echo "E2E Full Regression Run — $(date)" | tee "$RESULTS_FILE"
echo "Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')" | tee -a "$RESULTS_FILE"
echo "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" | tee -a "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

# ─── GROUP 1: Account flows (onboarding-complete) ───
run_seeded "onboarding-complete" "flows/account/more-tab-navigation.yaml"
run_seeded "onboarding-complete" "flows/account/settings-toggles.yaml"
run_seeded "onboarding-complete" "flows/account/account-lifecycle.yaml"
run_seeded "onboarding-complete" "flows/account/delete-account.yaml"
run_seeded "parent-with-children" "flows/account/profile-switching.yaml"

# ─── GROUP 2: Onboarding flows ───
run_seeded "onboarding-complete" "flows/onboarding/create-profile-standalone.yaml"
run_seeded "onboarding-complete" "flows/onboarding/analogy-preference-flow.yaml"
run_seeded "onboarding-complete" "flows/onboarding/curriculum-review-flow.yaml"
run_seeded "onboarding-complete" "flows/onboarding/create-subject.yaml"
run_seeded "learning-active"     "flows/onboarding/view-curriculum.yaml"

# ─── GROUP 3: Billing flows ───
run_seeded "trial-active"        "flows/billing/subscription.yaml"
run_seeded "trial-active"        "flows/billing/subscription-details.yaml"
run_seeded "trial-expired-child" "flows/billing/child-paywall.yaml"

# ─── GROUP 4: Learning flows ───
run_seeded "learning-active" "flows/learning/core-learning.yaml"
run_seeded "learning-active" "flows/learning/first-session.yaml"
run_seeded "learning-active" "flows/learning/freeform-session.yaml"
run_seeded "learning-active" "flows/learning/session-summary.yaml"
run_seeded "learning-active" "flows/learning/start-session.yaml"

# ─── GROUP 5: Assessment ───
run_seeded "onboarding-complete" "flows/assessment/assessment-cycle.yaml"

# ─── GROUP 6: Retention flows ───
run_seeded "retention-due"    "flows/retention/topic-detail.yaml"
run_seeded "retention-due"    "flows/retention/learning-book.yaml"
run_seeded "retention-due"    "flows/retention/retention-review.yaml"
run_seeded "retention-due"    "flows/retention/recall-review.yaml"
run_seeded "failed-recall-3x" "flows/retention/failed-recall.yaml"
run_seeded "failed-recall-3x" "flows/retention/relearn-flow.yaml"

# ─── GROUP 7: Parent flows ───
run_seeded "parent-with-children" "flows/parent/parent-tabs.yaml"
run_seeded "parent-with-children" "flows/parent/parent-dashboard.yaml"
run_seeded "parent-with-children" "flows/parent/parent-learning-book.yaml"
run_seeded "parent-with-children" "flows/parent/child-drill-down.yaml"
run_seeded "parent-with-children" "flows/parent/consent-management.yaml"
run_seeded "parent-solo"          "flows/parent/demo-dashboard.yaml"

# ─── GROUP 8: Homework flows ───
run_seeded "homework-ready"   "flows/homework/homework-flow.yaml"
run_seeded "learning-active"  "flows/homework/homework-from-entry-card.yaml"
run_seeded "homework-ready"   "flows/homework/camera-ocr.yaml"

# ─── GROUP 9: Subject flows ───
run_seeded "multi-subject" "flows/subjects/multi-subject.yaml"

# ─── GROUP 10: Edge case flows ───
run_seeded "onboarding-no-subject" "flows/edge/empty-first-user.yaml"

# ─── GROUP 11: Consent flows (updated per Sessions 15-18) ───
run_seeded "consent-withdrawn-solo" "flows/consent/consent-withdrawn-gate.yaml"
run_seeded "onboarding-complete"    "flows/consent/post-approval-landing.yaml"
run_seeded "consent-pending"        "flows/consent/consent-pending-gate.yaml"
run_seeded "pre-profile"            "flows/consent/coppa-flow.yaml"
run_seeded "pre-profile"            "flows/consent/profile-creation-consent.yaml"

# ─── GROUP 12: Sign-up flow (PARTIAL by design — Clerk verification) ───
run_noseed "flows/onboarding/sign-up-flow.yaml"

# ─── GROUP 13: Skipped flows ───
log_result "SKIP" "flows/app-launch-expogo.yaml" "(Expo Go — wrong app type for dev-client)"

# ─── SUMMARY ───
echo ""
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "REGRESSION RUN COMPLETE — $(date)" | tee -a "$RESULTS_FILE"
echo "  PASS:    $PASS_COUNT" | tee -a "$RESULTS_FILE"
echo "  FAIL:    $FAIL_COUNT" | tee -a "$RESULTS_FILE"
echo "  PARTIAL: $PARTIAL_COUNT" | tee -a "$RESULTS_FILE"
echo "  SKIP:    $SKIP_COUNT" | tee -a "$RESULTS_FILE"
echo "  TOTAL:   $TOTAL" | tee -a "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "Results saved to: $RESULTS_FILE"
