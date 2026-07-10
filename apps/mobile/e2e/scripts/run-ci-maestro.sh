#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="${MAESTRO_OUTPUT_DIR:-maestro-screenshots}"
INCLUDE_TAGS="${MAESTRO_INCLUDE_TAGS:?MAESTRO_INCLUDE_TAGS is required}"

mkdir -p "$OUTPUT_DIR"

capture_failure_artifacts() {
  adb exec-out screencap -p > "$OUTPUT_DIR/failure-final-state.png" || true
  adb logcat -d -t 500 > "$OUTPUT_DIR/logcat.txt" || true
}

# Preserve the failing command's status while collecting diagnostics. The
# android-emulator-runner action invokes this file once, so the trap and exit
# state share one shell process.
trap 'status=$?; if [ "$status" -ne 0 ]; then capture_failure_artifacts; fi' EXIT

adb install apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk

# Wait for the app to be fully launchable, then capture its initial state.
sleep 5
adb shell am start -n com.mentomate.app/.MainActivity
sleep 15
adb exec-out screencap -p > "$OUTPUT_DIR/pre-test-app-state.png" || true

maestro test apps/mobile/e2e/flows/ \
  --include-tags="$INCLUDE_TAGS" \
  --output "$OUTPUT_DIR/"
