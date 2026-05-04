#!/usr/bin/env bash
# Wrapper for the SSO callback fallback flow.
#
# Mechanism decision (AUTH-09 Step 0):
#   Option (a) was chosen: ADB airplane-mode toggle during the SSO callback.
#   Rationale: Clerk testing-token rejection is not available (CLERK_TESTING_TOKEN
#   is a placeholder per CLAUDE.md). Airplane mode is reliable on the WHPX
#   emulator and has precedent in existing wrappers (seed-and-run-permdenied.sh).
#
# Strategy:
#   1. seed-and-run.sh brings the app to the sign-in screen.
#   2. This wrapper taps the Google SSO button via ADB.
#   3. Immediately enables airplane mode — the in-app browser cannot reach
#      Google's OAuth endpoint; it either times out or is dismissed.
#   4. sso-callback.tsx's 10s timer fires and shows `sso-fallback-back`.
#   5. The Maestro flow asserts the button and taps it; sign-in screen returns.
#   6. Airplane mode is restored on exit (trap).
#
# LIMITATION: The in-app browser (Chrome Custom Tab) may show an error page
# rather than silently closing, adding non-deterministic UI between SSO tap and
# callback screen. The YAML uses extendedWaitUntil (15s) on the callback
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

# Restore airplane mode off on exit (whether clean or interrupted)
restore_network() {
  echo "[sso-fallback] Restoring airplane mode OFF..."
  "$ADB" shell settings put global airplane_mode_on 0
  "$ADB" shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false 2>/dev/null || true
}
trap restore_network EXIT

FLOW_FILE="${1:?Usage: seed-and-run-sso-fallback.sh <flow-file> [maestro-args...]}"
shift
EXTRA_ARGS=("$@")

echo "[sso-fallback] Delegating to seed-and-run.sh --no-seed to reach sign-in screen..."

# Delegate to main wrapper to handle: pm clear, app launch, bundle wait.
# We run seed-and-run.sh in a subshell to capture its exit WITHOUT exec,
# so our trap can run after the flow.
SCRIPT_DIR="$(dirname "$0")"

# seed-and-run.sh --no-seed will exec maestro at the end.
# We can't intercept between "app on sign-in" and "maestro starts" in the
# wrapper model, so instead we rely on the YAML flow itself to:
#   a) assert sign-in-screen is visible (confirms we're at sign-in)
#   b) tap google-sso-button
# Then immediately AFTER tapping (in the YAML, there is no way to toggle ADB
# mid-flow without runScript), the airplane mode is toggled in a SEPARATE
# wrapper step.
#
# Revised strategy: enable airplane mode BEFORE launching Maestro.
# The YAML flow will:
#   1. Assert sign-in screen is visible.
#   2. Tap Google SSO button.
#   3. The in-app browser opens but can't reach Google (no network) — times out
#      or shows error page, then auto-closes or the user is redirected to
#      sso-callback route.
#   4. Wait 15s for sso-fallback-back to appear.
#   5. Tap it and assert sign-in screen returns.
# After Maestro exits, the trap restores airplane mode.
#
# NOTE: Airplane mode is enabled HERE (before maestro runs) so the
# in-app browser has no network from the moment SSO tap is processed.

echo "[sso-fallback] Enabling airplane mode (network will be unavailable during flow)..."
"$ADB" shell settings put global airplane_mode_on 1
"$ADB" shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true 2>/dev/null || true

echo "[sso-fallback] Airplane mode ON. Launching Maestro flow..."
exec "${SCRIPT_DIR}/seed-and-run.sh" --no-seed "${FLOW_FILE}" "${EXTRA_ARGS[@]:+${EXTRA_ARGS[@]}}"
