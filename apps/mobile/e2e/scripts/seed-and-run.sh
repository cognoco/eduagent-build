#!/usr/bin/env bash
# Seed test data via API, then run a Maestro flow with the seeded credentials.
#
# This script works around Issue 13 (Maestro 2.2.0 runScript __maestro undefined)
# by calling the seed API via curl + node (for JSON parsing), then passing the
# credentials to Maestro as environment variables.
#
# Usage:
#   ./seed-and-run.sh <scenario> <flow-file> [maestro-args...]
#
# Examples:
#   ./seed-and-run.sh onboarding-complete flows/account/settings-toggles.yaml
#   ./seed-and-run.sh learning-active flows/learning/core-learning.yaml
#   ./seed-and-run.sh retention-due flows/retention/recall-review.yaml --debug-output
#
# Environment variables (optional):
#   API_URL       — API base URL (default: http://localhost:8787)
#   EMAIL         — Test user email (default: test-e2e@example.com)
#   MAESTRO_PATH  — Path to maestro binary (default: /c/tools/maestro/bin/maestro)
#   METRO_URL     — Metro server URL for dev-client (default: http://10.0.2.2:8081)
#                   Use http://10.0.2.2:8082 for bundle proxy (BUG-7 workaround)
#
# Prerequisites:
#   - API server running at API_URL
#   - Android emulator running with dev-client APK
#   - Metro bundler + bundle proxy running
#   - TEMP/TMP set to ASCII paths (Windows Unicode workaround)

set -euo pipefail

# Prevent Git Bash (MSYS) from converting Unix paths like /sdcard/ to Windows paths.
# Without this, adb shell commands get mangled paths (e.g., /sdcard/ → C:/Program Files/Git/sdcard/).
export MSYS_NO_PATHCONV=1

# ── Args ──
SCENARIO="${1:?Usage: seed-and-run.sh <scenario> <flow-file> [maestro-args...]}"
FLOW_FILE="${2:?Usage: seed-and-run.sh <scenario> <flow-file> [maestro-args...]}"
shift 2
EXTRA_ARGS=("$@")

# ── Config ──
API_URL="${API_URL:-http://localhost:8787}"
EMAIL="${EMAIL:-test-e2e@example.com}"
MAESTRO="${MAESTRO_PATH:-/c/tools/maestro/bin/maestro}"
METRO_URL="${METRO_URL:-http://10.0.2.2:8081}"
ADB="${ADB_PATH:-/c/Android/Sdk/platform-tools/adb.exe}"
APP_ID="com.mentomate.app"

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

# ── Pre-step: Clear state + launch app via ADB (BUG-19) ──
# Maestro's launchApp (with or without clearState) fails intermittently on
# WHPX emulators, especially with concurrent sessions. Workaround: clear state
# and launch the app ourselves via ADB, then have Maestro start from
# the dev-client launcher screen (no launchApp step in flows).
# ── Helper: wait for text in UI hierarchy via screencap+OCR is too complex.
# Instead, poll uiautomator dump for specific text strings. ──
wait_for_text() {
  local text="$1"
  local timeout="${2:-120}"
  local elapsed=0
  echo "[seed-and-run] Waiting up to ${timeout}s for '${text}' ..."
  while [ $elapsed -lt $timeout ]; do
    # Dump UI hierarchy to device, then read via exec-out (avoids MSYS path mangling)
    if $ADB $DEVICE_FLAG shell uiautomator dump /sdcard/ui_dump.xml 2>/dev/null; then
      if $ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null | grep -q "$text"; then
        echo "[seed-and-run] Found '${text}' after ${elapsed}s"
        return 0
      fi
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  echo "[seed-and-run] WARNING: '${text}' not found after ${timeout}s, continuing anyway"
  return 1
}

# ── Helper: tap coordinates via ADB input ──
adb_tap() {
  $ADB $DEVICE_FLAG shell input tap "$1" "$2"
}

echo "[seed-and-run] Clearing app state and launching via ADB ..."
$ADB $DEVICE_FLAG shell am force-stop "$APP_ID" 2>/dev/null || true
$ADB $DEVICE_FLAG shell pm clear "$APP_ID" 2>/dev/null || true
# BUG-21: Kill Bluetooth to prevent "Bluetooth keeps stopping" dialog on WHPX
$ADB $DEVICE_FLAG shell am force-stop com.android.bluetooth 2>/dev/null || true
# BUG-22: Pre-grant notification permission so the dialog doesn't block UI
$ADB $DEVICE_FLAG shell pm grant "$APP_ID" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
sleep 2
$ADB $DEVICE_FLAG shell am start -n "$APP_ID/.MainActivity" 2>/dev/null || true

# ── Pre-Maestro: Handle dev-client flow via ADB (prevents gRPC driver crash) ──
# Maestro's UIAutomator2 driver crashes during bundle loading on WHPX due to
# resource contention. We handle launcher → Metro tap → bundle load → Continue
# entirely via ADB, so Maestro starts with a stable, loaded app.

# Step A: Wait for dev-client launcher
wait_for_text "DEVELOPMENT" 120 || true

# Step B: Dismiss Bluetooth dialog if present (BUG-21 safety net)
if $ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null | grep -q "Bluetooth"; then
  echo "[seed-and-run] Dismissing Bluetooth dialog ..."
  # "Close app" button is roughly at bottom-center of the dialog
  adb_tap 400 810
  sleep 2
  # Re-wait for launcher after dismissing
  wait_for_text "DEVELOPMENT" 30 || true
fi

# Step C: Tap Metro 8081 server entry using bounds from uiautomator dump
# The server list order is non-deterministic (mDNS discovery), so we
# parse the dump to find the 8081 entry's exact bounds.
echo "[seed-and-run] Finding Metro 8081 entry in UI dump ..."
METRO_BOUNDS=$($ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null \
  | grep -oP 'text="http://10.0.2.2:8081"[^/]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' \
  | grep -oP 'bounds="\K[^"]+' || echo "")
if [ -n "$METRO_BOUNDS" ]; then
  # Parse [x1,y1][x2,y2] and compute center
  X1=$(echo "$METRO_BOUNDS" | grep -oP '\d+' | sed -n '1p')
  Y1=$(echo "$METRO_BOUNDS" | grep -oP '\d+' | sed -n '2p')
  X2=$(echo "$METRO_BOUNDS" | grep -oP '\d+' | sed -n '3p')
  Y2=$(echo "$METRO_BOUNDS" | grep -oP '\d+' | sed -n '4p')
  TAP_X=$(( (X1 + X2) / 2 ))
  TAP_Y=$(( (Y1 + Y2) / 2 ))
  echo "[seed-and-run] Tapping Metro 8081 at ($TAP_X, $TAP_Y) ..."
  adb_tap $TAP_X $TAP_Y
else
  # Fallback: tap the first visible server entry (might be 8082)
  echo "[seed-and-run] WARNING: Could not find 8081 bounds, tapping first entry ..."
  FIRST_BOUNDS=$($ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null \
    | grep -oP 'text="http://10.0.2.2:[0-9]+"[^/]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' \
    | head -1 | grep -oP 'bounds="\K[^"]+' || echo "[72,564][1008,720]")
  X1=$(echo "$FIRST_BOUNDS" | grep -oP '\d+' | sed -n '1p')
  Y1=$(echo "$FIRST_BOUNDS" | grep -oP '\d+' | sed -n '2p')
  X2=$(echo "$FIRST_BOUNDS" | grep -oP '\d+' | sed -n '3p')
  Y2=$(echo "$FIRST_BOUNDS" | grep -oP '\d+' | sed -n '4p')
  adb_tap $(( (X1 + X2) / 2 )) $(( (Y1 + Y2) / 2 ))
fi
sleep 2

# Step D: Wait for bundle to load, then dismiss "Continue" overlay
# uiautomator dump is UNRELIABLE during the Continue overlay (React Native
# bottom sheet crashes the dump). Strategy: sleep → press Back → verify.
# Cached bundle: ~5s. Cold bundle: 1-5 min. We retry with escalating waits.
echo "[seed-and-run] Waiting for bundle to load ..."
for WAIT in 15 30 60 90 120; do
  echo "[seed-and-run] Sleeping ${WAIT}s for bundle ..."
  sleep $WAIT

  # Press Back to dismiss Continue overlay (if present)
  echo "[seed-and-run] Pressing Back to dismiss overlay ..."
  $ADB $DEVICE_FLAG shell input keyevent KEYCODE_BACK
  sleep 3

  # Check if we reached the sign-in screen
  if $ADB $DEVICE_FLAG shell uiautomator dump /sdcard/ui_dump.xml 2>/dev/null; then
    DUMP=$($ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null || echo "")
    if echo "$DUMP" | grep -q "Welcome back"; then
      echo "[seed-and-run] Sign-in screen reached!"
      break
    fi
    # If we see DEVELOPMENT again, the Back went too far (no overlay yet)
    # or the overlay wasn't showing. Need to re-tap Metro and wait more.
    if echo "$DUMP" | grep -q "DEVELOPMENT"; then
      echo "[seed-and-run] Back to launcher — bundle not ready yet, re-tapping Metro ..."
      # Re-parse 8081 bounds (may have changed)
      RETRY_BOUNDS=$(echo "$DUMP" \
        | grep -oP 'text="http://10.0.2.2:8081"[^/]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' \
        | grep -oP 'bounds="\K[^"]+' || echo "")
      if [ -n "$RETRY_BOUNDS" ]; then
        RX1=$(echo "$RETRY_BOUNDS" | grep -oP '\d+' | sed -n '1p')
        RY1=$(echo "$RETRY_BOUNDS" | grep -oP '\d+' | sed -n '2p')
        RX2=$(echo "$RETRY_BOUNDS" | grep -oP '\d+' | sed -n '3p')
        RY2=$(echo "$RETRY_BOUNDS" | grep -oP '\d+' | sed -n '4p')
        adb_tap $(( (RX1 + RX2) / 2 )) $(( (RY1 + RY2) / 2 ))
      fi
      continue
    fi
  fi
done

# Step E: Dismiss second dev tools sheet if present (BUG-14)
if $ADB $DEVICE_FLAG shell uiautomator dump /sdcard/ui_dump.xml 2>/dev/null; then
  if $ADB $DEVICE_FLAG exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null | grep -q "Reload"; then
    echo "[seed-and-run] Dismissing dev tools sheet via Back ..."
    $ADB $DEVICE_FLAG shell input keyevent KEYCODE_BACK
    sleep 2
  fi
fi

echo "[seed-and-run] App should be on sign-in screen. Starting Maestro ..."

# ── Step 1: Seed via API ──
echo "[seed-and-run] Seeding scenario='${SCENARIO}' email='${EMAIL}' ..."

# Use node to safely serialize JSON payload (prevents shell injection from EMAIL/SCENARIO)
SEED_PAYLOAD=$(node -e "process.stdout.write(JSON.stringify({scenario: process.argv[1], email: process.argv[2]}))" "$SCENARIO" "$EMAIL")
SEED_RESPONSE=$(curl -sf -X POST "${API_URL}/v1/__test/seed" \
  -H "Content-Type: application/json" \
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

echo "[seed-and-run] Running: ${MAESTRO} test ${MAESTRO_ENV_ARGS[*]} ${FLOW_FILE} ${EXTRA_ARGS[*]:-}"

exec "${MAESTRO}" test "${MAESTRO_ENV_ARGS[@]}" "${EXTRA_ARGS[@]:+${EXTRA_ARGS[@]}}" "${FLOW_FILE}"
