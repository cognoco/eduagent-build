#!/usr/bin/env bash
# Wrapper around seed-and-run.sh that revokes camera permission before
# launching the flow. Used for flows that exercise the permanently-denied
# camera permission path (open-settings-button).
#
# Why a wrapper instead of in-flow runScript:
#   seed-and-run.sh documents Issue 13 (Maestro 2.2.0 runScript __maestro undefined)
#   — the entire harness exists because in-flow runScript is unreliable. ADB-side
#   state changes belong in the wrapper, not the flow.
#
# Usage:
#   ./e2e/scripts/seed-and-run-permdenied.sh <scenario> <flow-file> [maestro-args...]
#
# Example:
#   ./e2e/scripts/seed-and-run-permdenied.sh homework-ready e2e/flows/homework/camera-permission-denied.yaml

set -euo pipefail

# Prevent Git Bash (MSYS) from converting Unix paths like /sdcard/ to Windows paths.
export MSYS_NO_PATHCONV=1

ADB="${ADB_PATH:-/c/Android/Sdk/platform-tools/adb.exe}"
APP_ID="com.mentomate.app"

echo "[seed-and-run-permdenied] Clearing app data and revoking camera permission..."

# Clear app data to reset all permission state to first-install defaults.
"$ADB" shell pm clear "$APP_ID"

# Revoke camera permission explicitly after pm clear (belt-and-suspenders —
# pm clear already resets permissions but explicit revoke ensures denied state
# even if pm clear behaviour changes across Android versions).
"$ADB" shell pm revoke "$APP_ID" android.permission.CAMERA || true

echo "[seed-and-run-permdenied] Camera permission revoked. Delegating to seed-and-run.sh..."

# Delegate to the main wrapper — pass all arguments through unchanged.
exec "$(dirname "$0")/seed-and-run.sh" "$@"
