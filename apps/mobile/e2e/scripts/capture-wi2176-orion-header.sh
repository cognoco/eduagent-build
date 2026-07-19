#!/usr/bin/env bash
set -euo pipefail

# Run this only after the WI-2176 Maestro flow finishes at its named English
# Support-hub screenshot. The V2 Android build must already be installed.
# Configure the emulator before the flow with:
#   adb shell wm size 360x760
#   adb shell wm density 160
#   adb shell settings put system font_scale 1.0
# In Android Settings, make English (United States) the first system language,
# then reboot the emulator. This script writes two UIAutomator dumps and scrolls
# only the scope chip; it does not change the selected scope or server state.
# It refuses to capture if any fixed-profile check differs.
# After the flow completes, run exactly:
#   bash apps/mobile/e2e/scripts/capture-wi2176-orion-header.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
ADB_BIN="${ADB_BIN:-adb}"
OUTPUT_DIR="${1:-$REPO_ROOT/.workitem-artifacts/WI-2176}"
HEADER_OUTPUT_PATH="$OUTPUT_DIR/orion-support-hub-header.xml"
END_OUTPUT_PATH="$OUTPUT_DIR/orion-scope-options-end.xml"
HEADER_DEVICE_PATH="/sdcard/wi2176-orion-support-hub-header.xml"
END_DEVICE_PATH="/sdcard/wi2176-orion-scope-options-end.xml"

fail_profile() {
  printf 'WI-2176_ORION_PROFILE=FAILED %s\n' "$1" >&2
  exit 1
}

dump_hierarchy() {
  local device_path="$1"
  local output_path="$2"

  MSYS_NO_PATHCONV=1 "$ADB_BIN" shell uiautomator dump "$device_path" >/dev/null
  MSYS_NO_PATHCONV=1 "$ADB_BIN" exec-out cat "$device_path" >"$output_path"
}

size="$("$ADB_BIN" shell wm size | tr -d '\r')"
density="$("$ADB_BIN" shell wm density | tr -d '\r')"
font_scale="$("$ADB_BIN" shell settings get system font_scale | tr -d '\r')"
locale="$("$ADB_BIN" shell getprop persist.sys.locale | tr -d '\r')"
if [[ -z "$locale" || "$locale" == "null" ]]; then
  locale="$("$ADB_BIN" shell settings get system system_locales | tr -d '\r')"
fi

[[ "$size" == *"Override size: 360x760"* ]] ||
  fail_profile 'expected adb override size 360x760'
[[ "$density" == *"Override density: 160"* ]] ||
  fail_profile 'expected adb override density 160'
[[ "$font_scale" == "1.0" || "$font_scale" == "1" ]] ||
  fail_profile 'expected font_scale 1.0'
[[ "$locale" == "en-US" ]] || fail_profile 'expected system locale en-US'
printf 'WI-2176_ORION_PROFILE=SOUND size=360x760 density=160 locale=en-US font_scale=1.0\n'

mkdir -p "$OUTPUT_DIR"

# Snapshot 1 is the designated final Support-hub header endpoint. The flow
# leaves the chip at its start edge so Support hub and the first person option
# are fully visible here.
dump_hierarchy "$HEADER_DEVICE_PATH" "$HEADER_OUTPUT_PATH"

# Snapshot 2 moves only the horizontal chip to its deterministic end edge. On
# the fixed profile this exposes both person options away from clipped edges.
MSYS_NO_PATHCONV=1 "$ADB_BIN" shell input swipe 240 54 40 54 750 >/dev/null
dump_hierarchy "$END_DEVICE_PATH" "$END_OUTPUT_PATH"

cd "$REPO_ROOT"
pnpm exec tsx apps/mobile/scripts/verify-wi2176-orion-header.ts \
  "$HEADER_OUTPUT_PATH" \
  "$END_OUTPUT_PATH"
