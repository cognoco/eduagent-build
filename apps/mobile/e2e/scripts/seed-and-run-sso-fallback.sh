#!/usr/bin/env bash
# Wrapper for the SSO callback fallback flow.
#
# Mechanism decision (AUTH-09 Step 0, revised):
#   ADB `svc wifi/data disable` is used to sever network connectivity during the
#   SSO callback. Earlier revisions used `am broadcast AIRPLANE_MODE` plus
#   `settings put global airplane_mode_on`, but the broadcast intent requires
#   the signature-level BROADCAST_AIRPLANE_MODE permission and emulators
#   reject it with "Permission Denial". Without the broadcast, apps don't
#   observe the airplane-mode state change and may keep believing they have
#   network. `svc wifi/data` has no permission requirement and actually
#   disables the radios — Chrome Custom Tab sees a real "no network" state.
#   Clerk testing-token rejection is not available (CLERK_TESTING_TOKEN is a
#   placeholder per CLAUDE.md), so a real network kill is the deterministic
#   option.
#
# Strategy:
#   1. seed-and-run.sh brings the app to the sign-in screen.
#   2. This wrapper disables wifi + mobile data BEFORE launching Maestro.
#   3. Maestro taps the Google SSO button; the in-app browser cannot reach
#      Google's OAuth endpoint.
#   4. sso-callback.tsx's 10s timer fires and shows `sso-fallback-back`.
#   5. The Maestro flow asserts the button and taps it; sign-in screen returns.
#   6. Network is restored on exit (trap).
#
# LIMITATION: The in-app browser (Chrome Custom Tab) may show an error page
# rather than silently closing, adding non-deterministic UI between SSO tap and
# callback screen. The YAML uses extendedWaitUntil (25s) on the callback
# screen before asserting the fallback button appears (10s timer fires at ~10s).
#
# Usage:
#   ./e2e/scripts/seed-and-run-sso-fallback.sh <flow-file> [maestro-args...]
#
# Example:
#   ./e2e/scripts/seed-and-run-sso-fallback.sh e2e/flows/auth/sso-callback-fallback.yaml

set -euo pipefail

# Prevent Git Bash (MSYS) from converting Unix paths like /sdcard/ to Windows paths.
export MSYS_NO_PATHCONV=1

ADB="${ADB_PATH:-/c/Android/Sdk/platform-tools/adb.exe}"

# Restore wifi + mobile data on exit (whether clean or interrupted).
restore_network() {
  echo "[sso-fallback] Restoring wifi + data..."
  "$ADB" shell svc wifi enable 2>/dev/null || true
  "$ADB" shell svc data enable 2>/dev/null || true
}
trap restore_network EXIT

FLOW_FILE="${1:?Usage: seed-and-run-sso-fallback.sh <flow-file> [maestro-args...]}"
shift
EXTRA_ARGS=("$@")

echo "[sso-fallback] Delegating to seed-and-run.sh --no-seed to reach sign-in screen..."

# Delegate to main wrapper to handle: pm clear, app launch, bundle wait.
SCRIPT_DIR="$(dirname "$0")"

# Disable network BEFORE launching Maestro so the in-app browser has no
# network from the moment the SSO tap is processed.
echo "[sso-fallback] Disabling wifi + mobile data (network unavailable during flow)..."
"$ADB" shell svc wifi disable
"$ADB" shell svc data disable

echo "[sso-fallback] Network disabled. Launching Maestro flow..."
exec "${SCRIPT_DIR}/seed-and-run.sh" --no-seed "${FLOW_FILE}" "${EXTRA_ARGS[@]:+${EXTRA_ARGS[@]}}"
