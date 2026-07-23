#!/usr/bin/env bash
# Wrapper around seed-and-run.sh that requests a deterministic permanently
# denied camera state after the main wrapper clears app data.
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

export E2E_CAMERA_PERMISSION_STATE=permanently-denied

echo "[seed-and-run-permdenied] Delegating permanent camera denial to seed-and-run.sh..."

# Delegate to the main wrapper — pass all arguments through unchanged.
exec "$(dirname "$0")/seed-and-run.sh" "$@"
