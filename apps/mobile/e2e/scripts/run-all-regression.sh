#!/usr/bin/env bash
# Run ALL E2E flows for regression testing.
# Updated 2026-03-14 to use shared e2e-lib.sh and configurable FAST mode.
#
# Usage: cd apps/mobile/e2e && ./scripts/run-all-regression.sh
#        FAST=0 ./scripts/run-all-regression.sh   # disable FAST for cold emulator
#
# Prerequisites:
#   - API server running at localhost:8787
#   - Android emulator running with dev-client APK
#   - Metro bundler + bundle proxy running
#   - ADB reverse ports set up (8081, 8082, 8787)

set -uo pipefail

# shellcheck source=e2e-lib.sh
source "$(dirname "$0")/e2e-lib.sh"

RESULTS_FILE="$E2E_DIR/scripts/regression-results-$(date +%Y%m%d-%H%M%S).txt"

echo "E2E Full Regression Run — $(date)" | tee "$RESULTS_FILE"
echo "Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')" | tee -a "$RESULTS_FILE"
echo "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" | tee -a "$RESULTS_FILE"
echo "FAST=$FAST" | tee -a "$RESULTS_FILE"
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
run_seeded "learning-active" "flows/learning/voice-mode-controls.yaml"

# ─── GROUP 5: Assessment ───
run_seeded "onboarding-complete" "flows/assessment/assessment-cycle.yaml"

# ─── GROUP 6: Retention flows ───
run_seeded "retention-due"    "flows/retention/topic-detail.yaml"
run_seeded "retention-due"    "flows/retention/library.yaml"
run_seeded "retention-due"    "flows/retention/retention-review.yaml"
run_seeded "retention-due"    "flows/retention/recall-review.yaml"
run_seeded "failed-recall-3x" "flows/retention/failed-recall.yaml"
run_seeded "failed-recall-3x" "flows/retention/relearn-flow.yaml"

# ─── GROUP 7: Parent flows ───
run_seeded "parent-with-children" "flows/parent/parent-tabs.yaml"
run_seeded "parent-with-children" "flows/parent/parent-dashboard.yaml"
run_seeded "parent-with-children" "flows/parent/parent-library.yaml"
run_seeded "parent-with-children" "flows/parent/child-drill-down.yaml"
run_seeded "parent-with-children" "flows/parent/consent-management.yaml"
run_seeded "parent-multi-child"  "flows/parent/multi-child-dashboard.yaml"
run_seeded "parent-with-children" "flows/parent/add-child-profile.yaml"

# ─── GROUP 8: Homework flows ───
run_seeded "homework-ready"   "flows/homework/homework-flow.yaml"
run_seeded "learning-active"  "flows/homework/homework-from-entry-card.yaml"
run_seeded "homework-ready"   "flows/homework/camera-ocr.yaml"

# ─── GROUP 9: Subject flows ───
run_seeded "multi-subject" "flows/subjects/multi-subject.yaml"

# ─── GROUP 10: Edge case flows ───
run_seeded "onboarding-no-subject" "flows/edge/empty-first-user.yaml"
run_seeded "learning-active"       "flows/edge/streak-display.yaml"

# ─── GROUP 11: Consent flows (updated per Sessions 15-18, 22) ───
run_seeded "consent-withdrawn-solo" "flows/consent/consent-withdrawn-gate.yaml"
run_seeded "onboarding-complete"    "flows/consent/post-approval-landing.yaml"
run_seeded "consent-pending"        "flows/consent/consent-pending-gate.yaml"
run_seeded "pre-profile"            "flows/consent/consent-coppa-under13.yaml"
run_seeded "pre-profile"            "flows/consent/consent-gdpr-under16.yaml"
run_seeded "pre-profile"            "flows/consent/consent-above-threshold.yaml"
run_seeded "pre-profile"            "flows/consent/hand-to-parent-consent.yaml"

# ─── GROUP 14: Parent audit flows (Epic 10) ───
run_seeded "parent-with-children" "flows/parent/subject-raw-input-audit.yaml"
run_seeded "parent-with-children" "flows/parent/guided-label-tooltip.yaml"

# ─── GROUP 12: Sign-up flow (manual only — Clerk email verification) ───
log_result "SKIP" "flows/onboarding/sign-up-flow.yaml" "(manual-only: requires Clerk email verification)"

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

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
