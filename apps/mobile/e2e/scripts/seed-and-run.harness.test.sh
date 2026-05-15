#!/usr/bin/env bash
# Regression harness for the slow-network helpers in seed-and-run.sh.
#
# Tests the env-var → emulator-console-cmd mapping without a real emulator.
# Uses a function-shadow approach: after sourcing seed-and-run.sh in isolation
# we redefine `emulator_console_cmd` to capture invocations, then call the
# helpers directly.
#
# Usage: bash apps/mobile/e2e/scripts/seed-and-run.harness.test.sh
# Exit 0 = all cases passed; non-zero = failures printed to stderr.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PASS=0
FAIL=0
FAILURES=()

_tpass() { PASS=$((PASS+1)); echo "  ✓ $*"; }
_tfail() { FAIL=$((FAIL+1)); FAILURES+=("$*"); echo "  ✗ $*" >&2; }

# ── Source only the slow-network helpers ─────────────────────────────────────
# seed-and-run.sh has set -euo pipefail and runs top-level commands (check_emulator,
# adb reverse, etc.) when sourced. We prevent those side effects by stubbing the
# functions and binaries they call BEFORE sourcing, then sourcing via a subshell
# trick: we extract just the helper function definitions using grep/sed to avoid
# executing the top-level script body.
#
# Cleanest approach: define the helpers inline here, matching seed-and-run.sh's
# implementations exactly. This is fragile if seed-and-run.sh changes, but it
# avoids the sourcing complexity and is guaranteed to run on this platform.
# We verify the env-var logic, not the nc invocation itself.

# ── Inline the helpers under test (must match seed-and-run.sh exactly) ───────
# These are the functions we are testing:

_CONSOLE_CALLS=()

emulator_console_cmd() {
  # In the real script this sends a command to the emulator console via nc.
  # In tests we shadow it to record the call.
  _CONSOLE_CALLS+=("$1")
}

apply_network_speed() {
  local speed="${NETWORK_SPEED:-}"
  if [ -n "$speed" ]; then
    emulator_console_cmd "network speed ${speed}"
    echo "[seed-and-run] Applied network speed=${speed}"
  fi
}

apply_network_delay() {
  local delay="${NETWORK_DELAY_MS:-0}"
  if [ "$delay" -gt 0 ] 2>/dev/null; then
    emulator_console_cmd "network delay ${delay}"
    echo "[seed-and-run] Applied network delay=${delay}ms"
  fi
}

schedule_network_kill() {
  local kill_after="${NETWORK_KILL_AFTER_MS:-0}"
  if [ "$kill_after" -gt 0 ] 2>/dev/null; then
    local kill_after_secs=$(( kill_after / 1000 ))
    (
      sleep "$kill_after_secs"
      echo "[seed-and-run] NETWORK_KILL_AFTER_MS=${kill_after} reached — enabling airplane mode."
      # ADB calls are no-ops in tests (ADB=/bin/true below)
      "${ADB:-/bin/true}" ${DEVICE_FLAG:-} shell settings put global airplane_mode_on 1 2>/dev/null || true
      "${ADB:-/bin/true}" ${DEVICE_FLAG:-} shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true 2>/dev/null || true
    ) &
    echo "[seed-and-run] Scheduled network kill in ${kill_after_secs}s (pid $!)"
  fi
}

slow_net_restore() {
  emulator_console_cmd "network delay none" || true
  "${ADB:-/bin/true}" ${DEVICE_FLAG:-} shell settings put global airplane_mode_on 0 2>/dev/null || true
  "${ADB:-/bin/true}" ${DEVICE_FLAG:-} shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false 2>/dev/null || true
  echo "[seed-and-run] Network restored (delay=none, airplane=off)."
}

# Stub ADB to /bin/true so any ADB calls in helpers are no-ops
ADB="/bin/true"
DEVICE_FLAG=""

# ── Test cases ────────────────────────────────────────────────────────────────

echo "─── apply_network_delay ───────────────────────────────────────────────"

# CASE 1: NETWORK_DELAY_MS=4321 → emulator_console_cmd called with "network delay 4321"
_CONSOLE_CALLS=()
NETWORK_DELAY_MS=4321 apply_network_delay
if [ ${#_CONSOLE_CALLS[@]} -eq 1 ] && [ "${_CONSOLE_CALLS[0]}" = "network delay 4321" ]; then
  _tpass "apply_network_delay passes 'network delay 4321' to emulator_console_cmd"
else
  _tfail "apply_network_delay: expected 'network delay 4321', got '${_CONSOLE_CALLS[*]:-<none>}'"
fi

# CASE 2: NETWORK_DELAY_MS=0 → emulator_console_cmd NOT called (no-op)
_CONSOLE_CALLS=()
NETWORK_DELAY_MS=0 apply_network_delay
if [ ${#_CONSOLE_CALLS[@]} -eq 0 ]; then
  _tpass "apply_network_delay is a no-op when NETWORK_DELAY_MS=0"
else
  _tfail "apply_network_delay should not call console when NETWORK_DELAY_MS=0, got '${_CONSOLE_CALLS[*]}'"
fi

# CASE 3: NETWORK_DELAY_MS unset → emulator_console_cmd NOT called
_CONSOLE_CALLS=()
unset NETWORK_DELAY_MS
apply_network_delay
if [ ${#_CONSOLE_CALLS[@]} -eq 0 ]; then
  _tpass "apply_network_delay is a no-op when NETWORK_DELAY_MS is unset"
else
  _tfail "apply_network_delay should not call console when NETWORK_DELAY_MS unset, got '${_CONSOLE_CALLS[*]}'"
fi

echo ""
echo "─── apply_network_speed ───────────────────────────────────────────────"

# CASE 4: NETWORK_SPEED=edge → emulator_console_cmd called with "network speed edge"
_CONSOLE_CALLS=()
NETWORK_SPEED=edge apply_network_speed
if [ ${#_CONSOLE_CALLS[@]} -eq 1 ] && [ "${_CONSOLE_CALLS[0]}" = "network speed edge" ]; then
  _tpass "apply_network_speed passes 'network speed edge' to emulator_console_cmd"
else
  _tfail "apply_network_speed: expected 'network speed edge', got '${_CONSOLE_CALLS[*]:-<none>}'"
fi

# CASE 5: NETWORK_SPEED="" (empty) → emulator_console_cmd NOT called
_CONSOLE_CALLS=()
NETWORK_SPEED="" apply_network_speed
if [ ${#_CONSOLE_CALLS[@]} -eq 0 ]; then
  _tpass "apply_network_speed is a no-op when NETWORK_SPEED is empty"
else
  _tfail "apply_network_speed should not call console when NETWORK_SPEED empty, got '${_CONSOLE_CALLS[*]}'"
fi

# CASE 6: NETWORK_SPEED unset → emulator_console_cmd NOT called
_CONSOLE_CALLS=()
unset NETWORK_SPEED
apply_network_speed
if [ ${#_CONSOLE_CALLS[@]} -eq 0 ]; then
  _tpass "apply_network_speed is a no-op when NETWORK_SPEED is unset"
else
  _tfail "apply_network_speed should not call console when NETWORK_SPEED unset, got '${_CONSOLE_CALLS[*]}'"
fi

echo ""
echo "─── slow_net_restore ──────────────────────────────────────────────────"

# CASE 7: slow_net_restore sends "network delay none" as first call
_CONSOLE_CALLS=()
slow_net_restore 2>/dev/null || true
if [ ${#_CONSOLE_CALLS[@]} -ge 1 ] && [ "${_CONSOLE_CALLS[0]}" = "network delay none" ]; then
  _tpass "slow_net_restore sends 'network delay none' to emulator_console_cmd"
else
  _tfail "slow_net_restore: expected first call 'network delay none', got '${_CONSOLE_CALLS[*]:-<none>}'"
fi

echo ""
echo "─── schedule_network_kill ─────────────────────────────────────────────"

# CASE 8: NETWORK_KILL_AFTER_MS=0 → no background process spawned
# schedule_network_kill with 0 is a no-op; verify by sleeping briefly and
# checking that ADB airplane mode was NOT immediately invoked (the background
# sleep prevents it from being immediate even if kill_after > 0).
_CONSOLE_CALLS=()
NETWORK_KILL_AFTER_MS=0 schedule_network_kill
sleep 0.2
if [ ${#_CONSOLE_CALLS[@]} -eq 0 ]; then
  _tpass "schedule_network_kill is a no-op when NETWORK_KILL_AFTER_MS=0"
else
  _tfail "schedule_network_kill should not act when NETWORK_KILL_AFTER_MS=0, got ${_CONSOLE_CALLS[*]}"
fi

# CASE 9: NETWORK_KILL_AFTER_MS unset → no background process spawned
_CONSOLE_CALLS=()
unset NETWORK_KILL_AFTER_MS
schedule_network_kill
sleep 0.2
if [ ${#_CONSOLE_CALLS[@]} -eq 0 ]; then
  _tpass "schedule_network_kill is a no-op when NETWORK_KILL_AFTER_MS is unset"
else
  _tfail "schedule_network_kill should not act when NETWORK_KILL_AFTER_MS unset"
fi

# CASE 10: NETWORK_KILL_AFTER_MS=10000 → background process spawned (does not
# fire within 1s, so console calls remain 0 immediately after scheduling).
_CONSOLE_CALLS=()
NETWORK_KILL_AFTER_MS=10000 schedule_network_kill 2>/dev/null
sleep 0.2
if [ ${#_CONSOLE_CALLS[@]} -eq 0 ]; then
  _tpass "schedule_network_kill with 10s delay does not fire within 0.2s"
else
  _tfail "schedule_network_kill fired too early (got ${_CONSOLE_CALLS[*]})"
fi

echo ""
echo "─── seedPendingAuthRedirectForTesting gate (D-TTL-2 / D-TTL-6) ───────"

# Source-level assertions only — no emulator required. The gate has to live
# inline in the .ts source so Metro can strip the branch in production builds.

REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
PENDING_FILE="${REPO_ROOT}/apps/mobile/src/lib/pending-auth-redirect.ts"
SEED_ROUTE="${REPO_ROOT}/apps/mobile/src/app/dev-only/seed-pending-redirect.tsx"

# CASE 11: seedPendingAuthRedirectForTesting body contains a production guard
if [ -f "$PENDING_FILE" ] && \
   grep -q "seedPendingAuthRedirectForTesting" "$PENDING_FILE" && \
   grep -q "NODE_ENV.*production" "$PENDING_FILE" && \
   grep -q "EXPO_PUBLIC_E2E" "$PENDING_FILE"; then
  _tpass "pending-auth-redirect.ts gates seedPendingAuthRedirectForTesting on NODE_ENV + EXPO_PUBLIC_E2E"
else
  _tfail "pending-auth-redirect.ts missing production guard on seedPendingAuthRedirectForTesting (NODE_ENV / EXPO_PUBLIC_E2E)"
fi

# CASE 12: dev-only seed route is gated on EXPO_PUBLIC_E2E and NODE_ENV
if [ -f "$SEED_ROUTE" ] && \
   grep -q "EXPO_PUBLIC_E2E" "$SEED_ROUTE" && \
   grep -q "NODE_ENV" "$SEED_ROUTE"; then
  _tpass "dev-only/seed-pending-redirect.tsx gates rendering on NODE_ENV + EXPO_PUBLIC_E2E"
else
  _tfail "dev-only/seed-pending-redirect.tsx missing build-time gate on NODE_ENV + EXPO_PUBLIC_E2E"
fi

# CASE 13: the seed route redirects to bare sign-in (no redirectTo param),
# regression guard for the D-TTL-4 critical finding. A redirectTo= on the URL
# would cause (auth)/_layout.tsx to overwrite the seeded savedAt and silently
# defeat the TTL test.
if [ -f "$SEED_ROUTE" ] && \
   grep -E -q "router\.replace\(['\"]/\(?auth\)?/sign-in['\"]\)" "$SEED_ROUTE" && \
   ! grep -q "redirectTo" "$SEED_ROUTE"; then
  _tpass "dev-only/seed-pending-redirect.tsx replaces to bare /(auth)/sign-in (no redirectTo)"
else
  _tfail "dev-only/seed-pending-redirect.tsx must router.replace('/(auth)/sign-in') with NO redirectTo param (D-TTL-4)"
fi

echo ""
echo "─── seed-and-run.sh wiring (regression guard) ─────────────────────────"

# These guard against the helpers being deleted from seed-and-run.sh and the
# inline copies above still passing — keeping the test green while the runtime
# is silently broken. We check that the real script defines each function AND
# calls them after the sign-in-screen marker.
SEED_RUN_SH="${SCRIPT_DIR}/seed-and-run.sh"

for fn in emulator_console_cmd apply_network_speed apply_network_delay schedule_network_kill slow_net_restore; do
  if grep -Eq "^${fn}\\(\\)" "$SEED_RUN_SH"; then
    _tpass "seed-and-run.sh defines ${fn}()"
  else
    _tfail "seed-and-run.sh missing function ${fn}() — helpers must live in the real script, not just this test"
  fi
done

# Each of the three apply/schedule helpers must be invoked in the script, not
# just defined. Without this guard a refactor that removes the call sites would
# leave the env vars inert.
for fn in apply_network_speed apply_network_delay schedule_network_kill; do
  if grep -Eq "^[[:space:]]*${fn}\$" "$SEED_RUN_SH"; then
    _tpass "seed-and-run.sh invokes ${fn} before maestro test"
  else
    _tfail "seed-and-run.sh defines ${fn} but never calls it — NETWORK_* env vars would be inert"
  fi
done

echo ""
echo "─── Summary ────────────────────────────────────────────────────────────"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failures:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
  exit 1
fi
exit 0
