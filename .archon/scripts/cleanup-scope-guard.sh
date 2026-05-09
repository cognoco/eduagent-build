#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

artifacts_dir="${1:?Usage: cleanup-scope-guard.sh <ARTIFACTS_DIR>}"
wo="${artifacts_dir}/work-order.md"

if [[ ! -f "$wo" ]]; then
    echo "ERROR: work-order.md not found at ${wo}" >&2
    exit 1
fi

# Extract all backtick-wrapped paths that look like file paths (contain / and .)
# from the work-order. Covers both the Files Summary table and per-phase Files lists.
allowed_files="$(grep -oE '\`[^`]+\`' "$wo" \
    | tr -d '`' \
    | grep '/' \
    | grep '\.' \
    | sort -u)"

if [[ -z "$allowed_files" ]]; then
    echo "WARNING: no file paths found in work-order.md — treating all files as allowed" >&2
    exit 0
fi

allowed_count="$(echo "$allowed_files" | wc -l | tr -d ' ')"

# Determine the base ref for the diff.
# Prefer the pre-implement SHA (saved by the install node) so we only
# check files changed by the implement loop, not the entire branch
# history. Falls back to origin/main for backwards compatibility.
pre_sha_file="${artifacts_dir}/.pre-implement-sha"
if [[ -f "$pre_sha_file" ]]; then
    base="$(cat "$pre_sha_file" | tr -d '[:space:]')"
    echo "Using pre-implement SHA as base: ${base:0:8}"
else
    base="${BASE_BRANCH:-origin/main}"
    echo "WARNING: .pre-implement-sha not found — falling back to ${base}" >&2
fi
changed_files="$(git diff --name-only "${base}..HEAD" 2>/dev/null || true)"

if [[ -z "$changed_files" ]]; then
    echo "Scope guard: clean — no files changed relative to ${base}"
    exit 0
fi

violations=()
while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    # Always allow workflow/agent config directories
    if [[ "$file" == .archon/* ]] || [[ "$file" == .claude/* ]] || [[ "$file" == .codex/* ]]; then
        continue
    fi

    # Check if file is in the allowed list
    if echo "$allowed_files" | grep -qxF "$file"; then
        continue
    fi

    # Allow test siblings of claimed source files.
    # If Foo.tsx is claimed, Foo.test.tsx and Foo.test.ts are implicitly allowed
    # (the implement loop is expected to update existing test siblings).
    is_test_sibling=false
    if [[ "$file" =~ \.(test|spec)\.(ts|tsx)$ ]]; then
        # Strip .test.tsx → .tsx, .test.ts → .ts, .spec.tsx → .tsx
        source_candidate="$(echo "$file" | sed -E 's/\.(test|spec)\.(ts|tsx)$/.\2/')"
        if echo "$allowed_files" | grep -qxF "$source_candidate"; then
            is_test_sibling=true
        fi
    fi
    if [[ "$is_test_sibling" == true ]]; then
        continue
    fi

    violations+=("$file")
done <<< "$changed_files"

if [[ ${#violations[@]} -gt 0 ]]; then
    violation_file="${artifacts_dir}/scope-violation.md"
    {
        echo "# Scope Violation Report"
        echo ""
        echo "**Generated**: $(date -u '+%Y-%m-%d %H:%M UTC')"
        echo "**Work Order**: ${wo}"
        echo ""
        echo "## Unexpected Files"
        echo ""
        echo "The following files were changed but are NOT listed in the work-order:"
        echo ""
        for f in "${violations[@]}"; do
            echo "- \`${f}\`"
        done
        echo ""
        echo "## Allowed Files (from work-order)"
        echo ""
        while IFS= read -r f; do
            echo "- \`${f}\`"
        done <<< "$allowed_files"
        echo ""
        echo "## Exempt Paths"
        echo ""
        echo "Files under \`.archon/\`, \`.claude/\`, \`.codex/\` are always allowed (workflow config)."
    } > "$violation_file"

    echo "ERROR: Scope violation — ${#violations[@]} unexpected file(s) changed:" >&2
    for f in "${violations[@]}"; do
        echo "  - ${f}" >&2
    done
    echo "Details written to: ${violation_file}" >&2
    exit 1
fi

echo "Scope guard: clean — ${allowed_count} files match work order"
