#!/usr/bin/env bash
# check-change-class.sh — classify changed files and identify required validation
#
# Usage:
#   scripts/check-change-class.sh              # auto: staged → uncommitted → branch diff
#   scripts/check-change-class.sh --staged     # staged files only
#   scripts/check-change-class.sh --branch     # diff vs main
#   scripts/check-change-class.sh --run        # execute all identified validation
#   scripts/check-change-class.sh --run --fast  # execute only fast commands
#
# Exit codes:
#   0 — no validation needed, or all commands passed
#   1 — validation identified (advisory) or a command failed (--run)

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────
MODE="advisory"
SOURCE="auto"
SPEED_FILTER="all"

# ── State ────────────────────────────────────────────────────────────────
declare -A SEEN=()
declare -a FAST_CMDS=()
declare -a SLOW_CMDS=()
declare -a NOTES=()
declare -a CLASSES=()
FILES=""

# ── Helpers ──────────────────────────────────────────────────────────────
add_cmd() {
  local speed="$1" cmd="$2" desc="$3"
  [[ -n "${SEEN[$cmd]+_}" ]] && return
  SEEN[$cmd]=1
  if [[ "$speed" == "fast" ]]; then
    FAST_CMDS+=("$cmd|$desc")
  else
    SLOW_CMDS+=("$cmd|$desc")
  fi
}

note() {
  NOTES+=("$1")
}

hit() {
  echo "$FILES" | grep -qE "$1" 2>/dev/null
}

filter_files() {
  echo "$FILES" | grep -E "$1" 2>/dev/null || true
}

# ── Args ─────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --run)    MODE="run"; shift ;;
    --staged) SOURCE="staged"; shift ;;
    --branch) SOURCE="branch"; shift ;;
    --fast)   SPEED_FILTER="fast"; shift ;;
    -h|--help)
      echo "Usage: scripts/check-change-class.sh [--staged|--branch] [--run [--fast]]"
      echo ""
      echo "Classify changed files and identify required validation steps."
      echo "The script detects which 'change classes' your diff touches and"
      echo "prints the validation commands you should run."
      echo ""
      echo "File detection (auto mode, the default):"
      echo "  1. Staged files (git diff --cached)"
      echo "  2. Uncommitted changes (git diff)"
      echo "  3. Branch diff vs main (git merge-base)"
      echo ""
      echo "Options:"
      echo "  --staged   Check only staged files"
      echo "  --branch   Check all changes vs main"
      echo "  --run      Execute identified validation commands"
      echo "  --fast     With --run: skip slow commands"
      echo "  -h, --help Show this help"
      exit 0
      ;;
    *) echo "Unknown: $1 (try --help)" >&2; exit 1 ;;
  esac
done

# ── Detect changed files ────────────────────────────────────────────────
case "$SOURCE" in
  staged)
    FILES=$(git diff --cached --name-only --diff-filter=d)
    ;;
  branch)
    BASE=$(git merge-base HEAD main 2>/dev/null || echo "main")
    FILES=$(git diff --name-only --diff-filter=d "$BASE")
    ;;
  auto)
    FILES=$(git diff --cached --name-only --diff-filter=d)
    if [[ -z "$FILES" ]]; then
      FILES=$(git diff --name-only --diff-filter=d)
    fi
    if [[ -z "$FILES" ]]; then
      BASE=$(git merge-base HEAD main 2>/dev/null || echo "main")
      FILES=$(git diff --name-only --diff-filter=d "$BASE" 2>/dev/null || true)
    fi
    ;;
esac

if [[ -z "$FILES" ]]; then
  echo "No changed files detected."
  exit 0
fi

FILE_COUNT=$(echo "$FILES" | wc -l | tr -d ' ')

# ═════════════════════════════════════════════════════════════════════════
# CHANGE CLASS DEFINITIONS
#
# Each block:  pattern match → add_cmd (fast|slow) + note
# Commands are deduplicated — a file matching multiple classes won't
# produce duplicate commands.
# ═════════════════════════════════════════════════════════════════════════

# ── DB Schema ────────────────────────────────────────────────────────────
if hit '^packages/database/src/schema/'; then
  CLASSES+=("db-schema")
  add_cmd fast  "pnpm db:push:dev"          "Push schema to dev DB"
  add_cmd fast  "pnpm db:generate:dev"       "Generate migration SQL"
  add_cmd slow  "pnpm test:api:integration"  "API integration tests"
  note "db-schema: Never run db:push against staging/production"
fi

# ── DB Migrations ────────────────────────────────────────────────────────
if hit '^packages/database/drizzle/'; then
  CLASSES+=("db-migrations")
  add_cmd fast  "pnpm db:migrate:dev"        "Apply migration to dev DB"
  add_cmd slow  "pnpm test:api:integration"  "API integration tests"
  note "db-migrations: Apply migration BEFORE deploying code that reads new columns"
  note "db-migrations: Include Rollback section if dropping columns/tables/types"
fi

# ── LLM Prompts ──────────────────────────────────────────────────────────
PROMPT_HITS=$(filter_files '(services/.*-prompts\.ts$|services/llm/[^/]+\.ts$)' | grep -vE '\.test\.ts$' || true)
if [[ -n "$PROMPT_HITS" ]]; then
  CLASSES+=("llm-prompts")
  add_cmd fast  "pnpm eval:llm"              "Snapshot prompts (Tier 1 — no LLM call)"
  add_cmd slow  "pnpm eval:llm --live"       "Real LLM validation (Tier 2)"
  note "llm-prompts: Pre-commit requires eval snapshot files staged with prompt changes"
fi

# ── Inngest Functions ────────────────────────────────────────────────────
if hit '^apps/api/src/inngest/'; then
  CLASSES+=("inngest")
  add_cmd slow  "pnpm test:api:integration"  "API integration tests (async flows)"
  note "inngest: Verify Inngest dashboard sync after deploy (/v1/inngest)"
fi

# ── API Routes ───────────────────────────────────────────────────────────
if hit '^apps/api/src/routes/'; then
  CLASSES+=("api-routes")
  add_cmd fast  "pnpm test:api:unit"         "API unit tests"
  add_cmd slow  "pnpm test:api:integration"  "API integration tests"
fi

# ── API Middleware ────────────────────────────────────────────────────────
if hit '^apps/api/src/middleware/'; then
  CLASSES+=("api-middleware")
  add_cmd fast  "pnpm test:api:unit"         "API unit tests"
  add_cmd slow  "pnpm test:api:integration"  "API integration tests"
  note "api-middleware: Auth/billing middleware changes need break tests"
fi

# ── API Services (non-prompt) ────────────────────────────────────────────
API_SVC=$(filter_files '^apps/api/src/services/' | grep -vE '(-prompts\.ts$|/llm/[^/]+\.ts$)' || true)
if [[ -n "$API_SVC" ]]; then
  CLASSES+=("api-services")
  add_cmd fast  "pnpm test:api:unit"         "API unit tests"
fi

# ── Mobile Routes (Expo Router) ──────────────────────────────────────────
if hit '^apps/mobile/src/app/'; then
  CLASSES+=("mobile-routes")
  add_cmd fast  "pnpm test:mobile:unit"      "Mobile unit tests"
  note "mobile-routes: Nested layouts need unstable_settings = { initialRouteName: 'index' }"
  note "mobile-routes: Cross-tab router.push must include full ancestor chain"
fi

# ── Mobile Source (non-route) ────────────────────────────────────────────
MOBILE_SRC=$(filter_files '^apps/mobile/src/' | grep -vE '^apps/mobile/src/(app|i18n)/' || true)
if [[ -n "$MOBILE_SRC" ]]; then
  CLASSES+=("mobile-src")
  add_cmd fast  "pnpm test:mobile:unit"      "Mobile unit tests"
fi

# ── i18n ─────────────────────────────────────────────────────────────────
if hit '^apps/mobile/src/i18n/'; then
  CLASSES+=("i18n")
  add_cmd fast  "pnpm check:i18n"            "i18n staleness check"
  add_cmd fast  "pnpm check:i18n:orphans"    "Orphan i18n key check"
  note "i18n: Pre-commit enforces en.json staleness automatically"
fi

# ── Shared Schemas (@eduagent/schemas) ───────────────────────────────────
if hit '^packages/schemas/src/'; then
  CLASSES+=("shared-schemas")
  add_cmd fast  "pnpm test:api:unit"         "API unit tests (schema consumer)"
  add_cmd fast  "pnpm test:mobile:unit"      "Mobile unit tests (schema consumer)"
  add_cmd slow  "pnpm test:api:integration"  "API integration tests"
  add_cmd slow  "pnpm test:integration"      "Cross-package integration tests"
  note "shared-schemas: @eduagent/schemas is the shared contract — never redefine types locally"
fi

# ── Shared Database (non-schema) ─────────────────────────────────────────
DB_NON_SCHEMA=$(filter_files '^packages/database/src/' | grep -vE '^packages/database/src/schema/' || true)
if [[ -n "$DB_NON_SCHEMA" ]]; then
  CLASSES+=("shared-database")
  add_cmd fast  "pnpm test:api:unit"         "API unit tests"
  add_cmd slow  "pnpm test:api:integration"  "API integration tests"
fi

# ── Billing / Auth (security-sensitive) ──────────────────────────────────
if hit '(/billing/|/subscription/|/auth/|middleware/clerk)'; then
  CLASSES+=("security-sensitive")
  add_cmd slow  "pnpm test:api:integration"  "API integration tests"
  note "security-sensitive: CRITICAL/HIGH fixes need a break test (red-green regression)"
  note "security-sensitive: Silent catch-and-recover without metric/event is banned"
fi

# ── CI / Deploy ──────────────────────────────────────────────────────────
if hit '(^\.github/workflows/|wrangler\.toml$|^deploy\.yml$)'; then
  CLASSES+=("ci-deploy")
  note "ci-deploy: Manual review — check staging/prod credential separation"
  note "ci-deploy: Verify deploy targets match intended environment"
fi

# ── Expo Config ──────────────────────────────────────────────────────────
if hit '(^apps/mobile/app\.config\.|^eas\.json$)'; then
  CLASSES+=("expo-config")
  note "expo-config: May require a new EAS native build (check fingerprint)"
  note "expo-config: OTA updates cannot ship native config changes"
fi

# ── E2E Tests ────────────────────────────────────────────────────────────
if hit '(^tests/e2e/|^apps/mobile/e2e/|playwright\.config|\.e2e\.)'; then
  CLASSES+=("e2e")
  add_cmd slow  "C:/Tools/doppler/doppler.exe run -c stg -- pnpm test:e2e:web:smoke" "Playwright E2E smoke"
  note "e2e: Full web suite: C:/Tools/doppler/doppler.exe run -c stg -- pnpm test:e2e:web"
fi

# ── Lint / Tooling Config ────────────────────────────────────────────────
if hit '(eslint\.config|\.lintstagedrc|^\.husky/|tsconfig.*\.json$)'; then
  CLASSES+=("lint-config")
  add_cmd fast  "pnpm lint"                  "Full workspace lint"
  add_cmd fast  "pnpm exec tsc --build"      "Full incremental typecheck"
fi

# ── Retention Package ────────────────────────────────────────────────────
if hit '^packages/retention/src/'; then
  CLASSES+=("retention")
  add_cmd fast  "pnpm exec nx test retention" "Retention package tests"
  add_cmd fast  "pnpm test:api:unit"          "API unit tests (retention consumer)"
fi

# ── Eval Harness Code (not snapshots) ────────────────────────────────────
EVAL_CODE=$(filter_files '^apps/api/eval-llm/' | grep -vE '^apps/api/eval-llm/snapshots/' || true)
if [[ -n "$EVAL_CODE" ]]; then
  CLASSES+=("eval-harness")
  add_cmd fast  "pnpm eval:llm"              "Verify eval harness runs clean"
fi

# ── Test Utilities / Factory ─────────────────────────────────────────────
if hit '^packages/(test-utils|factory)/src/'; then
  CLASSES+=("test-infra")
  add_cmd fast  "pnpm test:api:unit"         "API unit tests (test helper consumer)"
  add_cmd fast  "pnpm test:mobile:unit"      "Mobile unit tests (test helper consumer)"
  add_cmd slow  "pnpm test:api:integration"  "API integration tests"
fi

# ═════════════════════════════════════════════════════════════════════════
# OUTPUT
# ═════════════════════════════════════════════════════════════════════════

if [[ ${#CLASSES[@]} -eq 0 ]]; then
  echo "No change classes matched ($FILE_COUNT file(s) checked)."
  echo "Pre-commit hooks (lint, tsc, surgical tests) cover these files."
  exit 0
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Change Classes Detected"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Files:   $FILE_COUNT"
echo "  Classes: ${CLASSES[*]}"
echo ""

# ── Advisory ─────────────────────────────────────────────────────────────
if [[ "$MODE" == "advisory" ]]; then
  if [[ ${#FAST_CMDS[@]} -gt 0 ]]; then
    echo "── Fast ───────────────────────────────────────────────────────"
    for entry in "${FAST_CMDS[@]}"; do
      cmd="${entry%%|*}"
      desc="${entry#*|}"
      printf "  %-45s %s\n" "$cmd" "$desc"
    done
    echo ""
  fi

  if [[ ${#SLOW_CMDS[@]} -gt 0 ]]; then
    echo "── Slow ───────────────────────────────────────────────────────"
    for entry in "${SLOW_CMDS[@]}"; do
      cmd="${entry%%|*}"
      desc="${entry#*|}"
      printf "  %-45s %s\n" "$cmd" "$desc"
    done
    echo ""
  fi

  if [[ ${#NOTES[@]} -gt 0 ]]; then
    echo "── Notes ──────────────────────────────────────────────────────"
    for n in "${NOTES[@]}"; do
      echo "  * $n"
    done
    echo ""
  fi

  echo "Run: scripts/check-change-class.sh --run"
  echo "     scripts/check-change-class.sh --run --fast  (skip slow)"
  exit 0
fi

# ── Run ──────────────────────────────────────────────────────────────────
PASSED=0
FAILED=0
SKIPPED=0
FAILURES=()

run_one() {
  local cmd="$1" desc="$2"
  echo ""
  echo "── Running: $cmd"
  echo "   $desc"
  echo "───────────────────────────────────────────────────────────────"
  if eval "$cmd"; then
    ((PASSED++)) || true
  else
    ((FAILED++)) || true
    FAILURES+=("$cmd")
  fi
}

for entry in "${FAST_CMDS[@]}"; do
  run_one "${entry%%|*}" "${entry#*|}"
done

if [[ "$SPEED_FILTER" == "all" ]]; then
  for entry in "${SLOW_CMDS[@]}"; do
    run_one "${entry%%|*}" "${entry#*|}"
  done
else
  SKIPPED=${#SLOW_CMDS[@]}
  if [[ $SKIPPED -gt 0 ]]; then
    echo ""
    echo "── Skipped (slow) ─────────────────────────────────────────────"
    for entry in "${SLOW_CMDS[@]}"; do
      echo "  ${entry%%|*}"
    done
  fi
fi

if [[ ${#NOTES[@]} -gt 0 ]]; then
  echo ""
  echo "── Notes ──────────────────────────────────────────────────────"
  for n in "${NOTES[@]}"; do
    echo "  * $n"
  done
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Results: $PASSED passed, $FAILED failed, $SKIPPED skipped"
echo "═══════════════════════════════════════════════════════════════"

if [[ $FAILED -gt 0 ]]; then
  echo ""
  echo "  Failed:"
  for f in "${FAILURES[@]}"; do
    echo "    x $f"
  done
  exit 1
fi
