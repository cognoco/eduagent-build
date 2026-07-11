#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="${MAESTRO_OUTPUT_DIR:-maestro-screenshots}"
SUITE="${MAESTRO_CI_SUITE:?MAESTRO_CI_SUITE is required}"
SHARD="${MAESTRO_CI_SHARD:?MAESTRO_CI_SHARD is required}"
SEED_SLOT="${E2E_SEED_SLOT:-native-0${SHARD}}"
HOST_API_URL="${CI_SEED_API_URL:-http://localhost:8787}"
DEVICE_API_URL="${API_URL:-http://10.0.2.2:8787}"
APP_ID="com.mentomate.app"
PLAN_FILE="$(mktemp)"
ACTIVE_SEED=0

mkdir -p "$OUTPUT_DIR"

capture_failure_artifacts() {
  adb exec-out screencap -p > "$OUTPUT_DIR/failure-final-state.png" || true
  adb logcat -d -t 500 > "$OUTPUT_DIR/logcat.txt" || true
}

cleanup() {
  status=$?
  if [ "$ACTIVE_SEED" -eq 1 ]; then
    reset_seed
  fi
  rm -f "$PLAN_FILE"
  if [ "$status" -ne 0 ]; then
    capture_failure_artifacts
  fi
}

# Preserve the failing command's status while collecting diagnostics. The
# android-emulator-runner action invokes this file once, so the trap and exit
# state share one shell process.
trap cleanup EXIT

node apps/mobile/e2e/scripts/ci-maestro-plan.mjs \
  --suite "$SUITE" \
  --shard "$SHARD" \
  --format tsv > "$PLAN_FILE"

FLOW_COUNT=$(wc -l < "$PLAN_FILE" | tr -d ' ')
TOTAL_FLOW_COUNT=$(node apps/mobile/e2e/scripts/ci-maestro-plan.mjs \
  --suite "$SUITE" --all --format json | \
  node -e 'let body=""; process.stdin.on("data", c => body += c); process.stdin.on("end", () => console.log(JSON.parse(body).length));')
if [ "$FLOW_COUNT" -eq 0 ]; then
  echo "[ci-maestro] ERROR: suite=$SUITE shard=$SHARD selected no flows" >&2
  exit 1
fi
echo "[ci-maestro] Selected shard $SHARD: $FLOW_COUNT of $TOTAL_FLOW_COUNT suite=$SUITE flows; seed-slot=$SEED_SLOT"

adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk

seed_flow() {
  local scenario="$1"
  local payload response
  local -a secret_header=()

  payload=$(node -e \
    'process.stdout.write(JSON.stringify({scenario: process.argv[1], nativeSeedSlot: process.argv[2]}))' \
    "$scenario" "$SEED_SLOT")
  if [ -n "${TEST_SEED_SECRET:-}" ]; then
    secret_header=(-H "X-Test-Secret: ${TEST_SEED_SECRET}")
  fi
  response=$(curl -fsS -X POST "${HOST_API_URL}/v1/__test/seed" \
    -H 'Content-Type: application/json' \
    "${secret_header[@]}" \
    -d "$payload")
  # The single-quoted program is JavaScript; its ${key} interpolation belongs
  # to Node, not this shell.
  # shellcheck disable=SC2016
  node -e '
    const data = JSON.parse(process.argv[1]);
    const values = {
      EMAIL: data.email,
      PASSWORD: data.password,
      ACCOUNT_ID: data.accountId,
      PROFILE_ID: data.profileId,
    };
    for (const [key, value] of Object.entries(data.ids ?? {})) {
      values[key.replace(/([A-Z])/g, "_$1").toUpperCase()] = value;
    }
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== null) console.log(`${key}=${value}`);
    }
  ' "$response"
}

reset_seed() {
  local -a secret_header=()
  if [ -n "${TEST_SEED_SECRET:-}" ]; then
    secret_header=(-H "X-Test-Secret: ${TEST_SEED_SECRET}")
  fi
  curl -fsS -X POST \
    "${HOST_API_URL}/v1/__test/reset?prefix=test-e2e-${SEED_SLOT}&preserveClerkUsers=true" \
    "${secret_header[@]}" >/dev/null || \
    echo "[ci-maestro] WARN: seed cleanup failed for $SEED_SLOT" >&2
  ACTIVE_SEED=0
}

wait_for_entry_screen() {
  local flow_output="$1"
  local elapsed=0
  local hierarchy

  while [ "$elapsed" -lt 45 ]; do
    if adb shell uiautomator dump /sdcard/ci-maestro-entry.xml >/dev/null 2>&1; then
      hierarchy=$(adb exec-out cat /sdcard/ci-maestro-entry.xml 2>/dev/null || true)
      if printf '%s' "$hierarchy" | grep -Eq 'welcome-chooser|sign-in-button'; then
        echo "[ci-maestro] Embedded app entry screen ready after ${elapsed}s"
        return 0
      fi
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  echo "[ci-maestro] ERROR: embedded app did not reach a pre-auth entry screen" >&2
  adb shell dumpsys activity activities > "$flow_output/launch-activity.txt" 2>&1 || true
  adb logcat -d -v threadtime > "$flow_output/launch-logcat.txt" 2>&1 || true
  return 1
}

run_flow() {
  local scenario="$1"
  local flow="$2"
  local flow_slug="${flow#flows/}"
  local flow_output="$OUTPUT_DIR/${flow_slug%.yaml}"
  local seed_values
  local -a maestro_env=(-e "API_URL=${DEVICE_API_URL}")

  if [ "$scenario" != '-' ]; then
    if ! seed_values=$(seed_flow "$scenario"); then
      echo "[ci-maestro] ERROR: failed to seed scenario=$scenario" >&2
      return 1
    fi
    ACTIVE_SEED=1
    while IFS= read -r pair; do
      maestro_env+=(-e "$pair")
    done <<< "$seed_values"
    maestro_env+=(-e "SCENARIO=${scenario}")
  fi

  mkdir -p "$flow_output"
  adb shell am force-stop "$APP_ID" >/dev/null 2>&1 || true
  adb shell pm clear "$APP_ID" >/dev/null 2>&1 || true
  adb shell pm grant "$APP_ID" android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true
  adb shell pm grant "$APP_ID" android.permission.CAMERA >/dev/null 2>&1 || true
  adb shell pm grant "$APP_ID" android.permission.RECORD_AUDIO >/dev/null 2>&1 || true
  adb logcat -c
  adb shell am start -W -n "$APP_ID/.MainActivity"
  if ! wait_for_entry_screen "$flow_output"; then
    return 1
  fi

  set +e
  maestro test "${maestro_env[@]}" "apps/mobile/e2e/${flow}" \
    --test-output-dir "$flow_output/"
  local status=$?
  set -e

  if [ "$scenario" != '-' ]; then
    reset_seed
  fi
  return "$status"
}

index=0
while IFS=$'\t' read -r scenario flow; do
  index=$((index + 1))
  echo "[ci-maestro] [$index/$FLOW_COUNT] scenario=$scenario flow=$flow"
  run_flow "$scenario" "$flow"
done < "$PLAN_FILE"
