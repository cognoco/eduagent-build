#!/usr/bin/env bash
# Regression batch 2 — re-run flows that failed due to emulator crash + real failures
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
E2E_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$E2E_DIR"

SEED_SCRIPT="./scripts/seed-and-run.sh"
export TEMP="${TEMP:-C:\\tools\\tmp}"
export TMP="${TMP:-C:\\tools\\tmp}"

RESULTS_FILE="$E2E_DIR/scripts/regression-batch2-$(date +%Y%m%d-%H%M%S).txt"
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

run_ns() {
  local fl="$1"
  echo -e "\n=== [$((TOTAL+1))] NO-SEED: $fl ==="
  if FAST=1 $SEED_SCRIPT --no-seed "$fl"; then log "PASS" "$fl"
  else log "FAIL" "$fl" "(no-seed)"; fi
}

echo "E2E Regression Batch 2 — $(date)" | tee "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"

# ─── RE-RUN: Real failures from batch 1 (investigate) ───
run_s "onboarding-complete" "flows/account/more-tab-navigation.yaml"
run_s "onboarding-complete" "flows/account/settings-toggles.yaml"
run_s "parent-with-children" "flows/account/profile-switching.yaml"
run_s "onboarding-complete" "flows/onboarding/create-subject.yaml"
run_s "trial-expired-child" "flows/billing/child-paywall.yaml"
run_s "learning-active" "flows/learning/session-summary.yaml"

# ─── RE-RUN: Emulator crash victims (all retention, parent, homework, etc.) ───
run_s "retention-due"    "flows/retention/topic-detail.yaml"
run_s "retention-due"    "flows/retention/learning-book.yaml"
run_s "retention-due"    "flows/retention/retention-review.yaml"
run_s "retention-due"    "flows/retention/recall-review.yaml"
run_s "failed-recall-3x" "flows/retention/failed-recall.yaml"
run_s "failed-recall-3x" "flows/retention/relearn-flow.yaml"

run_s "parent-with-children" "flows/parent/parent-tabs.yaml"
run_s "parent-with-children" "flows/parent/parent-dashboard.yaml"
run_s "parent-with-children" "flows/parent/parent-learning-book.yaml"
run_s "parent-with-children" "flows/parent/child-drill-down.yaml"
run_s "parent-with-children" "flows/parent/consent-management.yaml"
run_s "parent-solo"          "flows/parent/demo-dashboard.yaml"

run_s "homework-ready"   "flows/homework/homework-flow.yaml"
run_s "learning-active"  "flows/homework/homework-from-entry-card.yaml"
run_s "homework-ready"   "flows/homework/camera-ocr.yaml"

run_s "multi-subject" "flows/subjects/multi-subject.yaml"
run_s "onboarding-no-subject" "flows/edge/empty-first-user.yaml"

run_s "consent-withdrawn-solo" "flows/consent/consent-withdrawn-gate.yaml"
run_s "onboarding-complete"    "flows/consent/post-approval-landing.yaml"
run_s "consent-pending"        "flows/consent/consent-pending-gate.yaml"
run_s "pre-profile"            "flows/consent/coppa-flow.yaml"
run_s "pre-profile"            "flows/consent/profile-creation-consent.yaml"

run_ns "flows/onboarding/sign-up-flow.yaml"

echo -e "\n=========================================="
echo "BATCH 2 COMPLETE — $(date)" | tee -a "$RESULTS_FILE"
echo "  PASS: $PASS / FAIL: $FAIL / TOTAL: $TOTAL" | tee -a "$RESULTS_FILE"
echo "Results: $RESULTS_FILE"
