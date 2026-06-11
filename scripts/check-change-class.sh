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
#   0 — no validation needed, or advisory mode (validation identified but not run)
#   1 — a command failed (--run mode only)

set -euo pipefail

WORKSPACE_ROOT="$(git rev-parse --show-toplevel)"
source "$WORKSPACE_ROOT/scripts/lib/i18n-change-detection.sh"

# ── Config ───────────────────────────────────────────────────────────────
MODE="advisory"
SOURCE="auto"
SPEED_FILTER="all"
GITHUB_OUTPUT_MODE=0
BASE_UNRESOLVED=0

# ── State ────────────────────────────────────────────────────────────────
SEEN_CMDS=$'\n'
declare -a FAST_CMDS=()
declare -a SLOW_CMDS=()
declare -a NOTES=()
declare -a CLASSES=()
FILES=""

# ── Helpers ──────────────────────────────────────────────────────────────
add_cmd() {
  local speed="$1" cmd="$2" desc="$3"
  case "$SEEN_CMDS" in
    *$'\n'"$cmd"$'\n'*) return ;;
  esac
  SEEN_CMDS="${SEEN_CMDS}${cmd}"$'\n'
  if [[ "$speed" == "fast" ]]; then
    FAST_CMDS+=("$cmd|$desc")
  else
    SLOW_CMDS+=("$cmd|$desc")
  fi
}

note() {
  NOTES+=("$1")
}

join_unique_classes() {
  local seen=$'\n'
  local class
  local out=()
  for class in "${CLASSES[@]}"; do
    case "$seen" in
      *$'\n'"$class"$'\n'*) continue ;;
    esac
    seen="${seen}${class}"$'\n'
    out+=("$class")
  done
  echo "${out[*]}"
}

hit() {
  echo "$FILES" | grep -qE "$1" 2>/dev/null
}

filter_files() {
  echo "$FILES" | grep -E "$1" 2>/dev/null || true
}

# ── GitHub router output (WI-452) ────────────────────────────────────────
# With --github-output, emit machine-readable flags to $GITHUB_OUTPUT so CI
# steps can gate slow suites on the change-class matrix (the router) instead
# of maintaining parallel paths-filter blocks that drift from it.
#   classes=<csv>        all matched classes (or "unresolved" on fail-open)
#   integration=<bool>   matrix demands API/cross-package integration tests
#   eval=<bool>          matrix demands the LLM eval harness (Tier 1)
# Fail-open invariant: if no diff base resolves, the router cannot prove a
# slow suite unaffected, so it demands them ALL — never silently skips.
emit_github_output() {
  if [[ "$GITHUB_OUTPUT_MODE" != "1" ]]; then return 0; fi
  local out="${GITHUB_OUTPUT:-/dev/stdout}"
  if [[ "$BASE_UNRESOLVED" == "1" ]]; then
    echo "::warning::change-class router: no diff base resolved — failing OPEN (all slow suites run)"
    {
      echo "classes=unresolved"
      echo "integration=true"
      echo "eval=true"
    } >> "$out"
    return 0
  fi
  local classes integration=false eval_needed=false entry cmd
  classes=$(join_unique_classes | tr ' ' ',')
  if [[ ${#SLOW_CMDS[@]} -gt 0 ]]; then
    for entry in "${SLOW_CMDS[@]}"; do
      cmd="${entry%%|*}"
      if [[ "$cmd" == *test:api:integration* || "$cmd" == *"pnpm test:integration"* ]]; then
        integration=true
      fi
      if [[ "$cmd" == *eval:llm* ]]; then
        eval_needed=true
      fi
    done
  fi
  if [[ ${#FAST_CMDS[@]} -gt 0 ]]; then
    for entry in "${FAST_CMDS[@]}"; do
      cmd="${entry%%|*}"
      if [[ "$cmd" == *eval:llm* ]]; then
        eval_needed=true
      fi
    done
  fi
  {
    echo "classes=${classes}"
    echo "integration=${integration}"
    echo "eval=${eval_needed}"
  } >> "$out"
}

# ── Args ─────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --run)    MODE="run"; shift ;;
    --staged) SOURCE="staged"; shift ;;
    --branch) SOURCE="branch"; shift ;;
    --fast)   SPEED_FILTER="fast"; shift ;;
    --github-output) GITHUB_OUTPUT_MODE=1; shift ;;
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
      echo "  --staged          Check only staged files"
      echo "  --branch          Check all changes vs main (or vs origin/\$BASE_REF if set)"
      echo "  --run             Execute identified validation commands"
      echo "  --fast            With --run: skip slow commands"
      echo "  --github-output   Also emit router flags (classes, integration, eval)"
      echo "                    to \$GITHUB_OUTPUT for CI step gating (WI-452)"
      echo "  -h, --help        Show this help"
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
    # In CI, BASE_REF (the PR base branch) is explicit; locally fall back to
    # main. If neither resolves, flag it so --github-output can fail OPEN
    # (run the slow suites) instead of silently skipping them.
    if [[ -n "${BASE_REF:-}" ]] && git rev-parse --verify --quiet "origin/${BASE_REF}" >/dev/null; then
      BASE=$(git merge-base HEAD "origin/${BASE_REF}")
    elif BASE=$(git merge-base HEAD main 2>/dev/null); then
      :
    else
      BASE=""
      BASE_UNRESOLVED=1
    fi
    FILES=$([[ -n "$BASE" ]] && git diff --name-only --diff-filter=d "$BASE" || true)
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
  emit_github_output
  exit 0
fi

FILE_COUNT=$(echo "$FILES" | wc -l | tr -d ' ')

# ── TypeScript parity with Husky pre-commit ─────────────────────────────
# Husky runs `tsc --build` for any staged .ts/.tsx file. Keep validate aligned
# so type-broken agent output fails before the commit/push phase.
if hit '\.tsx?$'; then
  CLASSES+=("typescript")
  add_cmd fast "pnpm exec tsc --build" "Full incremental typecheck"
fi

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
# services/llm/ is matched recursively (providers/ subdirectory included) so
# the CI eval gate that routes on this class covers provider-level prompt
# assembly, matching the paths-filter it replaced (WI-452).
PROMPT_HITS=$(filter_files '(services/.*-prompts\.ts$|services/llm/.+\.ts$)' | grep -vE '\.test\.ts$' || true)
if [[ -n "$PROMPT_HITS" ]]; then
  CLASSES+=("llm-prompts")
  add_cmd fast  "pnpm eval:llm"              "Snapshot prompts (Tier 1 — no LLM call)"
  add_cmd slow  "pnpm eval:llm --live"       "Real LLM validation (Tier 2)"
  add_cmd slow  "pnpm test:llm:enduser"      "Live end-user LLM quality gate"
  note "llm-prompts: Pre-commit requires eval snapshot files staged with prompt changes"
fi

# ── LLM Commercial Routing ───────────────────────────────────────────────
ROUTING_HITS=$(filter_files '(services/llm/router\.ts$|services/session/session-exchange\.ts$|services/subscription\.ts$|scripts/premium-routing-pass\.ts$)' | grep -vE '\.test\.ts$' || true)
if [[ -n "$ROUTING_HITS" ]]; then
  CLASSES+=("llm-routing")
  add_cmd slow  "pnpm test:llm:premium-routing" "Live Plus/Family advanced-model routing gate"
fi

# ── LLM Book / Topic-Map Generation ─────────────────────────────────────
BOOK_GENERATION_HITS=$(filter_files '(packages/schemas/src/subjects\.ts$|services/book-generation\.ts$|services/book-suggestion-generation\.ts$|services/curriculum\.ts$|services/session/session-context-builders\.ts$|scripts/book-generation-pass\.ts$)' | grep -vE '\.test\.ts$' || true)
if [[ -n "$BOOK_GENERATION_HITS" ]]; then
  CLASSES+=("llm-book-generation")
  add_cmd slow  "pnpm test:llm:book-generation" "Live book/topic-map generation quality gate"
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
if i18n_delta_needs_checks "$FILES"; then
  CLASSES+=("i18n")
  add_cmd fast  "pnpm check:i18n:orphans"    "Orphan i18n key check"
  add_cmd fast  "pnpm check:i18n"            "i18n staleness check"
  note "i18n: Runs for mobile source changes because new t() calls can stale locale files"
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

# ── Dependencies / Lockfile ──────────────────────────────────────────────
# Parity with the old ci.yml dorny paths-filter, which included
# pnpm-lock.yaml in the integration-test gate: a lockfile change can shift
# transitive dependency behavior that only integration tests observe.
if hit '^pnpm-lock\.yaml$'; then
  CLASSES+=("dependencies")
  add_cmd slow  "pnpm test:api:integration"  "API integration tests (dependency change)"
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
  add_cmd slow  "doppler run -c stg -- pnpm test:e2e:web:smoke" "Playwright E2E smoke"
  note "e2e: Full web suite: doppler run -c stg -- pnpm test:e2e:web"
  note "e2e: Windows dev machines without doppler on PATH: C:/Tools/doppler/doppler.exe"
fi

# ── Lint / Tooling Config ────────────────────────────────────────────────
if hit '(eslint\.config|\.lintstagedrc|^\.husky/|tsconfig.*\.json$)'; then
  CLASSES+=("lint-config")
  add_cmd fast  "pnpm lint"                  "Full workspace lint"
  add_cmd fast  "pnpm exec tsc --build"      "Full incremental typecheck"
fi

# ── TypeScript Source ────────────────────────────────────────────────────
TS_SRC=$(filter_files '\.(ts|tsx)$' | grep -vE '\.test\.(ts|tsx)$|\.spec\.(ts|tsx)$|\.integration\.(ts|tsx)$' || true)
if [[ -n "$TS_SRC" ]]; then
  CLASSES+=("typescript")
  add_cmd fast  "pnpm exec tsc --build"      "Full incremental typecheck"
fi

# ── Retention Package ────────────────────────────────────────────────────
if hit '^packages/retention/src/'; then
  CLASSES+=("retention")
  add_cmd fast  "pnpm exec nx test retention" "Retention package tests"
  add_cmd fast  "pnpm test:api:unit"          "API unit tests (retention consumer)"
fi

# ── Eval Harness (code AND snapshots) ────────────────────────────────────
# Snapshots are included deliberately (WI-452): a hand-edited snapshot with
# no matching prompt change is exactly the drift `pnpm eval:llm` catches, and
# the CI eval gate routes on this class — excluding snapshots would let that
# edit skip the gate.
if hit '^apps/api/eval-llm/'; then
  CLASSES+=("eval-harness")
  add_cmd fast  "pnpm eval:llm"              "Verify eval harness runs clean"
fi

# ── Test Utilities ──────────────────────────────────────────────────────
if hit '^packages/test-utils/src/'; then
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
  emit_github_output
  exit 0
fi

emit_github_output

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Change Classes Detected"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Files:   $FILE_COUNT"
echo "  Classes: $(join_unique_classes)"
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
