#!/usr/bin/env bash
# Seed test data via API, then run a Maestro flow against a RELEASE APK.
#
# This is the release-APK counterpart to seed-and-run.sh. The key difference:
# release APKs have no Metro, no dev-client launcher, no "Continue" overlay.
# The app boots directly into the sign-in screen (or splash → sign-in).
#
# Usage:
#   ./seed-and-run-release.sh <scenario> <flow-file> [maestro-args...]
#   ./seed-and-run-release.sh --no-seed <flow-file> [maestro-args...]
#
# Examples:
#   ./seed-and-run-release.sh onboarding-complete flows/account/settings-toggles.yaml
#   ./seed-and-run-release.sh learning-active flows/learning/core-learning.yaml
#   ./seed-and-run-release.sh --no-seed flows/onboarding/sign-up-flow.yaml
#
# Environment variables (optional):
#   API_URL          — API base URL (default: http://localhost:8787)
#   E2E_SEED_SLOT    — Reusable native seed slot (default: native-01; native-01..native-08)
#   EMAIL            — Explicit seed email override; requires E2E_ALLOW_ARBITRARY_EMAIL=1
#   E2E_ALLOW_ARBITRARY_EMAIL — Allow EMAIL override for one-off debug runs (default: 0)
#   MAESTRO_PATH     — Path to maestro binary (default: /c/tools/maestro/bin/maestro)
#   APP_TIMEOUT      — Seconds to wait for sign-in screen (default: 30)
#
# Prerequisites:
#   - Release APK installed on emulator/device (EAS preview profile):
#       eas build --profile preview --platform android
#       adb install path/to/app.apk
#   - API server running at API_URL (for seed + app API calls)
#   - Android emulator/device connected

set -euo pipefail

cleanup() {
  echo ""
  echo "[release] INTERRUPTED — exiting."
  exit 130
}
trap cleanup INT TERM

export MSYS_NO_PATHCONV=1

# ── Args ──
NO_SEED=0
if [ "${1:-}" = "--no-seed" ]; then
  NO_SEED=1
  shift
  SCENARIO="(none)"
  FLOW_FILE="${1:?Usage: seed-and-run-release.sh --no-seed <flow-file>}"
  shift
else
  SCENARIO="${1:?Usage: seed-and-run-release.sh <scenario> <flow-file>}"
  FLOW_FILE="${2:?Usage: seed-and-run-release.sh <scenario> <flow-file>}"
  shift 2
fi
EXTRA_ARGS=("$@")

# ── Config ──
API_URL="${API_URL:-http://localhost:8787}"
E2E_SEED_SLOT="${E2E_SEED_SLOT:-native-01}"
E2E_ALLOW_ARBITRARY_EMAIL="${E2E_ALLOW_ARBITRARY_EMAIL:-0}"
MAESTRO="${MAESTRO_PATH:-/c/tools/maestro/bin/maestro}"
ADB="${ADB_PATH:-/c/Android/Sdk/platform-tools/adb.exe}"
APP_ID="com.mentomate.app"
APP_TIMEOUT="${APP_TIMEOUT:-30}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../config-release.yaml"

export TEMP="${TEMP:-C:\\tools\\tmp}"
export TMP="${TMP:-C:\\tools\\tmp}"

# ── Helper: check emulator ──
check_emulator() {
  if ! $ADB get-state 2>/dev/null | grep -q "device"; then
    echo "[release] FATAL: No emulator/device connected!" >&2
    echo "[release] Run: adb devices" >&2
    exit 1
  fi
}

# ── Pre-flight ──
check_emulator
echo "[release] Device connected. Preparing release APK test..."

# ── Clear state + pre-grant permissions + launch ──
$ADB shell am force-stop "$APP_ID" 2>/dev/null || true
$ADB shell pm clear "$APP_ID" 2>/dev/null || true
$ADB shell am force-stop com.android.bluetooth 2>/dev/null || true
$ADB shell am force-stop dev.mobile.maestro 2>/dev/null || true
$ADB shell am force-stop dev.mobile.maestro.test 2>/dev/null || true
$ADB shell pm grant "$APP_ID" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
$ADB shell pm grant "$APP_ID" android.permission.CAMERA 2>/dev/null || true

# For release APKs hitting a local API (e.g., wrangler dev), forward ports.
# If the APK is configured for a remote API (staging), this is a no-op.
$ADB reverse tcp:8787 tcp:8787 2>/dev/null || true

sleep 1
echo "[release] Launching app..."
$ADB shell am start -n "$APP_ID/.MainActivity" 2>/dev/null || true

# ── Wait for sign-in screen ──
# Release APKs have no dev-client launcher or Metro connection.
# The app boots splash → auth in ~3-5 seconds on emulator.
echo "[release] Waiting for sign-in screen (max ${APP_TIMEOUT}s)..."
ELAPSED=0
while [ $ELAPSED -lt $APP_TIMEOUT ]; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))

  if ! $ADB get-state 2>/dev/null | grep -q "device"; then
    echo "[release] FATAL: Device disconnected!" >&2
    exit 1
  fi

  if $ADB shell uiautomator dump /sdcard/ui_dump.xml 2>/dev/null; then
    DUMP=$($ADB exec-out "cat /sdcard/ui_dump.xml" 2>/dev/null || echo "")
    if echo "$DUMP" | grep -q "sign-in-button\|Welcome to MentoMate\|Welcome back"; then
      echo "[release] Sign-in screen reached after ${ELAPSED}s."
      break
    fi

    # ANR dialog — tap Wait
    if echo "$DUMP" | grep -q "isn't responding"; then
      WAIT_BOUNDS=$(echo "$DUMP" | grep -oP '"Wait"[^>]*bounds="\K[^"]+' || echo "")
      if [ -n "$WAIT_BOUNDS" ]; then
        WX1=$(echo "$WAIT_BOUNDS" | grep -oP '\d+' | sed -n '1p')
        WY1=$(echo "$WAIT_BOUNDS" | grep -oP '\d+' | sed -n '2p')
        WX2=$(echo "$WAIT_BOUNDS" | grep -oP '\d+' | sed -n '3p')
        WY2=$(echo "$WAIT_BOUNDS" | grep -oP '\d+' | sed -n '4p')
        WX1=${WX1:-0}; WY1=${WY1:-0}; WX2=${WX2:-0}; WY2=${WY2:-0}
        $ADB shell input tap $(( (WX1 + WX2) / 2 )) $(( (WY1 + WY2) / 2 ))
      fi
      sleep 2
      continue
    fi

    VISIBLE=$(echo "$DUMP" | grep -oP 'text="\K[^"]+' | head -5 | tr '\n' ', ' || true)
    echo "[release] Loading (${ELAPSED}s) visible=[${VISIBLE:-empty}]"
  fi
done

if [ $ELAPSED -ge $APP_TIMEOUT ]; then
  echo "[release] FATAL: Sign-in screen not reached in ${APP_TIMEOUT}s" >&2
  exit 1
fi

# ── Seed (unless --no-seed) ──
if [ $NO_SEED -eq 1 ]; then
  echo "[release] --no-seed: skipping seed API."
  MAESTRO_ENV_ARGS=(-e "API_URL=${API_URL}")
  echo "[release] Running: ${MAESTRO} test --config ${CONFIG_FILE} ${FLOW_FILE}"
  "${MAESTRO}" test --config "${CONFIG_FILE}" "${MAESTRO_ENV_ARGS[@]}" "${EXTRA_ARGS[@]:+${EXTRA_ARGS[@]}}" "${FLOW_FILE}"
  exit "$?"
fi

if [ -n "${EMAIL+x}" ] && [ "${E2E_ALLOW_ARBITRARY_EMAIL}" != "1" ]; then
  echo "[release] ERROR: EMAIL override requires E2E_ALLOW_ARBITRARY_EMAIL=1." >&2
  echo "[release] Use E2E_SEED_SLOT=${E2E_SEED_SLOT} for ordinary reusable native seed users." >&2
  exit 1
fi

if [ -n "${EMAIL+x}" ]; then
  echo "[release] Seeding scenario='${SCENARIO}' email='${EMAIL}' (explicit override) ..."
  SEED_PAYLOAD=$(node -e "process.stdout.write(JSON.stringify({scenario: process.argv[1], email: process.argv[2]}))" "$SCENARIO" "$EMAIL")
else
  echo "[release] Seeding scenario='${SCENARIO}' nativeSeedSlot='${E2E_SEED_SLOT}' ..."
  SEED_PAYLOAD=$(node -e "process.stdout.write(JSON.stringify({scenario: process.argv[1], nativeSeedSlot: process.argv[2]}))" "$SCENARIO" "$E2E_SEED_SLOT")
fi
TEST_SECRET="${TEST_SEED_SECRET:-}"
SEED_RESPONSE=$(curl -sf -X POST "${API_URL}/v1/__test/seed" \
  -H "Content-Type: application/json" \
  ${TEST_SECRET:+-H "X-Test-Secret: ${TEST_SECRET}"} \
  -d "$SEED_PAYLOAD")

if [ -z "$SEED_RESPONSE" ]; then
  echo "[release] ERROR: Seed API returned empty response" >&2
  exit 1
fi

SEED_ENV_VALUES=$(node \
  "${SCRIPT_DIR}/seed-response-to-maestro-env.mjs" \
  "$SEED_RESPONSE")
SEED_EMAIL=""
MAESTRO_ENV_ARGS=(
  -e "SCENARIO=${SCENARIO}"
  -e "API_URL=${API_URL}"
)
while IFS= read -r pair; do
  [ -n "$pair" ] || continue
  if [[ "$pair" == EMAIL=* ]]; then
    SEED_EMAIL="${pair#EMAIL=}"
  fi
  MAESTRO_ENV_ARGS+=(-e "$pair")
done <<< "$SEED_ENV_VALUES"
if [ -z "$SEED_EMAIL" ]; then
  echo "[release] ERROR: Seed response did not contain EMAIL" >&2
  exit 1
fi
echo "[release] Seed prepared for scenario='${SCENARIO}'."

echo "[release] Running: ${MAESTRO} test --config ${CONFIG_FILE} ${FLOW_FILE}"
set +e
"${MAESTRO}" test --config "${CONFIG_FILE}" "${MAESTRO_ENV_ARGS[@]}" "${EXTRA_ARGS[@]:+${EXTRA_ARGS[@]}}" "${FLOW_FILE}"
MAESTRO_EXIT=$?
set -e

if [ -z "${EMAIL+x}" ]; then
  CLEANUP_PREFIX="${SEED_EMAIL%@*}"
  CLEANUP_PREFIX="${CLEANUP_PREFIX%%+*}"
  echo "[release] Cleaning seeded DB graph for native slot prefix='${CLEANUP_PREFIX}' (preserving Clerk user) ..."
  curl -sf -X POST "${API_URL}/v1/__test/reset?prefix=${CLEANUP_PREFIX}&preserveClerkUsers=true" \
    ${TEST_SECRET:+-H "X-Test-Secret: ${TEST_SECRET}"} \
    || echo "[release] WARN: native seed cleanup failed; rerun cleanup or next reseed will self-heal." >&2
fi

exit "$MAESTRO_EXIT"
