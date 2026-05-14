#!/usr/bin/env bash
# Seed test data via API, then run a Maestro flow with the seeded credentials.
#
# This script works around Issue 13 (Maestro 2.2.0 runScript __maestro undefined)
# by calling the seed API via curl + node (for JSON parsing), then passing the
# credentials to Maestro as environment variables.
#
# Usage:
#   ./seed-and-run.sh <scenario> <flow-file> [maestro-args...]
#   ./seed-and-run.sh --no-seed <flow-file> [maestro-args...]
#
# The --no-seed flag skips the seed API call and launches the app with a clean
# state (pm clear). Use this for pre-auth flows that need to sign up a new user
# (e.g., coppa-flow, profile-creation-consent, sign-up-flow).
#
# Examples:
#   ./seed-and-run.sh onboarding-complete flows/account/settings-toggles.yaml
#   ./seed-and-run.sh learning-active flows/learning/core-learning.yaml
#   ./seed-and-run.sh --no-seed flows/onboarding/sign-up-flow.yaml
#   ./seed-and-run.sh retention-due flows/retention/recall-review.yaml --debug-output
#
# Environment variables (optional):
#   API_URL          — API base URL (default: http://localhost:8787)
#   EMAIL            — Test user email (default: test-e2e+clerk_test@example.com)
#   MAESTRO_PATH     — Path to maestro binary (default: /c/tools/maestro/bin/maestro)
#   METRO_URL        — Metro server URL for dev-client (default: http://10.0.2.2:8082)
#                      Uses bundle proxy by default (BUG-7: OkHttp chunked encoding fails on 8081)
#   LAUNCHER_TIMEOUT — Seconds to wait for dev-client launcher (default: 45)
#   BUNDLE_TIMEOUT   — Seconds to wait for JS bundle to load (default: 120)
#   FAST             — Set to 1 for aggressive timeouts (20s launcher, 60s bundle)
#   UI_MODE          — Set to "light" to switch emulator to light mode before running.
#                      Restores dark mode on exit. Default: leave system theme unchanged.
#
# Prerequisites:
#   - API server running at API_URL (not needed for --no-seed if flow doesn't call API)
#   - Android emulator running with dev-client APK
#   - Metro bundler + bundle proxy running
#   - TEMP/TMP set to ASCII paths (Windows Unicode workaround)

set -euo pipefail

# ── Trap: clean exit on Ctrl+C / SIGTERM ──
cleanup() {
  echo ""
  echo "[seed-and-run] INTERRUPTED — exiting immediately."
  exit 130
}
trap cleanup INT TERM

# Prevent Git Bash (MSYS) from converting Unix paths like /sdcard/ to Windows paths.
# Without this, adb shell commands get mangled paths (e.g., /sdcard/ → C:/Program Files/Git/sdcard/).
export MSYS_NO_PATHCONV=1

# ── Args ──
NO_SEED=0
if [ "${1:-}" = "--no-seed" ]; then
  NO_SEED=1
  shift
  SCENARIO="(none)"
  FLOW_FILE="${1:?Usage: seed-and-run.sh --no-seed <flow-file> [maestro-args...]}"
  shift
else
  SCENARIO="${1:?Usage: seed-and-run.sh <scenario> <flow-file> [maestro-args...]}"
  FLOW_FILE="${2:?Usage: seed-and-run.sh <scenario> <flow-file> [maestro-args...]}"
  shift 2
fi
EXTRA_ARGS=("$@")

# ── Config ──
API_URL="${API_URL:-http://localhost:8787}"
EMAIL="${EMAIL:-test-e2e+clerk_test@example.com}"
MAESTRO="${MAESTRO_PATH:-/c/tools/maestro/bin/maestro}"
METRO_URL="${METRO_URL:-http://10.0.2.2:8082}"
ADB="${ADB_PATH:-/c/Android/Sdk/platform-tools/adb.exe}"
APP_ID="com.mentomate.app"

# ── Timeouts (configurable, with FAST mode) ──
# FAST=1 uses tighter timeouts for CI speed, but not too tight:
# - Launcher: 35s (was 20s) — WHPX cold start after pm clear takes 20-30s
# - Bundle:   90s (was 60s) — cached bundle ~5s, cold bundle up to 2 min on slow WHPX
if [ "${FAST:-0}" = "1" ]; then
  LAUNCHER_TIMEOUT="${LAUNCHER_TIMEOUT:-35}"
  BUNDLE_TIMEOUT="${BUNDLE_TIMEOUT:-90}"
else
  LAUNCHER_TIMEOUT="${LAUNCHER_TIMEOUT:-45}"
  BUNDLE_TIMEOUT="${BUNDLE_TIMEOUT:-120}"
fi
MAX_RELAUNCH=2  # Max app relaunch attempts before giving up

# ── Ensure TEMP/TMP are set (Maestro needs ASCII paths on Windows) ──
export TEMP="${TEMP:-C:\\tools\\tmp}"
export TMP="${TMP:-C:\\tools\\tmp}"

# ── Detect target device from --udid in extra args ──
DEVICE_FLAG=""
for i in "${!EXTRA_ARGS[@]}"; do
  if [[ "${EXTRA_ARGS[$i]}" == "--udid" ]] && [ $((i+1)) -lt ${#EXTRA_ARGS[@]} ]; then
    DEVICE_FLAG="-s ${EXTRA_ARGS[$((i+1))]}"
    break
  fi
done

# ── Helper: check emulator is alive ──
check_emulator() {
  if ! $ADB $DEVICE_FLAG get-state 2>/dev/null | grep -q "device"; then
    echo "[seed-and-run] FATAL: Emulator is not connected!" >&2
    echo "[seed-and-run] Run: adb devices   to check status." >&2
    exit 1
  fi
}

reset_maestro_driver() {
  # Maestro owns the UIAutomator instrumentation channel while a test runs.
  # If a previous run is killed mid-command, the next test can hang at the
  # first inputText/tap call unless we release the driver explicitly.
  $ADB $DEVICE_FLAG shell am force-stop dev.mobile.maestro 2>/dev/null || true
  $ADB $DEVICE_FLAG shell am force-stop dev.mobile.maestro.test 2>/dev/null || true
  $ADB $DEVICE_FLAG shell pm clear dev.mobile.maestro 2>/dev/null || true
  $ADB $DEVICE_FLAG shell pm clear dev.mobile.maestro.test 2>/dev/null || true
  $ADB $DEVICE_FLAG shell am kill dev.mobile.maestro 2>/dev/null || true
  $ADB $DEVICE_FLAG shell am kill dev.mobile.maestro.test 2>/dev/null || true
}

# ── Pre-step: Clear state + launch app via ADB (BUG-19) ──
# Maestro's launchApp (with or without clearState) fails intermittently on
# WHPX emulators, especially with concurrent sessions. Workaround: clear state
# and launch the app ourselves via ADB, then have Maestro start from
# the dev-client launcher screen (no launchApp step in flows).
# ── Helper: wait for text in UI hierarchy via screencap+OCR is too complex.
# Instead, poll uiautomator dump for specific text strings. ──
wait_for_text() {
  local text="$1"
  local timeout="${2:-$LAUNCHER_TIMEOUT}"
  local elapsed=0
  echo "[seed-and-run] Waiting up to ${timeout}s for '${text}' ..."
  while [ $elapsed -lt $timeout ]; do
    # Health check: bail immediately if emulator died
    if ! $ADB $DEVICE_FLAG get-state 2>/dev/null | grep -q "device"; then
      echo "[seed-and-run] FATAL: Emulator disconnected while waiting for '${text}'!" >&2
      exit 1
    fi
    # Dump UI hierarchy to device, then read via exec-out (avoids MSYS path mangling)
    if $ADB $DEVICE_FLAG shell uiautomator dump /sdcard/ui_dump.xml 2>/dev/null; then
      if $ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null | grep -q "$text"; then
        echo "[seed-and-run] Found '${text}' after ${elapsed}s"
        return 0
      fi
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  echo "[seed-and-run] FAILED: '${text}' not found after ${timeout}s" >&2
  return 1
}

dump_visible_texts() {
  local limit="${1:-10}"
  node -e "
    const fs = require('fs');
    const limit = Number(process.argv[1] || 10);
    const xml = fs.readFileSync(0, 'utf8');
    const texts = [];
    const re = /text=\"([^\"]+)\"/g;
    for (let match; (match = re.exec(xml)) && texts.length < limit;) {
      texts.push(match[1]);
    }
    process.stdout.write(texts.join(', '));
  " "$limit"
}

first_bounds_for_text() {
  local pattern="$1"
  node -e "
    const fs = require('fs');
    const pattern = new RegExp(process.argv[1]);
    const xml = fs.readFileSync(0, 'utf8');
    const re = /<node\\b[^>]*>/g;
    for (let match; (match = re.exec(xml));) {
      const node = match[0];
      const text = /text=\"([^\"]*)\"/.exec(node)?.[1] ?? '';
      const bounds = /bounds=\"([^\"]+)\"/.exec(node)?.[1] ?? '';
      if (bounds && pattern.test(text)) {
        process.stdout.write(bounds);
        process.exit(0);
      }
    }
  " "$pattern"
}

first_bounds_for_content_desc() {
  local pattern="$1"
  node -e "
    const fs = require('fs');
    const pattern = new RegExp(process.argv[1]);
    const xml = fs.readFileSync(0, 'utf8');
    const re = /<node\\b[^>]*>/g;
    for (let match; (match = re.exec(xml));) {
      const node = match[0];
      const label = /content-desc=\"([^\"]*)\"/.exec(node)?.[1] ?? '';
      const bounds = /bounds=\"([^\"]+)\"/.exec(node)?.[1] ?? '';
      if (bounds && pattern.test(label)) {
        process.stdout.write(bounds);
        process.exit(0);
      }
    }
  " "$pattern"
}

bounds_coord() {
  local bounds="$1"
  local index="$2"
  echo "$bounds" | sed -E 's/[^0-9]+/ /g' | awk -v i="$index" '{ print $i }'
}

# ── Helper: tap coordinates via ADB input ──
adb_tap() {
  $ADB $DEVICE_FLAG shell input tap "$1" "$2"
}

# ── Pre-flight: verify emulator + services ──
check_emulator

# ── Set up adb reverse for Metro access ──
# The emulator can reach the host via 10.0.2.2, but adb reverse is more reliable
# (avoids firewall issues, works with both 10.0.2.2 and localhost URLs).
$ADB $DEVICE_FLAG reverse tcp:8081 tcp:8081 2>/dev/null || true
$ADB $DEVICE_FLAG reverse tcp:8082 tcp:8082 2>/dev/null || true

echo "[seed-and-run] Emulator OK. Ports forwarded. Timeouts: launcher=${LAUNCHER_TIMEOUT}s, bundle=${BUNDLE_TIMEOUT}s"

# ── UI_MODE: switch system theme if requested ──
if [ "${UI_MODE:-}" = "light" ]; then
  echo "[seed-and-run] Switching emulator to LIGHT mode ..."
  $ADB $DEVICE_FLAG shell cmd uimode night no 2>/dev/null || true
  sleep 1
elif [ "${UI_MODE:-}" = "dark" ]; then
  echo "[seed-and-run] Switching emulator to DARK mode ..."
  $ADB $DEVICE_FLAG shell cmd uimode night yes 2>/dev/null || true
  sleep 1
fi

echo "[seed-and-run] Clearing app state and launching via ADB ..."
$ADB $DEVICE_FLAG shell am force-stop "$APP_ID" 2>/dev/null || true
$ADB $DEVICE_FLAG shell pm clear "$APP_ID" 2>/dev/null || true
# BUG-21: Kill Bluetooth to prevent "Bluetooth keeps stopping" dialog on WHPX
$ADB $DEVICE_FLAG shell am force-stop com.android.bluetooth 2>/dev/null || true
# Stop Maestro driver to release UIAutomator service.
reset_maestro_driver
# BUG-22: Pre-grant notification permission so the dialog doesn't block UI
$ADB $DEVICE_FLAG shell pm grant "$APP_ID" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
# BUG-39: Pre-grant camera permission so homework flows don't hit system dialog
$ADB $DEVICE_FLAG shell pm grant "$APP_ID" android.permission.CAMERA 2>/dev/null || true
# Pre-grant microphone so voice-focused flows don't hit the Android system
# dialog unless the flow is explicitly testing the just-in-time permission ask.
$ADB $DEVICE_FLAG shell pm grant "$APP_ID" android.permission.RECORD_AUDIO 2>/dev/null || true
# Give the OS time to settle after pm clear + pm grants before launching
sleep 2
$ADB $DEVICE_FLAG shell am start -n "$APP_ID/.MainActivity" 2>/dev/null || true

# ── Pre-Maestro: Handle dev-client flow via ADB (prevents gRPC driver crash) ──
# Maestro's UIAutomator2 driver crashes during bundle loading on WHPX due to
# resource contention. We handle launcher → Metro tap → bundle load → Continue
# entirely via ADB, so Maestro starts with a stable, loaded app.

# Step A: Wait for dev-client launcher OR auto-connected state
# On some AVDs (E2E_Device_2), the dev-client auto-discovers Metro and skips
# the launcher entirely, going straight to the dev tools sheet or sign-in screen.
SKIP_TO_BUNDLE=0
if ! wait_for_text "DEVELOPMENT" "$LAUNCHER_TIMEOUT"; then
  # Take a FRESH dump — the last dump from wait_for_text may be stale
  # (captured during loading, before the app settled on its final screen)
  sleep 2
  $ADB $DEVICE_FLAG shell uiautomator dump /sdcard/ui_dump.xml 2>/dev/null || true
  LAST_DUMP=$($ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null || echo "")
  if echo "$LAST_DUMP" | grep -q "Reload\|Connected to\|Loading from"; then
    echo "[seed-and-run] App auto-connected to Metro (skipped launcher). Proceeding to bundle phase."
    SKIP_TO_BUNDLE=1
  elif echo "$LAST_DUMP" | grep -q "Welcome back\|Welcome to MentoMate\|sign-in-button"; then
    echo "[seed-and-run] FATAL: App opened the embedded sign-in bundle without showing the dev-client launcher or Metro connection." >&2
    echo "[seed-and-run] This is unsafe for E2E because it may run stale JS from the APK. Reinstall a current dev-client APK or launch through the dev-client Metro entry." >&2
    exit 1
  elif echo "$LAST_DUMP" | grep -q "DEVELOPMENT"; then
    # Launcher appeared just after the timeout — treat as normal launcher path
    echo "[seed-and-run] Launcher appeared just after timeout window — continuing."
  else
    # Dump is empty or shows home/crashed state: force-stop + relaunch once before giving up.
    # This handles WHPX emulator stalls where the app silently fails to render on first launch.
    DUMP_TEXTS=$(echo "$LAST_DUMP" | dump_visible_texts 10 || true)
    echo "[seed-and-run] Launcher not found (dump: [${DUMP_TEXTS:-empty}]). Force-stopping and relaunching ..." >&2
    $ADB $DEVICE_FLAG shell am force-stop "$APP_ID" 2>/dev/null || true
    sleep 3
    $ADB $DEVICE_FLAG shell am start -n "$APP_ID/.MainActivity" 2>/dev/null || true
    if wait_for_text "DEVELOPMENT" 20; then
      echo "[seed-and-run] Launcher appeared after relaunch — continuing."
    else
      sleep 2
      $ADB $DEVICE_FLAG shell uiautomator dump /sdcard/ui_dump.xml 2>/dev/null || true
      RETRY_DUMP=$($ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null || echo "")
      if echo "$RETRY_DUMP" | grep -q "Reload\|Connected to\|Loading from"; then
        echo "[seed-and-run] App auto-connected on relaunch. Proceeding to bundle phase."
        SKIP_TO_BUNDLE=1
      elif echo "$RETRY_DUMP" | grep -q "Welcome back\|Welcome to MentoMate\|sign-in-button"; then
        echo "[seed-and-run] FATAL: App opened the embedded sign-in bundle after relaunch without showing the dev-client launcher or Metro connection." >&2
        echo "[seed-and-run] This is unsafe for E2E because it may run stale JS from the APK. Reinstall a current dev-client APK or launch through the dev-client Metro entry." >&2
        exit 1
      else
        echo "[seed-and-run] FATAL: Dev-client launcher never appeared after relaunch. Is the APK installed?" >&2
        echo "[seed-and-run] Dump contents: $(echo "$RETRY_DUMP" | dump_visible_texts 10 || true)" >&2
        exit 1
      fi
    fi
  fi
fi

# Steps B and C only needed when launcher was shown (not auto-connected)
if [ $SKIP_TO_BUNDLE -eq 0 ]; then

  # Step B: Dismiss Bluetooth dialog if present (BUG-21 safety net)
  if $ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null | grep -q "Bluetooth"; then
    echo "[seed-and-run] Dismissing Bluetooth dialog via Back key ..."
    $ADB $DEVICE_FLAG shell input keyevent KEYCODE_BACK
    sleep 1
    # Re-wait for launcher after dismissing
    wait_for_text "DEVELOPMENT" 15 || true
  fi

  # Step C: Tap Metro server entry in launcher
  # Parse the dump to find the server entry's exact bounds.
  echo "[seed-and-run] Finding Metro server entry in UI dump ..."
  METRO_REQUESTED_PORT=$(echo "$METRO_URL" | sed -n 's#.*:\([0-9][0-9]*\).*#\1#p')
  METRO_BOUNDS=""
  if [ -n "$METRO_REQUESTED_PORT" ]; then
    for _ in 1 2 3 4 5; do
      $ADB $DEVICE_FLAG shell uiautomator dump /sdcard/ui_dump.xml 2>/dev/null || true
      METRO_BOUNDS=$($ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null \
        | first_bounds_for_text "^http://10\.0\.2\.2:${METRO_REQUESTED_PORT}$" || echo "")
      if [ -n "$METRO_BOUNDS" ]; then
        break
      fi
      sleep 2
    done
  fi
  if [ -z "$METRO_BOUNDS" ]; then
    METRO_BOUNDS=$($ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null \
      | first_bounds_for_text '^http://10\.0\.2\.2:8082$' || echo "")
  fi
  if [ -z "$METRO_BOUNDS" ] && [ "${METRO_REQUESTED_PORT:-}" != "8082" ]; then
    METRO_BOUNDS=$($ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null \
      | first_bounds_for_text '^http://10\.0\.2\.2:[0-9]+$' || echo "")
  fi
  # Fallback: after cold boot (no wipe), mDNS may resolve Metro as localhost
  if [ -z "$METRO_BOUNDS" ]; then
    METRO_BOUNDS=$($ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null \
      | first_bounds_for_text '^http://localhost:[0-9]+$' || echo "")
  fi
  if [ -n "$METRO_BOUNDS" ]; then
    X1=$(bounds_coord "$METRO_BOUNDS" 1)
    Y1=$(bounds_coord "$METRO_BOUNDS" 2)
    X2=$(bounds_coord "$METRO_BOUNDS" 3)
    Y2=$(bounds_coord "$METRO_BOUNDS" 4)
    X1=${X1:-0}; Y1=${Y1:-0}; X2=${X2:-0}; Y2=${Y2:-0}
    TAP_X=$(( (X1 + X2) / 2 ))
    TAP_Y=$(( (Y1 + Y2) / 2 ))
    # Expo dev-client rows can ignore taps on the URL text itself. Tap the
    # right side of the selected URL row while preserving that row's Y center.
    # Do not use the generic "Chevron" content-desc: with multiple servers it
    # can select the chevron from a different row.
    TAP_X=$(( X2 + 300 ))
    echo "[seed-and-run] Tapping Metro at ($TAP_X, $TAP_Y) ..."
    adb_tap $TAP_X $TAP_Y
  else
    echo "[seed-and-run] FATAL: No Metro server entry found in launcher!" >&2
    echo "[seed-and-run] Is Metro running? Check: curl http://localhost:8081/status" >&2
    exit 1
  fi
  sleep 1

fi  # end SKIP_TO_BUNDLE check

# Step D: Wait for bundle to load, then dismiss "Continue" overlay
# Cached bundle: ~5s. Cold bundle: up to 2 min.
# IMPORTANT: Only dismiss overlays by TAPPING the button (not Back key).
# Back key exits the app from navigation root (BUG-14).
echo "[seed-and-run] Waiting for bundle (max ${BUNDLE_TIMEOUT}s) ..."
BUNDLE_ELAPSED=0
CONTINUE_TAPPED=0
RELAUNCH_COUNT=0
while [ $BUNDLE_ELAPSED -lt $BUNDLE_TIMEOUT ]; do
  sleep 3
  BUNDLE_ELAPSED=$((BUNDLE_ELAPSED + 3))

  # Health check: bail if emulator died
  if ! $ADB $DEVICE_FLAG get-state 2>/dev/null | grep -q "device"; then
    echo "[seed-and-run] FATAL: Emulator died during bundle loading!" >&2
    exit 1
  fi

  # Try to dump UI hierarchy
  DUMP_OK=0
  DUMP=""
  if $ADB $DEVICE_FLAG shell uiautomator dump /sdcard/ui_dump.xml 2>/dev/null; then
    DUMP=$($ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null || echo "")
    if [ -n "$DUMP" ] && echo "$DUMP" | grep -q "node"; then
      DUMP_OK=1
    fi
  fi

  if [ $DUMP_OK -eq 1 ]; then
    # Already on sign-in screen?
    # Match either first-time ("Welcome to MentoMate") or returning ("Welcome back")
    # heading, OR the sign-in-button testID in the UI dump.
    if echo "$DUMP" | grep -q "Welcome back\|Welcome to MentoMate\|sign-in-button"; then
      echo "[seed-and-run] Sign-in screen reached after ${BUNDLE_ELAPSED}s!"
      break
    fi

    # Bundle is being fetched — Metro connection established, waiting for JS load.
    # "Connecting to the development server" and "Loading from" appear OVER the
    # launcher screen, so "DEVELOPMENT" is still in the hierarchy. Check these
    # first to avoid misclassifying as "still on launcher".
    if echo "$DUMP" | grep -q "Connecting to the development server\|Loading from"; then
      echo "[seed-and-run] Bundle loading (${BUNDLE_ELAPSED}s) ..."
      continue
    fi

    # Still on dev-client launcher — bundle not loaded yet
    if echo "$DUMP" | grep -q "DEVELOPMENT"; then
      echo "[seed-and-run] Still on launcher (${BUNDLE_ELAPSED}s) ..."
      if [ $((BUNDLE_ELAPSED % 9)) -eq 0 ]; then
        RETRY_METRO_BOUNDS=""
        if [ -n "${METRO_REQUESTED_PORT:-}" ]; then
          RETRY_METRO_BOUNDS=$(echo "$DUMP" | first_bounds_for_text "^http://10\.0\.2\.2:${METRO_REQUESTED_PORT}$" || echo "")
        fi
        if [ -z "$RETRY_METRO_BOUNDS" ]; then
          RETRY_METRO_BOUNDS=$(echo "$DUMP" | first_bounds_for_text '^http://10\.0\.2\.2:8082$' || echo "")
        fi
        if [ -n "$RETRY_METRO_BOUNDS" ]; then
          RX1=$(bounds_coord "$RETRY_METRO_BOUNDS" 1)
          RY1=$(bounds_coord "$RETRY_METRO_BOUNDS" 2)
          RX2=$(bounds_coord "$RETRY_METRO_BOUNDS" 3)
          RY2=$(bounds_coord "$RETRY_METRO_BOUNDS" 4)
          RX1=${RX1:-0}; RY1=${RY1:-0}; RX2=${RX2:-0}; RY2=${RY2:-0}
          RTX=$(( RX2 + 300 ))
          RTY=$(( (RY1 + RY2) / 2 ))
          echo "[seed-and-run] Retapping Metro at ($RTX, $RTY) ..."
          adb_tap $RTX $RTY
        fi
      fi
      continue
    fi

    # HARD FAIL: Error screen detected (Metro can't load bundle)
    if echo "$DUMP" | grep -q "problem loading\|Unable to load script\|Could not connect to development server"; then
      echo "[seed-and-run] FATAL: Bundle load error detected!" >&2
      ERROR_TEXT=$(echo "$DUMP" | dump_visible_texts 5 || true)
      echo "[seed-and-run] Error: ${ERROR_TEXT}" >&2
      echo "[seed-and-run] Check: Metro running? adb reverse set? Bundle proxy on 8082?" >&2
      exit 1
    fi

    # "Continue" button on dev menu overlay — TAP it (not Back!)
    # Match exact button text to avoid false positives.
    CONTINUE_BOUNDS=$(echo "$DUMP" | first_bounds_for_text '^Continue$' || echo "")
    if [ -n "$CONTINUE_BOUNDS" ] && [ $CONTINUE_TAPPED -lt 3 ]; then
      CX1=$(bounds_coord "$CONTINUE_BOUNDS" 1)
      CY1=$(bounds_coord "$CONTINUE_BOUNDS" 2)
      CX2=$(bounds_coord "$CONTINUE_BOUNDS" 3)
      CY2=$(bounds_coord "$CONTINUE_BOUNDS" 4)
      CX1=${CX1:-0}; CY1=${CY1:-0}; CX2=${CX2:-0}; CY2=${CY2:-0}
      CTX=$(( (CX1 + CX2) / 2 ))
      CTY=$(( (CY1 + CY2) / 2 ))
      echo "[seed-and-run] Tapping 'Continue' at ($CTX, $CTY) ..."
      adb_tap $CTX $CTY
      CONTINUE_TAPPED=$((CONTINUE_TAPPED + 1))
      sleep 2
      continue
    fi

    # Dev tools sheet ("Reload" visible) — tap Close button (not Back! BUG-14)
    # After tapping "Continue", the dev-client expands to show the full dev tools
    # menu (Reload, Go home, Performance monitor, etc.). The Close button (X) at
    # top-right dismisses the entire dev-client UI. Back key would exit the app.
    if echo "$DUMP" | grep -q '"Reload"'; then
      DEVTOOLS_CLOSE=${DEVTOOLS_CLOSE:-0}
      DEVTOOLS_CLOSE=$((DEVTOOLS_CLOSE + 1))
      if [ $DEVTOOLS_CLOSE -gt 3 ]; then
        echo "[seed-and-run] FATAL: Dev tools sheet won't dismiss after 3 Close taps." >&2
        exit 1
      fi
      CLOSE_BOUNDS=$(echo "$DUMP" | first_bounds_for_content_desc '^Close$' || echo "")
      if [ -n "$CLOSE_BOUNDS" ]; then
        CLX1=$(bounds_coord "$CLOSE_BOUNDS" 1)
        CLY1=$(bounds_coord "$CLOSE_BOUNDS" 2)
        CLX2=$(bounds_coord "$CLOSE_BOUNDS" 3)
        CLY2=$(bounds_coord "$CLOSE_BOUNDS" 4)
        CLX1=${CLX1:-0}; CLY1=${CLY1:-0}; CLX2=${CLX2:-0}; CLY2=${CLY2:-0}
        if [ "$CLX2" -gt 0 ] && [ "$CLY2" -gt 0 ]; then
          CLTX=$(( (CLX1 + CLX2) / 2 ))
          CLTY=$(( (CLY1 + CLY2) / 2 ))
          echo "[seed-and-run] Dev tools sheet detected, tapping Close at ($CLTX, $CLTY) (${DEVTOOLS_CLOSE}/3) ..."
          adb_tap $CLTX $CLTY
        else
          # BUG-14: Do NOT press Back — it exits the app from navigation root.
          # Retry the UI dump instead; the Close button may render on next poll.
          echo "[seed-and-run] Dev tools Close button bounds malformed ('$CLOSE_BOUNDS'), retrying dump ..." >&2
          sleep 1
          continue
        fi
      else
        # BUG-14: Do NOT press Back — it exits the app from navigation root.
        # Retry the UI dump; the Close button may appear on next poll cycle.
        echo "[seed-and-run] Dev tools sheet detected but Close button not found, retrying dump ..." >&2
        sleep 1
        continue
      fi
      sleep 1
      continue
    fi

    # ANR dialog ("isn't responding") — tap "Wait" to dismiss and keep waiting
    # WHPX emulators trigger ANR during React Native JS engine cold start after pm clear.
    if echo "$DUMP" | grep -q "isn't responding"; then
      ANR_WAIT_COUNT=${ANR_WAIT_COUNT:-0}
      ANR_WAIT_COUNT=$((ANR_WAIT_COUNT + 1))
      if [ $ANR_WAIT_COUNT -gt 5 ]; then
        echo "[seed-and-run] FATAL: ANR dialog appeared 5 times. App is stuck." >&2
        exit 1
      fi
      WAIT_BOUNDS=$(echo "$DUMP" | first_bounds_for_text '^Wait$' || echo "")
      if [ -n "$WAIT_BOUNDS" ]; then
        WX1=$(bounds_coord "$WAIT_BOUNDS" 1)
        WY1=$(bounds_coord "$WAIT_BOUNDS" 2)
        WX2=$(bounds_coord "$WAIT_BOUNDS" 3)
        WY2=$(bounds_coord "$WAIT_BOUNDS" 4)
        WX1=${WX1:-0}; WY1=${WY1:-0}; WX2=${WX2:-0}; WY2=${WY2:-0}
        WTX=$(( (WX1 + WX2) / 2 ))
        WTY=$(( (WY1 + WY2) / 2 ))
        echo "[seed-and-run] ANR dialog detected (${ANR_WAIT_COUNT}/5), tapping 'Wait' at ($WTX, $WTY) ..."
        adb_tap $WTX $WTY
      else
        echo "[seed-and-run] ANR dialog detected but 'Wait' button not found, pressing Back ..."
        $ADB $DEVICE_FLAG shell input keyevent KEYCODE_BACK
      fi
      sleep 3
      continue
    fi

    # App crashed to Android home — relaunch (limited attempts)
    if echo "$DUMP" | grep -q "com.google.android.apps.nexuslauncher\|com.android.launcher"; then
      RELAUNCH_COUNT=$((RELAUNCH_COUNT + 1))
      if [ $RELAUNCH_COUNT -gt $MAX_RELAUNCH ]; then
        echo "[seed-and-run] FATAL: App crashed ${MAX_RELAUNCH} times. Giving up." >&2
        exit 1
      fi
      echo "[seed-and-run] App crashed! Relaunch attempt ${RELAUNCH_COUNT}/${MAX_RELAUNCH} ..."
      $ADB $DEVICE_FLAG shell am start -n "$APP_ID/.MainActivity" 2>/dev/null || true
      sleep 3
      continue
    fi

    # Unknown state — log what's visible for diagnosis
    # NOTE: || true prevents set -euo pipefail from killing the script when grep
    # returns 1 (no text values in the dump, e.g., during React Native loading).
    VISIBLE_TEXTS=$(echo "$DUMP" | dump_visible_texts 5 || true)
    echo "[seed-and-run] Loading (${BUNDLE_ELAPSED}s) visible=[${VISIBLE_TEXTS:-empty}]"
  else
    # UI dump failed — likely overlay blocking uiautomator (OOM)
    echo "[seed-and-run] UI dump failed (${BUNDLE_ELAPSED}s) — React Native overlay likely loading"
  fi
done

if [ $BUNDLE_ELAPSED -ge $BUNDLE_TIMEOUT ]; then
  echo "[seed-and-run] FATAL: Bundle did not load within ${BUNDLE_TIMEOUT}s" >&2
  # Dump final state for diagnosis
  MSYS_NO_PATHCONV=1 $ADB $DEVICE_FLAG shell uiautomator dump /sdcard/ui_dump.xml 2>/dev/null || true
  FINAL_TEXTS=$($ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null | dump_visible_texts 10 || true)
  echo "[seed-and-run] Final screen: [${FINAL_TEXTS:-empty/no text}]" >&2
  exit 1
fi

echo "[seed-and-run] App on sign-in screen."

if [ $NO_SEED -eq 1 ]; then
  # ── No-seed mode: skip API seeding, run Maestro with minimal env vars ──
  echo "[seed-and-run] --no-seed mode: skipping seed API call."
  MAESTRO_ENV_ARGS=(
    -e "API_URL=${API_URL}"
    -e "METRO_URL=${METRO_URL}"
  )

  CMD=("${MAESTRO}" test "${MAESTRO_ENV_ARGS[@]}")
  if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
    CMD+=("${EXTRA_ARGS[@]}")
  fi
  CMD+=("${FLOW_FILE}")
  echo "[seed-and-run] Running: ${CMD[*]}"
  reset_maestro_driver
  exec "${CMD[@]}"
fi

# ── Step 1: Seed via API ──
echo "[seed-and-run] Seeding scenario='${SCENARIO}' email='${EMAIL}' ..."

# Use node to safely serialize JSON payload (prevents shell injection from EMAIL/SCENARIO)
SEED_PAYLOAD=$(node -e "process.stdout.write(JSON.stringify({scenario: process.argv[1], email: process.argv[2]}))" "$SCENARIO" "$EMAIL")
TEST_SECRET="${TEST_SEED_SECRET:-}"
SEED_RESPONSE=$(curl -sf -X POST "${API_URL}/v1/__test/seed" \
  -H "Content-Type: application/json" \
  ${TEST_SECRET:+-H "X-Test-Secret: ${TEST_SECRET}"} \
  -d "$SEED_PAYLOAD")

if [ -z "$SEED_RESPONSE" ]; then
  echo "[seed-and-run] ERROR: Seed API returned empty response" >&2
  exit 1
fi

# ── Step 2: Parse JSON response with Node.js (no jq on this machine) ──
SEED_EMAIL=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).email)" "$SEED_RESPONSE")
SEED_PASSWORD=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).password)" "$SEED_RESPONSE")
SEED_ACCOUNT_ID=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).accountId)" "$SEED_RESPONSE")
SEED_PROFILE_ID=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).profileId)" "$SEED_RESPONSE")

# Extract scenario-specific IDs (subjectId, topicId, sessionId, etc.)
SEED_IDS=$(node -e "
  const d = JSON.parse(process.argv[1]);
  const ids = d.ids || {};
  const parts = Object.entries(ids).map(([k,v]) => k + '=' + v);
  process.stdout.write(parts.join(' '));
" "$SEED_RESPONSE")

echo "[seed-and-run] Seeded: email=${SEED_EMAIL} account=${SEED_ACCOUNT_ID} profile=${SEED_PROFILE_ID}"

# ── Step 3: Run Maestro with seed results as env vars ──
# Flows access these as ${EMAIL}, ${PASSWORD}, ${ACCOUNT_ID}, ${PROFILE_ID}
# and scenario-specific IDs like ${SUBJECT_ID}, ${TOPIC_ID}, etc.
MAESTRO_ENV_ARGS=(
  -e "EMAIL=${SEED_EMAIL}"
  -e "PASSWORD=${SEED_PASSWORD}"
  -e "ACCOUNT_ID=${SEED_ACCOUNT_ID}"
  -e "PROFILE_ID=${SEED_PROFILE_ID}"
  -e "SCENARIO=${SCENARIO}"
  -e "API_URL=${API_URL}"
  -e "METRO_URL=${METRO_URL}"
)

# Add scenario-specific IDs as env vars (e.g., -e SUBJECT_ID=xxx -e TOPIC_ID=yyy)
if [ -n "$SEED_IDS" ]; then
  for pair in $SEED_IDS; do
    KEY=$(echo "$pair" | cut -d= -f1 | tr '[:lower:]' '[:upper:]' | sed 's/ID$//' | sed 's/$/ID/')
    # Actually, use the original camelCase key converted to UPPER_SNAKE_CASE
    KEY=$(node -e "process.stdout.write(process.argv[1].replace(/([A-Z])/g, '_\$1').toUpperCase())" "$(echo "$pair" | cut -d= -f1)")
    VAL=$(echo "$pair" | cut -d= -f2)
    MAESTRO_ENV_ARGS+=(-e "${KEY}=${VAL}")
  done
fi

CMD=("${MAESTRO}" test "${MAESTRO_ENV_ARGS[@]}")
if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
  CMD+=("${EXTRA_ARGS[@]}")
fi
CMD+=("${FLOW_FILE}")
echo "[seed-and-run] Running: ${CMD[*]}"

reset_maestro_driver
exec "${CMD[@]}"
