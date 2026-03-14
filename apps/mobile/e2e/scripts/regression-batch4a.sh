#!/usr/bin/env bash
# Regression batch 4a — first 12 flows from the failure list
set -uo pipefail

# shellcheck source=e2e-lib.sh
source "$(dirname "$0")/e2e-lib.sh"

RESULTS_FILE="$E2E_DIR/scripts/regression-batch4a-$(date +%Y%m%d-%H%M%S).txt"

echo "E2E Regression Batch 4a — $(date)" | tee "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"

# Account (batch 1 failures — re-test)
run_seeded "onboarding-complete" "flows/account/more-tab-navigation.yaml"
run_seeded "onboarding-complete" "flows/account/settings-toggles.yaml"
run_seeded "parent-with-children" "flows/account/profile-switching.yaml"

# Onboarding (batch 1 failures + fixes)
run_seeded "onboarding-complete" "flows/onboarding/create-subject.yaml"
run_seeded "onboarding-complete" "flows/onboarding/analogy-preference-flow.yaml"
run_seeded "onboarding-complete" "flows/onboarding/curriculum-review-flow.yaml"

# Billing (batch 1 failures)
run_seeded "trial-expired-child" "flows/billing/child-paywall.yaml"

# Learning (batch 1 failure)
run_seeded "learning-active" "flows/learning/session-summary.yaml"

# Retention (emulator crash victims)
run_seeded "retention-due"    "flows/retention/topic-detail.yaml"
run_seeded "retention-due"    "flows/retention/learning-book.yaml"
run_seeded "retention-due"    "flows/retention/retention-review.yaml"
run_seeded "retention-due"    "flows/retention/recall-review.yaml"

echo ""
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "BATCH 4a COMPLETE — $(date)" | tee -a "$RESULTS_FILE"
echo "  PASS: $PASS_COUNT / FAIL: $FAIL_COUNT / TOTAL: $TOTAL" | tee -a "$RESULTS_FILE"
echo "Results: $RESULTS_FILE"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
