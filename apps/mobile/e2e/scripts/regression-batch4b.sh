#!/usr/bin/env bash
# Regression batch 4b — remaining 19 flows not covered by batch 1 or 4a
set -uo pipefail

# shellcheck source=e2e-lib.sh
source "$(dirname "$0")/e2e-lib.sh"

RESULTS_FILE="$E2E_DIR/scripts/regression-batch4b-$(date +%Y%m%d-%H%M%S).txt"

echo "E2E Regression Batch 4b — $(date)" | tee "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"

# Retention (failed-recall scenarios)
run_seeded "failed-recall-3x" "flows/retention/failed-recall.yaml"
run_seeded "failed-recall-3x" "flows/retention/relearn-flow.yaml"

# Parent flows
run_seeded "parent-with-children" "flows/parent/parent-tabs.yaml"
run_seeded "parent-with-children" "flows/parent/parent-dashboard.yaml"
run_seeded "parent-with-children" "flows/parent/parent-learning-book.yaml"
run_seeded "parent-with-children" "flows/parent/child-drill-down.yaml"
run_seeded "parent-with-children" "flows/parent/consent-management.yaml"
run_seeded "parent-solo"          "flows/parent/demo-dashboard.yaml"

# Homework flows
run_seeded "homework-ready"   "flows/homework/homework-flow.yaml"
run_seeded "learning-active"  "flows/homework/homework-from-entry-card.yaml"
run_seeded "homework-ready"   "flows/homework/camera-ocr.yaml"

# Subjects + Edge
run_seeded "multi-subject" "flows/subjects/multi-subject.yaml"
run_seeded "onboarding-no-subject" "flows/edge/empty-first-user.yaml"

# Consent flows
run_seeded "consent-withdrawn-solo" "flows/consent/consent-withdrawn-gate.yaml"
run_seeded "onboarding-complete"    "flows/consent/post-approval-landing.yaml"
run_seeded "consent-pending"        "flows/consent/consent-pending-gate.yaml"
run_seeded "pre-profile"            "flows/consent/coppa-flow.yaml"
run_seeded "pre-profile"            "flows/consent/profile-creation-consent.yaml"

# Sign-up (no seed — partial by design)
run_noseed "flows/onboarding/sign-up-flow.yaml"

echo ""
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "BATCH 4b COMPLETE — $(date)" | tee -a "$RESULTS_FILE"
echo "  PASS: $PASS_COUNT / FAIL: $FAIL_COUNT / TOTAL: $TOTAL" | tee -a "$RESULTS_FILE"
echo "Results: $RESULTS_FILE"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
