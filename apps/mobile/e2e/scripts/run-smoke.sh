#!/usr/bin/env bash
# E2E Smoke Pack — 10 release-critical flows that must pass before any release.
#
# Usage:
#   cd apps/mobile/e2e && ./scripts/run-smoke.sh
#
# Run via Doppler so TEST_SEED_SECRET matches the API server:
#   C:/Tools/doppler/doppler.exe run -c stg -- bash apps/mobile/e2e/scripts/run-smoke.sh
#
# Expected runtime: ~20-30 minutes on a warm emulator (2-3 min per flow).
#
# Preflight (runs automatically via e2e-lib.sh):
#   - Android emulator connected (adb get-state = device)
#   - UIAutomator lock is free
#   - dev-client APK is installed
#   - Metro bundler is running (port 8081 or METRO_URL)
#   - bundle proxy is healthy (port 8082)
#   - API server is running (port 8787, /v1/health = 200)
#   - TEST_SEED_SECRET is accepted by the seed endpoint
#
# See docs/e2e-smoke-pack.md for the full smoke pack definition.

set -uo pipefail

# shellcheck source=e2e-lib.sh
source "$(dirname "$0")/e2e-lib.sh"

RESULTS_FILE="$E2E_DIR/scripts/smoke-results-$(date +%Y%m%d-%H%M%S).txt"

echo "E2E Smoke Pack — $(date)" | tee "$RESULTS_FILE"
echo "Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')" | tee -a "$RESULTS_FILE"
echo "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" | tee -a "$RESULTS_FILE"
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

# ── SMOKE-1: Sign in and sign out ────────────────────────────────────────
# Uses sign-in-out-loop.yaml.
# ITERATIONS defaults to 5 (defined in the flow). One sign-in + sign-out cycle is
# sufficient for smoke; the full 5-iteration stress loop runs nightly. Override via
# the ITERATIONS env var if needed: ITERATIONS=1 bash ./scripts/run-smoke.sh
run_seeded "learning-active" "flows/auth/sign-in-out-loop.yaml"

# ── SMOKE-2: Learner home loads ──────────────────────────────────────────
run_seeded "learning-active" "flows/learning/home-layout.yaml"

# ── SMOKE-3: Start a learning session ───────────────────────────────────
run_seeded "learning-active" "flows/learning/start-session.yaml"

# ── SMOKE-4: My Notes opens and shows sessions, notes, and bookmarks ────
run_seeded "with-bookmarks" "flows/learning/my-notes-archive.yaml"

# ── SMOKE-5: Library topic detail opens ─────────────────────────────────
run_seeded "retention-due" "flows/learning/library-navigation.yaml"

# ── SMOKE-6: Progress overview opens ────────────────────────────────────
run_seeded "learning-active" "flows/progress/progress-analytics.yaml"

# ── SMOKE-7: Parent dashboard opens ─────────────────────────────────────
run_seeded "parent-with-children" "flows/parent/parent-dashboard.yaml"

# ── SMOKE-8: Saved bookmark item opens ──────────────────────────────────
run_seeded "with-bookmarks" "flows/progress/saved-bookmarks.yaml"

# ── SMOKE-9: Error or timeout state displays ────────────────────────────
# Uses home-loading-timeout.yaml (injects 12s network delay via NETWORK_DELAY_MS).
NETWORK_DELAY_MS=12000 run_seeded "onboarding-complete" "flows/home/home-loading-timeout.yaml"

# ── SMOKE-10: Billing or quota guard displays ────────────────────────────
run_seeded "daily-limit-reached" "flows/billing/daily-quota-exceeded.yaml"

# ── SUMMARY ─────────────────────────────────────────────────────────────
echo ""
echo "==========================================" | tee -a "$RESULTS_FILE"
echo "SMOKE PACK COMPLETE — $(date)" | tee -a "$RESULTS_FILE"
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
