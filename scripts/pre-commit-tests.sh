#!/usr/bin/env bash
# Surgical pre-commit tests — runs only tests related to staged files.
# Uses jest --findRelatedTests instead of nx affected to avoid the full build chain.
# See CLAUDE.md "Testing Rules" for details.

set -euo pipefail

WORKSPACE_ROOT="$(git rev-parse --show-toplevel)"

# Override tsconfig moduleResolution:"bundler" for ts-node (used by Jest to parse .ts/.cts configs).
# This mirrors what Nx sets in each project's test target env.
export TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}'

# Collect staged .ts/.tsx files (excludes deleted files)
STAGED_TS_FILES=$(git diff --cached --name-only --diff-filter=d -- '*.ts' '*.tsx')

if [ -z "$STAGED_TS_FILES" ]; then
  echo "pre-commit-tests: no .ts/.tsx files staged, skipping tests"
  exit 0
fi

FILE_COUNT=$(echo "$STAGED_TS_FILES" | wc -l | tr -d ' ')
echo "pre-commit-tests: $FILE_COUNT TypeScript file(s) staged"

# Bulk refactors — fall back to nx affected (excluding mobile for speed)
# Threshold raised from 20→50→100: @nx/expo plugin stack overflow on Windows
# prevents nx affected from running reliably (see project_nx_expo_plugin_bug).
# Surgical jest --findRelatedTests works fine at any count; prefer it.
if [ "$FILE_COUNT" -gt 100 ]; then
  echo "pre-commit-tests: >100 files staged, falling back to nx affected --exclude=mobile"
  NX_DAEMON=false pnpm exec nx affected -t test --base=HEAD --exclude=mobile
  exit $?
fi

# Classify files by project and collect per-config file lists
API_FILES=""
MOBILE_FILES=""
SCHEMAS_FILES=""
DATABASE_FILES=""
RETENTION_FILES=""
FACTORY_FILES=""

while IFS= read -r file; do
  case "$file" in
    apps/api/src/*)       API_FILES="$API_FILES $file" ;;
    apps/mobile/src/*)    MOBILE_FILES="$MOBILE_FILES $file" ;;
    packages/schemas/src/*)   SCHEMAS_FILES="$SCHEMAS_FILES $file" ;;
    packages/database/src/*)  DATABASE_FILES="$DATABASE_FILES $file" ;;
    packages/retention/src/*) RETENTION_FILES="$RETENTION_FILES $file" ;;
    packages/factory/src/*)   FACTORY_FILES="$FACTORY_FILES $file" ;;
    # Config, docs, etc. — no tests to run
    *) ;;
  esac
done <<< "$STAGED_TS_FILES"

FAILED=0

# Run jest from a project directory (required because ts-jest resolves tsconfig relative to cwd).
# All file paths are converted from workspace-root-relative to absolute.
run_jest() {
  local project_dir="$1"
  shift
  local files="$*"

  if [ -z "$files" ]; then
    return 0
  fi

  # Convert workspace-root-relative paths to absolute paths
  local abs_files=""
  for f in $files; do
    abs_files="$abs_files $WORKSPACE_ROOT/$f"
  done

  echo "pre-commit-tests: [${project_dir}] jest --findRelatedTests (${files})"
  # shellcheck disable=SC2086
  # --passWithNoTests: files like route screens or CSS may have no related tests;
  # without this flag, jest exits 1 and blocks the commit unnecessarily.
  if ! (cd "$WORKSPACE_ROOT/$project_dir" && pnpm exec jest --findRelatedTests $abs_files --no-coverage --bail --passWithNoTests --forceExit); then
    FAILED=1
  fi
}

# --- Package tests (own config) ---
# shellcheck disable=SC2086
run_jest packages/schemas $SCHEMAS_FILES
# shellcheck disable=SC2086
run_jest packages/database $DATABASE_FILES
# shellcheck disable=SC2086
run_jest packages/retention $RETENTION_FILES
# shellcheck disable=SC2086
run_jest packages/factory $FACTORY_FILES

# --- API tests ---
# API files + package files (cross-project propagation via moduleNameMapper)
API_PROPAGATED="$API_FILES $SCHEMAS_FILES $DATABASE_FILES $RETENTION_FILES"
# shellcheck disable=SC2086
run_jest apps/api $API_PROPAGATED

# --- Mobile tests (only when mobile files are staged) ---
# session/index.test.tsx runs after 70+ other suites in one worker and exceeds the
# default 4 GB V8 heap on Windows. Raise the limit to 6 GB so the worker survives.
if [ -n "$MOBILE_FILES" ]; then
  abs_mobile_files=""
  for f in $MOBILE_FILES; do
    abs_mobile_files="$abs_mobile_files $WORKSPACE_ROOT/$f"
  done
  echo "pre-commit-tests: [apps/mobile] jest --findRelatedTests ($MOBILE_FILES)"
  # shellcheck disable=SC2086
  if ! (cd "$WORKSPACE_ROOT/apps/mobile" && NODE_OPTIONS='--max-old-space-size=6144' pnpm exec jest --findRelatedTests $abs_mobile_files --no-coverage --bail --passWithNoTests --forceExit); then
    FAILED=1
  fi
fi

if [ "$FAILED" -ne 0 ]; then
  echo "pre-commit-tests: FAILED — fix failing tests before committing"
  exit 1
fi

echo "pre-commit-tests: all related tests passed"
