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

# Extract all backtick-wrapped paths that look like file paths (have a real
# extension) from the work-order. Covers both the Files Summary table and
# per-phase Files lists. Uses an anchored extension regex so top-level files
# like CLAUDE.md are accepted alongside sub-paths like apps/foo.tsx, while
# glob-style tokens like tokens.colors.* are correctly rejected.
#
# The trailing `|| true` is NOT a fail-open pattern. Under `set -euo pipefail`,
# any grep in the chain that finds no matches exits 1, which (via pipefail)
# fails the whole pipeline and (via set -e) kills the script BEFORE the
# explicit empty-result check below runs. The `|| true` lets the pipeline
# produce an empty string on no-match so the diagnostic at line below can fire.
# The empty-allowed-files check IS the fail-closed gate.
allowed_files="$(grep -oE '\`[^`]+\`' "$wo" \
    | tr -d '`' \
    | grep -E '\.[a-zA-Z][a-zA-Z0-9]*$' \
    | sort -u || true)"

if [[ -z "$allowed_files" ]]; then
    echo "ERROR: no file paths found in work-order.md — failing closed" >&2
    echo "  (treating all files as allowed would silently disable the scope guard;" >&2
    echo "   most likely the work-order is malformed or the extraction grep matched nothing)" >&2
    exit 1
fi

# Validate may legitimately commit test-infrastructure fixes outside the
# work-order's claimed files (e.g., hardening a related test against
# cross-suite pollution exposed by --findRelatedTests). cleanup-validate.md
# Phase 3 writes those paths to .validate-allowed-extras; we union them in,
# but ONLY for files matching test-file patterns.
#
# MECHANICAL FILTER (not prompt-trust): we require the file name shape to
# prove the file is a test. If validate ever stages a production source
# file, scope-guard will still reject it — that forces a conversation
# rather than silently broadening trust through a prompt update.
#
# TRUST BOUNDARY: this union trusts validate's commit (filtered), NOT
# fix-locally's. fix-locally only fixes CRITICAL/HIGH reviewer findings,
# and reviewers only see the implement diff — so any legitimate
# fix-locally edit is already on a claimed file. If fix-locally trips
# scope-guard, that's a real signal of scope drift and we want it to
# surface. Do not extend this union to fix-locally without explicit
# discussion.
extras_file="${artifacts_dir}/.validate-allowed-extras"
if [[ -f "$extras_file" ]]; then
    extras="$(grep -v '^$' "$extras_file" \
        | grep -E '\.(test|spec)\.(ts|tsx)$' \
        | sort -u || true)"
    if [[ -n "$extras" ]]; then
        extras_count="$(echo "$extras" | wc -l | tr -d ' ')"
        allowed_files="$(printf '%s\n%s\n' "$allowed_files" "$extras" | sort -u)"
        echo "Scope guard: unioned ${extras_count} validate-fix test file(s) into allowed list"
    fi
    # Non-test entries in .validate-allowed-extras are intentionally dropped here;
    # if validate committed a non-test file, scope-guard will reject it on the
    # diff pass below.
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
if ! changed_files="$(git diff --name-only "${base}..HEAD" 2>/dev/null)"; then
    echo "ERROR: scope-guard: failed to diff against base ${base}" >&2
    exit 1
fi

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
    # Also try the alternate extension: in React Native, Foo.test.ts may
    # legitimately test a Foo.tsx component.
    is_test_sibling=false
    if [[ "$file" =~ \.(test|spec)\.(ts|tsx)$ ]]; then
        source_candidate="$(echo "$file" | sed -E 's/\.(test|spec)\.(ts|tsx)$/.\2/')"
        source_candidate_alt="$(echo "$file" | sed -E 's/\.(test|spec)\.tsx?$/.tsx/')"
        # Also require the test file to have existed at the diff base — the
        # implement constraint is "no NEW test files," so a brand-new sibling
        # should NOT pass this exemption just because its source is claimed.
        if (echo "$allowed_files" | grep -qxF "$source_candidate" \
            || echo "$allowed_files" | grep -qxF "$source_candidate_alt") \
           && git cat-file -e "${base}:${file}" 2>/dev/null; then
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

    # File a Notion P1 so the human gets a clear handoff instead of digging
    # for scope-violation.md in the artifacts dir. Best-effort: if Notion
    # filing fails, we still exit 1 with the original violation.
    pr_id="$(grep -oE 'PR-[0-9]+' "$wo" 2>/dev/null | head -1 || true)"
    pr_id="${pr_id:-unknown}"
    if [[ -d "${artifacts_dir}/review" ]]; then
        node_label="cleanup-scope-guard-post-fix"
    else
        node_label="cleanup-scope-guard-post-implement"
    fi
    {
        printf 'Workflow stopped: `%s` detected files changed that are not in the work-order.\n\n' "$node_label"
        printf '**Unexpected files:**\n\n'
        for f in "${violations[@]}"; do printf -- '- `%s`\n' "$f"; done
        printf '\n**Most likely cause:** the work-order'\''s Files-claimed list is incomplete. The implement / fix-locally step touched a file as a natural consequence of the change (e.g. updating an integration test that referenced a deleted path), but `docs/audit/cleanup-plan.md` does not list that file under %s.\n\n' "$pr_id"
        printf '**To resolve:**\n\n'
        printf '1. Read the full report: `%s`\n' "$violation_file"
        printf '2. Confirm the unexpected file(s) are legitimately part of this work.\n'
        printf '3. Add them to %s'\''s Files-claimed list in `docs/audit/cleanup-plan.md`.\n' "$pr_id"
        printf '4. Re-run the workflow.\n\n'
        printf '**Run artifacts:** `%s`\n' "$artifacts_dir"
    } > "${artifacts_dir}/scope-violation-followup-body.md"

    followup_script="$(dirname "${BASH_SOURCE[0]}")/append-followup.sh"
    if [[ -x "$followup_script" ]]; then
        "$followup_script" \
            --from "$node_label" \
            --pr "$pr_id" \
            --severity P1 \
            --platform CI \
            --title "Scope guard fired: work-order incomplete for ${pr_id}" \
            --body "$(cat "${artifacts_dir}/scope-violation-followup-body.md")" \
            >&2 \
            || echo "WARNING: follow-up filer failed; relying on stderr report and scope-violation.md only." >&2
    else
        echo "WARNING: append-followup.sh not executable; skipping Notion ticket." >&2
    fi

    exit 1
fi

echo "Scope guard: clean — ${allowed_count} files match work order"
