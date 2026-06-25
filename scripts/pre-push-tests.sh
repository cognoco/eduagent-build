#!/usr/bin/env bash
# pre-push-tests.sh — blocking pre-push validation on the push delta.
#
# Catches cross-file breakage that per-commit hooks miss when multiple
# commits are pushed together. Runs on the UNION of all files changed
# since the last push (or since origin/main for new branches).
#
# What this runs:
#   1. tsc --build (incremental — cross-file type errors)
#   2. jest --findRelatedTests per project on the delta
#   3. Change-class-specific fast checks (eval:llm, check:i18n)
#
# Database secrets: this pre-push hook intentionally does not wrap commands in
# Doppler. It ignores *.integration.test.* files; any local command that needs
# a real DATABASE_URL must be invoked by the caller with DATABASE_URL already in
# env, `doppler run -- ...`, or the @eduagent/test-utils resolver
# (DOPPLER_CLI override, PATH lookup, then platform install-path candidates).
#
# What pre-commit already covers (not duplicated here):
#   - Per-file lint (ESLint + Prettier via lint-staged)
#   - GC1 ratchet, eval snapshot guard, i18n staleness guard
#
# Skip with: git push --no-verify     (preferred — Git-native, used by tooling)
# Skip with: SKIP_PRE_PUSH=1 git push  (escape hatch for broken harness only;
#                                       emits a loud audit warning to stderr)
# Protected branches (skipped): main + PREPUSH_SKIP_BRANCHES

set -euo pipefail

WORKSPACE_ROOT="$(git rev-parse --show-toplevel)"
source "$WORKSPACE_ROOT/scripts/lib/i18n-change-detection.sh"

# ── Configuration ───────────────────────────────────────────────────────
PREPUSH_SKIP_BRANCHES="${PREPUSH_SKIP_BRANCHES:-main}"
ZERO_SHA="0000000000000000000000000000000000000000"

if [[ "${SKIP_PRE_PUSH:-}" == "1" ]]; then
  # [BUG-240] SKIP_PRE_PUSH is an escape hatch for emergency hotfixes when
  # the validation harness itself is broken (e.g. tsc OOM, jest haste-map
  # corruption, network failure during eval:llm). Use sparingly: every
  # bypass must be followed by a manual `pnpm exec nx run-many -t test` on
  # the pushed commit. The warning here writes a single audit line to the
  # terminal AND stderr so:
  #   - the operator who typed `SKIP_PRE_PUSH=1 git push` sees they were
  #     loud about bypassing the gate (no silent skip),
  #   - any wrapping script / CI capture that tees stderr can grep for
  #     "PRE-PUSH BYPASSED" to surface the bypass after the fact.
  # The supported way to skip cleanly is `git push --no-verify`; if you
  # find yourself reaching for SKIP_PRE_PUSH instead, fix the harness.
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
  sha="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
  echo "" >&2
  echo "================================================================" >&2
  echo "  WARNING: PRE-PUSH BYPASSED via SKIP_PRE_PUSH=1" >&2
  echo "  branch=${branch} sha=${sha} user=${USER:-unknown}" >&2
  echo "  Validation NOT run. Follow up with full nx test on the push." >&2
  echo "================================================================" >&2
  echo "" >&2
  exit 0
fi

# ts-node override (same as pre-commit-tests.sh)
export TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}'

# ── Phase 1: Compute delta from stdin ───────────────────────────────────
ALL_FILES=""
REFS_CHECKED=0
AFFECTED_BASE=""
AFFECTED_HEAD=""

while read -r local_ref local_sha remote_ref remote_sha; do
  # Branch deletion — nothing to validate
  if [[ "$local_sha" == "$ZERO_SHA" ]]; then
    continue
  fi

  branch="${remote_ref#refs/heads/}"

  # Skip protected branches
  for skip_branch in $PREPUSH_SKIP_BRANCHES; do
    if [[ "$branch" == "$skip_branch" ]]; then
      echo "pre-push: skipping protected branch '$branch'"
      continue 2
    fi
  done

  if [[ "$remote_sha" == "$ZERO_SHA" ]]; then
    # New remote branch: default to origin/main, but honor an existing local
    # upstream when the work branched from an integration branch such as
    # origin/new-llm. Otherwise the first push validates the entire integration
    # branch delta instead of this branch's actual change set.
    upstream_base="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
    if [[ -n "$upstream_base" ]]; then
      base="$upstream_base"
    else
      base="origin/main"
    fi
  else
    base="$remote_sha"
  fi

  if [[ -z "$AFFECTED_BASE" ]]; then
    AFFECTED_BASE="$base"
    AFFECTED_HEAD="$local_sha"
  fi

  ref_files=$(git diff --name-only --diff-filter=d "$base".."$local_sha" 2>/dev/null || true)
  if [[ -n "$ref_files" ]]; then
    ALL_FILES="$ALL_FILES
$ref_files"
  fi
  ((REFS_CHECKED++)) || true
done

if [[ "$REFS_CHECKED" -eq 0 ]]; then
  exit 0
fi

FILES=$(echo "$ALL_FILES" | sort -u | sed '/^$/d')

if [[ -z "$FILES" ]]; then
  echo "pre-push: no changed files in push delta, skipping"
  exit 0
fi

FILE_COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  Pre-push validation ($FILE_COUNT files in push delta)"
echo "══════════════════════════════════════════════════════════════"

# ── Phase 2: tsc --build (incremental typecheck) ───────────────────────
TS_FILES=$(echo "$FILES" | grep -E '\.(ts|tsx)$' || true)

if [[ -n "$TS_FILES" ]]; then
  TS_COUNT=$(echo "$TS_FILES" | wc -l | tr -d ' ')
  echo ""
  echo "── tsc --build (incremental) ─ $TS_COUNT TypeScript files ──────"
  if ! pnpm exec tsc --build; then
    echo ""
    echo "pre-push: FAILED — tsc --build found type errors"
    exit 1
  fi
  echo "pre-push: tsc --build passed"
fi

# ── Phase 3: Surgical jest per project ──────────────────────────────────

if [[ -z "$TS_FILES" ]]; then
  echo ""
  echo "pre-push: no TypeScript files in delta, skipping jest"
else
  TS_COUNT=$(echo "$TS_FILES" | wc -l | tr -d ' ')

  # >100 files: fall back to nx affected (same threshold as pre-commit)
  if [[ "$TS_COUNT" -gt 100 ]]; then
    echo ""
    echo "pre-push: >100 TS files in delta, falling back to nx affected --exclude=mobile"
    if ! NX_DAEMON=false pnpm exec nx affected -t test --base="$AFFECTED_BASE" --head="$AFFECTED_HEAD" --exclude=mobile; then
      echo ""
      echo "pre-push: FAILED — nx affected tests failed"
      exit 1
    fi
  else
    # Classify files by project
    API_FILES=""
    MOBILE_FILES=""
    SCHEMAS_FILES=""
    DATABASE_FILES=""
    RETENTION_FILES=""
    TEST_UTILS_FILES=""

    while IFS= read -r file; do
      case "$file" in
        apps/api/src/*)            API_FILES="$API_FILES $file" ;;
        apps/mobile/src/*)         MOBILE_FILES="$MOBILE_FILES $file" ;;
        packages/schemas/src/*)    SCHEMAS_FILES="$SCHEMAS_FILES $file" ;;
        packages/database/src/*)   DATABASE_FILES="$DATABASE_FILES $file" ;;
        packages/retention/src/*)  RETENTION_FILES="$RETENTION_FILES $file" ;;
        packages/test-utils/src/*) TEST_UTILS_FILES="$TEST_UTILS_FILES $file" ;;
        *) ;;
      esac
    done <<< "$TS_FILES"

    JEST_FAILED=0

    run_jest() {
      local project_dir="$1"
      shift
      local files="$*"

      if [[ -z "$files" ]]; then
        return 0
      fi

      local abs_files=""
      for f in $files; do
        abs_files="$abs_files $WORKSPACE_ROOT/$f"
      done

      echo ""
      echo "── jest [${project_dir}] ──────────────────────────────────────"
      # shellcheck disable=SC2086
      if ! (cd "$WORKSPACE_ROOT/$project_dir" && IDENTITY_V2_ENABLED=false pnpm exec jest --findRelatedTests $abs_files --no-coverage --bail --passWithNoTests --forceExit --testPathIgnorePatterns='\.integration\.test\.'); then
        JEST_FAILED=1
      fi
    }

    # Package tests (own jest config)
    # shellcheck disable=SC2086
    run_jest packages/schemas $SCHEMAS_FILES
    # shellcheck disable=SC2086
    run_jest packages/database $DATABASE_FILES
    # shellcheck disable=SC2086
    run_jest packages/retention $RETENTION_FILES
    # shellcheck disable=SC2086
    run_jest packages/test-utils $TEST_UTILS_FILES

    # API with cross-project propagation
    API_PROPAGATED="$API_FILES $SCHEMAS_FILES $DATABASE_FILES $RETENTION_FILES"
    # shellcheck disable=SC2086
    run_jest apps/api $API_PROPAGATED

    # Mobile with memory bump
    if [[ -n "$MOBILE_FILES" ]]; then
      mobile_files_for_jest=""
      for f in $MOBILE_FILES; do
        mobile_files_for_jest="$mobile_files_for_jest ${f#apps/mobile/}"
      done
      echo ""
      echo "── jest [apps/mobile] ─────────────────────────────────────────"
      # shellcheck disable=SC2086
      if ! (cd "$WORKSPACE_ROOT/apps/mobile" && NODE_OPTIONS='--max-old-space-size=6144' pnpm exec jest --findRelatedTests $mobile_files_for_jest --no-coverage --bail --passWithNoTests --forceExit --testPathIgnorePatterns='\.integration\.test\.'); then
        JEST_FAILED=1
      fi
    fi

    if [[ "$JEST_FAILED" -ne 0 ]]; then
      echo ""
      echo "pre-push: FAILED — fix failing tests before pushing"
      exit 1
    fi
  fi
fi

# ── Phase 4: Change-class fast checks ──────────────────────────────────

EVAL_RAN=0

# eval:llm — prompt files changed (non-test)
PROMPT_HITS=$(echo "$FILES" | grep -E '(services/.*-prompts\.ts$|services/llm/[^/]+\.ts$)' | grep -vE '\.test\.ts$' || true)
if [[ -n "$PROMPT_HITS" ]]; then
  echo ""
  echo "── eval:llm (prompt files in delta) ───────────────────────────"
  if ! pnpm eval:llm; then
    echo ""
    echo "pre-push: FAILED — eval:llm found issues"
    exit 1
  fi
  EVAL_RAN=1
fi

# eval:llm — eval harness code changed (non-snapshot), deduplicated
EVAL_CODE=$(echo "$FILES" | grep -E '^apps/api/eval-llm/' | grep -vE '^apps/api/eval-llm/snapshots/' || true)
if [[ -n "$EVAL_CODE" ]] && [[ "$EVAL_RAN" -eq 0 ]]; then
  echo ""
  echo "── eval:llm (harness code in delta) ───────────────────────────"
  if ! pnpm eval:llm; then
    echo ""
    echo "pre-push: FAILED — eval harness validation failed"
    exit 1
  fi
fi

# check:i18n — mobile source or locale files changed
if i18n_delta_needs_checks "$FILES"; then
  echo ""
  echo "── check:i18n (mobile source or i18n files in delta) ───────────"
  if ! pnpm check:i18n:orphans; then
    echo ""
    echo "pre-push: FAILED — orphan i18n key check failed"
    exit 1
  fi
  if ! pnpm check:i18n; then
    echo ""
    echo "pre-push: FAILED — i18n staleness check failed"
    exit 1
  fi
fi

# ── Done ────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  Pre-push validation passed ($FILE_COUNT files checked)"
echo "══════════════════════════════════════════════════════════════"
echo ""
