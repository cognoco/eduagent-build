#!/usr/bin/env bash
# Shared helper functions for E2E regression batch scripts.
# Source this file at the top of each batch script:
#   source "$(dirname "$0")/e2e-lib.sh"

# ── Common setup ─────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$E2E_DIR" || { echo "[e2e-lib] Failed to cd into $E2E_DIR" >&2; exit 1; }

SEED_SCRIPT="./scripts/seed-and-run.sh"
FAST="${FAST:-1}"

export TEMP="${TEMP:-/tmp}"
export TMP="${TMP:-/tmp}"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
PARTIAL_COUNT=0
TOTAL=0

# ── Logging ──────────────────────────────────────────────────────────────

# log_result STATUS FLOW [NOTE]
# Logs the result to RESULTS_FILE (must be set by the calling script)
# and increments the appropriate counter.
log_result() {
  local status="$1"
  local flow="$2"
  local note="${3:-}"
  echo "[$status] $flow $note" | tee -a "$RESULTS_FILE"
  case "$status" in
    PASS) PASS_COUNT=$((PASS_COUNT + 1)) ;;
    FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
    SKIP) SKIP_COUNT=$((SKIP_COUNT + 1)) ;;
    PARTIAL) PARTIAL_COUNT=$((PARTIAL_COUNT + 1)) ;;
  esac
  TOTAL=$((TOTAL + 1))
}

# ── Run helpers ──────────────────────────────────────────────────────────

# run_seeded SCENARIO FLOW [FAST_OVERRIDE]
# Seeds with the given scenario and runs the flow.
# Optional FAST_OVERRIDE (0 or 1) overrides the global FAST setting.
run_seeded() {
  local scenario="$1"
  local flow="$2"
  local fast="${3:-$FAST}"
  echo ""
  echo "=========================================="
  echo "[$((TOTAL+1))] SEEDED: $scenario → $flow (FAST=$fast)"
  echo "=========================================="
  if FAST=$fast "$SEED_SCRIPT" "$scenario" "$flow"; then
    log_result "PASS" "$flow"
  else
    log_result "FAIL" "$flow" "(scenario: $scenario)"
  fi
}

# run_noseed FLOW [FAST_OVERRIDE]
# Runs a flow without seeding.
run_noseed() {
  local flow="$1"
  local fast="${2:-$FAST}"
  echo ""
  echo "=========================================="
  echo "[$((TOTAL+1))] NO-SEED: $flow (FAST=$fast)"
  echo "=========================================="
  if FAST=$fast "$SEED_SCRIPT" --no-seed "$flow"; then
    log_result "PASS" "$flow"
  else
    log_result "FAIL" "$flow" "(no-seed)"
  fi
}
