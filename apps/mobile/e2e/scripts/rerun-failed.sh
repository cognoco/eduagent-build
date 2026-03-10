#!/usr/bin/env bash
# Re-run only the flows that failed in the first batch.
# Skips launch failures and only re-runs flows with YAML fixes applied.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
E2E_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$E2E_DIR"

SEED_SCRIPT="./scripts/seed-and-run.sh"
MAESTRO="${MAESTRO_PATH:-/c/tools/maestro/bin/maestro}"
export TEMP="${TEMP:-C:\\tools\\tmp}"
export TMP="${TMP:-C:\\tools\\tmp}"

RESULTS_FILE="$E2E_DIR/scripts/rerun-results-$(date +%Y%m%d-%H%M%S).txt"
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
  if $SEED_SCRIPT "$sc" "$fl"; then log "PASS" "$fl"
  else log "FAIL" "$fl" "(scenario: $sc)"; fi
}

run_m() {
  local fl="$1"
  echo -e "\n=== [$((TOTAL+1))] STANDALONE: $fl ==="
  if $MAESTRO test "$fl"; then log "PASS" "$fl"
  else log "FAIL" "$fl" "(standalone)"; fi
}

echo "E2E Re-run — $(date)" | tee "$RESULTS_FILE"

# ── ALL 36 previously failed flows (including launch failures to re-test) ──

# Account
run_s "onboarding-complete" "flows/account/more-tab-navigation.yaml"
run_s "onboarding-complete" "flows/account/settings-toggles.yaml"
run_s "parent-with-children" "flows/account/profile-switching.yaml"

# Onboarding
run_s "onboarding-complete" "flows/onboarding/create-profile-standalone.yaml"
run_s "onboarding-complete" "flows/onboarding/analogy-preference-flow.yaml"
run_s "onboarding-complete" "flows/onboarding/curriculum-review-flow.yaml"
run_s "onboarding-complete" "flows/onboarding/create-subject.yaml"
run_s "learning-active"     "flows/onboarding/view-curriculum.yaml"

# Billing
run_s "trial-active"        "flows/billing/subscription.yaml"
run_s "trial-active"        "flows/billing/subscription-details.yaml"
run_s "trial-expired-child" "flows/billing/child-paywall.yaml"

# Learning
run_s "learning-active" "flows/learning/core-learning.yaml"
run_s "learning-active" "flows/learning/first-session.yaml"
run_s "learning-active" "flows/learning/freeform-session.yaml"
run_s "learning-active" "flows/learning/session-summary.yaml"
run_s "learning-active" "flows/learning/start-session.yaml"

# Assessment
run_s "onboarding-complete" "flows/assessment/assessment-cycle.yaml"

# Retention
run_s "retention-due"    "flows/retention/topic-detail.yaml"
run_s "retention-due"    "flows/retention/learning-book.yaml"
run_s "retention-due"    "flows/retention/retention-review.yaml"
run_s "retention-due"    "flows/retention/recall-review.yaml"
run_s "failed-recall-3x" "flows/retention/failed-recall.yaml"
run_s "failed-recall-3x" "flows/retention/relearn-flow.yaml"

# Parent (all with switch-to-parent fix)
run_s "parent-with-children" "flows/parent/parent-learning-book.yaml"
run_s "parent-with-children" "flows/parent/child-drill-down.yaml"
run_s "parent-with-children" "flows/parent/consent-management.yaml"
run_s "parent-solo"          "flows/parent/demo-dashboard.yaml"

# Subjects
run_s "multi-subject" "flows/subjects/multi-subject.yaml"

# Edge
run_s "onboarding-complete" "flows/edge/empty-first-user.yaml"

# Consent
run_s "consent-withdrawn"   "flows/consent/consent-withdrawn-gate.yaml"
run_s "onboarding-complete" "flows/consent/post-approval-landing.yaml"

# Standalone
run_m "flows/onboarding/sign-up-flow.yaml"
run_m "flows/consent/coppa-flow.yaml"
run_m "flows/consent/profile-creation-consent.yaml"
run_m "flows/consent/consent-pending-gate.yaml"

echo -e "\n=========================================="
echo "RE-RUN COMPLETE — $(date)" | tee -a "$RESULTS_FILE"
echo "  PASS: $PASS / FAIL: $FAIL / TOTAL: $TOTAL" | tee -a "$RESULTS_FILE"
echo "Results: $RESULTS_FILE"
