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
#
# Prerequisites:
#   - API server running at API_URL
#   - Android emulator running with dev-client APK
#   - Metro bundler + bundle proxy running
#   - TEMP/TMP set to ASCII paths (Windows Unicode workaround)

set -euo pipefail

# ── Args ──
SCENARIO="${1:?Usage: seed-and-run.sh <scenario> <flow-file> [maestro-args...]}"
FLOW_FILE="${2:?Usage: seed-and-run.sh <scenario> <flow-file> [maestro-args...]}"
shift 2
EXTRA_ARGS=("$@")

# ── Config ──
API_URL="${API_URL:-http://localhost:8787}"
EMAIL="${EMAIL:-test-e2e@example.com}"
MAESTRO="${MAESTRO_PATH:-/c/tools/maestro/bin/maestro}"

# ── Ensure TEMP/TMP are set (Maestro needs ASCII paths on Windows) ──
export TEMP="${TEMP:-C:\\tools\\tmp}"
export TMP="${TMP:-C:\\tools\\tmp}"

# ── Step 1: Seed via API ──
echo "[seed-and-run] Seeding scenario='${SCENARIO}' email='${EMAIL}' ..."

SEED_RESPONSE=$(curl -sf -X POST "${API_URL}/v1/__test/seed" \
  -H "Content-Type: application/json" \
  -d "{\"scenario\":\"${SCENARIO}\",\"email\":\"${EMAIL}\"}")

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
