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

# Run infrastructure preflight ONCE per batch. The checks are the automated
# form of docs/E2Edocs/e2e-session-2026-04-22-struggles.md's post-mortem —
# they catch the cascade that produced BUG-594..622 (stale bundle proxy,
# missing APK after -wipe-data, missing TEST_SEED_SECRET, stuck UIAutomator
# lock) before the harness wastes 30+ min running tests doomed to fail.
# shellcheck source=e2e-preflight.sh
source "$SCRIPT_DIR/e2e-preflight.sh"
if ! run_preflight; then
  echo "[e2e-lib] Preflight failed — aborting batch. Fix the issue above and re-run." >&2
  exit 1
fi

export TEMP="${TEMP:-/tmp}"
export TMP="${TMP:-/tmp}"

# Safety net: any prior batch that crashed mid-flow with NETWORK_DELAY_MS active
# would leave the emulator's network shaping on, silently flaking every flow that
# follows. Reset at batch start. No-op if no token / port unreachable.
reset_network_delay() {
  local port="${EMULATOR_CONSOLE_PORT:-5554}"
  local token
  token=$(cat "$HOME/.emulator_console_auth_token" 2>/dev/null || echo "")
  printf 'auth %s\nnetwork delay none\nnetwork speed full\nquit\n' "$token" \
    | "${NETCAT:-/c/Program Files/Git/usr/bin/nc.exe}" -w 2 localhost "$port" >/dev/null 2>&1 || true
}
reset_network_delay

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
PARTIAL_COUNT=0
TOTAL=0
FLOW_LOG_DIR="$E2E_DIR/scripts/run-logs/flows-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$FLOW_LOG_DIR"

# Hard cap on per-flow runtime. Without this a single hung adb/Maestro can
# silently consume hours (observed 2026-04-25: 23h hang on flow [1] with no
# output). 10 min is generous: cold bundle ~2 min + Maestro flow up to 5 min.
: "${PER_FLOW_TIMEOUT:=600}"

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
  local flow_slug
  flow_slug=$(echo "${scenario}-${flow}" | tr '/. :' '____')
  local flow_log="$FLOW_LOG_DIR/${flow_slug}.log"
  echo ""
  echo "=========================================="
  echo "[$((TOTAL+1))] SEEDED: $scenario → $flow (FAST=$fast)"
  echo "=========================================="
  echo "[e2e-lib] Flow log: $flow_log"
  if FAST=$fast timeout --signal=TERM --kill-after=15 "$PER_FLOW_TIMEOUT" "$SEED_SCRIPT" "$scenario" "$flow" > >(tee "$flow_log") 2> >(tee -a "$flow_log" >&2); then
    log_result "PASS" "$flow"
  else
    rc=$?
    if [ $rc -eq 124 ] || [ $rc -eq 137 ]; then
      log_result "FAIL" "$flow" "(scenario: $scenario, TIMEOUT after ${PER_FLOW_TIMEOUT}s, log: $flow_log)"
    else
      log_result "FAIL" "$flow" "(scenario: $scenario, log: $flow_log)"
    fi
  fi
}

# run_noseed FLOW [FAST_OVERRIDE]
# Runs a flow without seeding.
run_noseed() {
  local flow="$1"
  local fast="${2:-$FAST}"
  local flow_slug
  flow_slug=$(echo "no-seed-${flow}" | tr '/. :' '____')
  local flow_log="$FLOW_LOG_DIR/${flow_slug}.log"
  echo ""
  echo "=========================================="
  echo "[$((TOTAL+1))] NO-SEED: $flow (FAST=$fast)"
  echo "=========================================="
  echo "[e2e-lib] Flow log: $flow_log"
  if FAST=$fast timeout --signal=TERM --kill-after=15 "$PER_FLOW_TIMEOUT" "$SEED_SCRIPT" --no-seed "$flow" > >(tee "$flow_log") 2> >(tee -a "$flow_log" >&2); then
    log_result "PASS" "$flow"
  else
    rc=$?
    if [ $rc -eq 124 ] || [ $rc -eq 137 ]; then
      log_result "FAIL" "$flow" "(no-seed, TIMEOUT after ${PER_FLOW_TIMEOUT}s, log: $flow_log)"
    else
      log_result "FAIL" "$flow" "(no-seed, log: $flow_log)"
    fi
  fi
}
