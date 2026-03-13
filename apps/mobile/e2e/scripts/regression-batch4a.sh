#!/usr/bin/env bash
# Regression batch 4a — first 12 flows from the failure list
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
E2E_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$E2E_DIR"

SEED_SCRIPT="./scripts/seed-and-run.sh"
export TEMP="${TEMP:-C:\\tools\\tmp}"
export TMP="${TMP:-C:\\tools\\tmp}"

RESULTS_FILE="$E2E_DIR/scripts/regression-batch4a-$(date +%Y%m%d-%H%M%S).txt"
PASS=0 FAIL=0 TOTAL=0

log() {
  local s="$1" f="$2" n="${3:-}"
  echo "[$s] $f $n" | tee -a "$RESULTS_FILE"
  [ "$s" = "PASS" ] && ((PASS++))
  [ "$s" = "FAIL" ] && ((FAIL++))
  ((TOTAL++))
}

run_s() {
  local sc="$1" fl="$2"
  echo -e "\n=== [$((TOTAL+1))] $sc → $fl ==="
  if FAST=1 $SEED_SCRIPT "$sc" "$fl"; then log "PASS" "$fl"
  else log "FAIL" "$fl" "(scenario: $sc)"; fi
}

echo "E2E Regression Batch 4a — $(date)" | tee "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"

# Account (batch 1 failures — re-test)
run_s "onboarding-complete" "flows/account/more-tab-navigation.yaml"
run_s "onboarding-complete" "flows/account/settings-toggles.yaml"
run_s "parent-with-children" "flows/account/profile-switching.yaml"

# Onboarding (batch 1 failures + fixes)
run_s "onboarding-complete" "flows/onboarding/create-subject.yaml"
run_s "onboarding-complete" "flows/onboarding/analogy-preference-flow.yaml"
run_s "onboarding-complete" "flows/onboarding/curriculum-review-flow.yaml"

# Billing (batch 1 failures)
run_s "trial-expired-child" "flows/billing/child-paywall.yaml"

# Learning (batch 1 failure)
run_s "learning-active" "flows/learning/session-summary.yaml"

# Retention (emulator crash victims)
run_s "retention-due"    "flows/retention/topic-detail.yaml"
run_s "retention-due"    "flows/retention/learning-book.yaml"
run_s "retention-due"    "flows/retention/retention-review.yaml"
run_s "retention-due"    "flows/retention/recall-review.yaml"

echo -e "\n=========================================="
echo "BATCH 4a COMPLETE — $(date)" | tee -a "$RESULTS_FILE"
echo "  PASS: $PASS / FAIL: $FAIL / TOTAL: $TOTAL" | tee -a "$RESULTS_FILE"
echo "Results: $RESULTS_FILE"
