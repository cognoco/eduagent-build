#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

# Emit exactly one of: tiny | normal | risky to stdout.
# All informational/diagnostic logging goes to stderr.
#
# Inputs:
#   $1 = ARTIFACTS_DIR (must contain .pre-implement-sha; falls back to BASE_BRANCH)
#
# Reads:
#   .archon/config/risk-paths.json — sensitive path globs + thresholds
#   $ARTIFACTS_DIR/plan-review-verdict.txt (optional) — BLOCK forces risky
#
# Logic (max-of):
#   - Sensitive path match (auth/billing/migrations) → risky
#   - Diff over risky.min_files OR risky.min_lines → risky
#   - Plan-review BLOCK verdict → risky (overrides everything)
#   - Else: file_count <= tiny.max_files AND line_count <= tiny.max_lines AND no risk match → tiny
#   - Else: normal

artifacts_dir="${1:?Usage: cleanup-risk-class.sh <ARTIFACTS_DIR>}"

# ── Resolve config path relative to this script's location ──────────────
# The script may be invoked from a worktree root; the config lives at
# <repo>/.archon/config/risk-paths.json. Since scripts/ and config/ are
# siblings, we resolve relative to the script directory.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
config_path="${script_dir}/../config/risk-paths.json"

if [[ ! -f "$config_path" ]]; then
    echo "ERROR: risk-paths.json not found at ${config_path}" >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq is required but not on PATH" >&2
    exit 1
fi

# ── Determine base SHA for the diff ─────────────────────────────────────
pre_sha_file="${artifacts_dir}/.pre-implement-sha"
if [[ -f "$pre_sha_file" ]]; then
    base_sha="$(tr -d '[:space:]' < "$pre_sha_file")"
    echo "INFO: cleanup-risk-class: using pre-implement SHA as base: ${base_sha:0:8}" >&2
else
    base_sha="${BASE_BRANCH:-origin/main}"
    echo "WARNING: cleanup-risk-class: .pre-implement-sha not found — falling back to ${base_sha}" >&2
fi

# ── Compute changed files + line counts (insertions + deletions) ────────
changed_files="$(git diff --name-only "${base_sha}..HEAD" 2>/dev/null || true)"

if [[ -z "$changed_files" ]]; then
    file_count=0
else
    file_count="$(printf '%s\n' "$changed_files" | grep -c . || true)"
    file_count="${file_count:-0}"
fi

# Parse `git diff --shortstat` output, e.g.:
#   " 3 files changed, 42 insertions(+), 7 deletions(-)"
shortstat="$(git diff --shortstat "${base_sha}..HEAD" 2>/dev/null || true)"
insertions="$(printf '%s' "$shortstat" | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || true)"
deletions="$(printf '%s' "$shortstat" | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || true)"
insertions="${insertions:-0}"
deletions="${deletions:-0}"
line_count=$((insertions + deletions))

# ── Read risk globs from config ─────────────────────────────────────────
risk_globs="$(jq -r '[.auth[], .billing[], .migrations[]] | .[]' "$config_path")"

# ── Read thresholds ─────────────────────────────────────────────────────
tiny_max_files="$(jq -r '.thresholds.tiny.max_files'   "$config_path")"
tiny_max_lines="$(jq -r '.thresholds.tiny.max_lines'   "$config_path")"
risky_min_files="$(jq -r '.thresholds.risky.min_files' "$config_path")"
risky_min_lines="$(jq -r '.thresholds.risky.min_lines' "$config_path")"

# ── Match changed files against risk globs ──────────────────────────────
# Glob semantics: a config entry ending in `/**` matches any file whose
# path starts with the prefix (the prefix is the entry minus the trailing
# `/**`). Otherwise the entry must match the file path exactly.
matches_risk=false
matched_pattern=""
matched_file=""

if [[ -n "$changed_files" && -n "$risk_globs" ]]; then
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        while IFS= read -r pattern; do
            [[ -z "$pattern" ]] && continue
            if [[ "$pattern" == *"/**" ]]; then
                prefix="${pattern%/**}"
                if [[ "$file" == "$prefix"/* ]]; then
                    matches_risk=true
                    matched_pattern="$pattern"
                    matched_file="$file"
                    break 2
                fi
            else
                if [[ "$file" == "$pattern" ]]; then
                    matches_risk=true
                    matched_pattern="$pattern"
                    matched_file="$file"
                    break 2
                fi
            fi
        done <<< "$risk_globs"
    done <<< "$changed_files"
fi

# ── Apply max-of verdict logic ──────────────────────────────────────────
verdict="normal"

if [[ "$matches_risk" == true ]]; then
    verdict="risky"
elif (( file_count >= risky_min_files )) || (( line_count >= risky_min_lines )); then
    verdict="risky"
elif (( file_count <= tiny_max_files )) && (( line_count <= tiny_max_lines )); then
    verdict="tiny"
fi

# ── Plan-review BLOCK overrides any prior verdict (max-of upward) ───────
plan_review_file="${artifacts_dir}/plan-review-verdict.txt"
plan_review_block=false
if [[ -f "$plan_review_file" ]] && grep -q BLOCK "$plan_review_file"; then
    plan_review_block=true
    verdict="risky"
fi

# ── Diagnostic logging to stderr ────────────────────────────────────────
{
    echo "INFO: cleanup-risk-class: file_count=${file_count} line_count=${line_count}"
    if [[ "$matches_risk" == true ]]; then
        echo "INFO: cleanup-risk-class: risk-path match — pattern='${matched_pattern}' file='${matched_file}'"
    else
        echo "INFO: cleanup-risk-class: no risk-path match"
    fi
    if [[ "$plan_review_block" == true ]]; then
        echo "INFO: cleanup-risk-class: plan-review BLOCK present — forcing risky"
    fi
    echo "INFO: cleanup-risk-class: verdict=${verdict}"
} >&2

# ── Persist verdict to a file for downstream bash scripts ───────────────
# Archon exposes this script's stdout to YAML `when:` gates as
# $risk-class.output, but downstream bash scripts (e.g. cleanup-synthesize.sh)
# don't have access to that variable. Write the verdict to a known file so
# they can determine which reviewer artifacts are *expected* vs. legitimately
# skipped (tiny PRs skip code-review + test-coverage).
verdict_file="${artifacts_dir}/risk-class.txt"
if printf '%s\n' "$verdict" > "$verdict_file" 2>/dev/null; then
    echo "INFO: cleanup-risk-class: wrote verdict to ${verdict_file}" >&2
else
    echo "WARNING: cleanup-risk-class: failed to write ${verdict_file}" >&2
fi

# ── Single-line stdout output ───────────────────────────────────────────
echo "$verdict"
