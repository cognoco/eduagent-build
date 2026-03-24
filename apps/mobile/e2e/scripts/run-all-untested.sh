#!/usr/bin/env bash
# Run all untested E2E flows sequentially.
# Captures pass/fail per flow, continues on failure.
#
# Usage: cd apps/mobile/e2e && ./scripts/run-all-untested.sh
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
MAESTRO="${MAESTRO_PATH:-/c/tools/maestro/bin/maestro}"

export TEMP="${TEMP:-C:\\tools\\tmp}"
export TMP="${TMP:-C:\\tools\\tmp}"

RESULTS_FILE="$E2E_DIR/scripts/run-results-$(date +%Y%m%d-%H%M%S).txt"
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
TOTAL=0

log_result() {
  local status="$1"
  local flow="$2"
  local note="${3:-}"
  echo "[$status] $flow $note" | tee -a "$RESULTS_FILE"
  if [ "$status" = "PASS" ]; then ((PASS_COUNT++)); fi
  if [ "$status" = "FAIL" ]; then ((FAIL_COUNT++)); fi
  if [ "$status" = "SKIP" ]; then ((SKIP_COUNT++)); fi
  ((TOTAL++))
}

run_seeded() {
  local scenario="$1"
  local flow="$2"
  echo ""
  echo "=========================================="
  echo "[$((TOTAL+1))] SEEDED: $scenario → $flow"
  echo "=========================================="
  if $SEED_SCRIPT "$scenario" "$flow"; then
    log_result "PASS" "$flow"
  else
    log_result "FAIL" "$flow" "(scenario: $scenario)"
  fi
}

run_standalone() {
  local flow="$1"
  echo ""
  echo "=========================================="
  echo "[$((TOTAL+1))] STANDALONE: $flow"
  echo "=========================================="
  if $MAESTRO test "$flow"; then
    log_result "PASS" "$flow"
  else
    log_result "FAIL" "$flow" "(standalone)"
  fi
}

echo "E2E Batch Run — $(date)" | tee "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

# ─── GROUP 1: Seed-dependent flows (via seed-and-run.sh) ───
# These use runFlow: seed-and-sign-in.yaml internally

# Account flows (onboarding-complete)
run_seeded "onboarding-complete" "flows/account/more-tab-navigation.yaml"
run_seeded "onboarding-complete" "flows/account/settings-toggles.yaml"
run_seeded "onboarding-complete" "flows/account/account-lifecycle.yaml"
run_seeded "onboarding-complete" "flows/account/delete-account.yaml"
run_seeded "parent-with-children" "flows/account/profile-switching.yaml"

# Onboarding flows
run_seeded "onboarding-complete" "flows/onboarding/create-profile-standalone.yaml"
run_seeded "onboarding-complete" "flows/onboarding/analogy-preference-flow.yaml"
run_seeded "onboarding-complete" "flows/onboarding/curriculum-review-flow.yaml"
run_seeded "onboarding-complete" "flows/onboarding/create-subject.yaml"
run_seeded "learning-active"     "flows/onboarding/view-curriculum.yaml"

# Billing flows
run_seeded "trial-active"        "flows/billing/subscription.yaml"
run_seeded "trial-active"        "flows/billing/subscription-details.yaml"
run_seeded "trial-expired-child" "flows/billing/child-paywall.yaml"

# Learning flows
run_seeded "learning-active" "flows/learning/core-learning.yaml"
run_seeded "learning-active" "flows/learning/first-session.yaml"
run_seeded "learning-active" "flows/learning/freeform-session.yaml"
run_seeded "learning-active" "flows/learning/session-summary.yaml"
run_seeded "learning-active" "flows/learning/start-session.yaml"

# Assessment
run_seeded "onboarding-complete" "flows/assessment/assessment-cycle.yaml"

# Retention flows
run_seeded "retention-due"    "flows/retention/topic-detail.yaml"
run_seeded "retention-due"    "flows/retention/learning-book.yaml"
run_seeded "retention-due"    "flows/retention/retention-review.yaml"
run_seeded "retention-due"    "flows/retention/recall-review.yaml"
run_seeded "failed-recall-3x" "flows/retention/failed-recall.yaml"
run_seeded "failed-recall-3x" "flows/retention/relearn-flow.yaml"

# Parent flows
run_seeded "parent-with-children" "flows/parent/parent-tabs.yaml"
run_seeded "parent-with-children" "flows/parent/parent-dashboard.yaml"
run_seeded "parent-with-children" "flows/parent/parent-learning-book.yaml"
run_seeded "parent-with-children" "flows/parent/child-drill-down.yaml"
run_seeded "parent-with-children" "flows/parent/consent-management.yaml"
run_seeded "parent-solo"          "flows/parent/demo-dashboard.yaml"

# Subject flows
run_seeded "multi-subject" "flows/subjects/multi-subject.yaml"

# Edge case flows
run_seeded "onboarding-no-subject" "flows/edge/empty-first-user.yaml"

# Consent flows (seeded, but DON'T use seed-and-sign-in.yaml — custom sign-in)
run_seeded "consent-withdrawn"   "flows/consent/consent-withdrawn-gate.yaml"
run_seeded "onboarding-complete" "flows/consent/post-approval-landing.yaml"

# ─── GROUP 2: Standalone flows (no seed, fresh sign-up via Clerk) ───
# These do fresh sign-ups — they need a working Clerk instance

run_standalone "flows/onboarding/sign-up-flow.yaml"
run_standalone "flows/consent/coppa-flow.yaml"
run_standalone "flows/consent/profile-creation-consent.yaml"
run_standalone "flows/consent/consent-pending-gate.yaml"

# ─── GROUP 3: Skipped flows ───
log_result "SKIP" "flows/app-launch-expogo.yaml" "(Expo Go — wrong app type for dev-client)"
log_result "SKIP" "flows/homework/camera-ocr.yaml" "(emulator has no camera)"

# ─── SUMMARY ───
echo ""
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "BATCH RUN COMPLETE — $(date)" | tee -a "$RESULTS_FILE"
echo "  PASS: $PASS_COUNT" | tee -a "$RESULTS_FILE"
echo "  FAIL: $FAIL_COUNT" | tee -a "$RESULTS_FILE"
echo "  SKIP: $SKIP_COUNT" | tee -a "$RESULTS_FILE"
echo "  TOTAL: $TOTAL" | tee -a "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "Results saved to: $RESULTS_FILE"
