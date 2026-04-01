#!/usr/bin/env bash
# Regression batch 2 — re-run flows that failed due to emulator crash + real failures
set -uo pipefail

# shellcheck source=e2e-lib.sh
source "$(dirname "$0")/e2e-lib.sh"

RESULTS_FILE="$E2E_DIR/scripts/regression-batch2-$(date +%Y%m%d-%H%M%S).txt"

echo "E2E Regression Batch 2 — $(date)" | tee "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"

# ─── RE-RUN: Real failures from batch 1 (investigate) ───
run_seeded "onboarding-complete" "flows/account/more-tab-navigation.yaml"
run_seeded "onboarding-complete" "flows/account/settings-toggles.yaml"
run_seeded "parent-with-children" "flows/account/profile-switching.yaml"
run_seeded "onboarding-complete" "flows/onboarding/create-subject.yaml"
run_seeded "trial-expired-child" "flows/billing/child-paywall.yaml"
run_seeded "learning-active" "flows/learning/session-summary.yaml"

# ─── RE-RUN: Emulator crash victims (all retention, parent, homework, etc.) ───
run_seeded "retention-due"    "flows/retention/topic-detail.yaml"
run_seeded "retention-due"    "flows/retention/learning-book.yaml"
run_seeded "retention-due"    "flows/retention/retention-review.yaml"
run_seeded "retention-due"    "flows/retention/recall-review.yaml"
run_seeded "failed-recall-3x" "flows/retention/failed-recall.yaml"
run_seeded "failed-recall-3x" "flows/retention/relearn-flow.yaml"

run_seeded "parent-with-children" "flows/parent/parent-tabs.yaml"
run_seeded "parent-with-children" "flows/parent/parent-dashboard.yaml"
run_seeded "parent-with-children" "flows/parent/parent-learning-book.yaml"
run_seeded "parent-with-children" "flows/parent/child-drill-down.yaml"
run_seeded "parent-with-children" "flows/parent/consent-management.yaml"
run_seeded "parent-solo"          "flows/parent/demo-dashboard.yaml"

run_seeded "homework-ready"   "flows/homework/homework-flow.yaml"
run_seeded "learning-active"  "flows/homework/homework-from-entry-card.yaml"
run_seeded "homework-ready"   "flows/homework/camera-ocr.yaml"

run_seeded "multi-subject" "flows/subjects/multi-subject.yaml"
run_seeded "onboarding-no-subject" "flows/edge/empty-first-user.yaml"

run_seeded "consent-withdrawn-solo" "flows/consent/consent-withdrawn-gate.yaml"
run_seeded "onboarding-complete"    "flows/consent/post-approval-landing.yaml"
run_seeded "consent-pending"        "flows/consent/consent-pending-gate.yaml"
run_seeded "pre-profile"            "flows/consent/coppa-flow.yaml"
run_seeded "pre-profile"            "flows/consent/profile-creation-consent.yaml"

log_result "SKIP" "flows/onboarding/sign-up-flow.yaml" "(manual-only: requires Clerk email verification)"

echo ""
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "BATCH 2 COMPLETE — $(date)" | tee -a "$RESULTS_FILE"
echo "  PASS: $PASS_COUNT / FAIL: $FAIL_COUNT / TOTAL: $TOTAL" | tee -a "$RESULTS_FILE"
echo "Results: $RESULTS_FILE"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
