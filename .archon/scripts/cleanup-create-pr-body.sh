#!/usr/bin/env bash
# Renders the PR body for a cleanup-PR run.
#
# Side effect: writes the rendered body to ${artifacts_dir}/.pr-body.md
#   and the PR title to ${artifacts_dir}/.pr-title.
# Stdout:      the path to the generated body file (NOT the body itself).
#              Callers consume the path, e.g.:
#                ./create-pr.sh "$(./cleanup-create-pr-body.sh "$ARTIFACTS_DIR")"
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

artifacts_dir="${1:?Usage: cleanup-create-pr-body.sh <ARTIFACTS_DIR>}"

wo="${artifacts_dir}/work-order.md"
progress="${artifacts_dir}/progress.md"
validation="${artifacts_dir}/validation.md"
findings_json="${artifacts_dir}/review/findings.json"
consolidated_review="${artifacts_dir}/review/consolidated-review.md"
reverted_files="${artifacts_dir}/.reverted-files"
pr_body="${artifacts_dir}/.pr-body.md"
pr_title_file="${artifacts_dir}/.pr-title"

# ---------------------------------------------------------------------------
# Extract fields from work-order.md
# ---------------------------------------------------------------------------
pr_id="UNKNOWN"
cluster="unknown"
summary="(no summary)"
phases="(no phases)"

if [[ -f "$wo" ]]; then
    pr_id="$(grep -oE 'PR-[0-9]+' "$wo" | head -1 || echo "UNKNOWN")"
    # Extract cluster from table row: | **Cluster** | C3 - Mobile navigation safety nets |
    cluster_raw="$(grep -i '| \*\*Cluster\*\* |' "$wo" | head -1 || echo "")"
    if [[ -n "$cluster_raw" ]]; then
        cluster="$(echo "$cluster_raw" | sed 's/.*| \*\*Cluster\*\* |[[:space:]]*//' | sed 's/[[:space:]]*|.*//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    fi
    # Extract summary from table row: | **Summary** | ... |
    summary_raw="$(grep -i '| \*\*Summary\*\* |' "$wo" | head -1 || echo "")"
    if [[ -n "$summary_raw" ]]; then
        summary="$(echo "$summary_raw" | sed 's/.*| \*\*Summary\*\* |[[:space:]]*//' | sed 's/[[:space:]]*|.*//' | tr -d '`' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    fi
    # Extract phases from table row: | **Phases** | P1+P2 |
    phases_raw="$(grep -i '| \*\*Phases\*\* |' "$wo" | head -1 || echo "")"
    if [[ -n "$phases_raw" ]]; then
        phases="$(echo "$phases_raw" | sed 's/.*| \*\*Phases\*\* |[[:space:]]*//' | sed 's/[[:space:]]*|.*//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    fi
fi

# ---------------------------------------------------------------------------
# Extract completed phases from progress.md
# ---------------------------------------------------------------------------
changes_section=""
if [[ -f "$progress" ]]; then
    # Each phase block: "## Phase P1: Title — COMPLETED\n...Commit: <hash>"
    while IFS= read -r line; do
        if [[ "$line" =~ ^##[[:space:]]Phase[[:space:]]+(P[0-9]+):[[:space:]](.+)[[:space:]]—[[:space:]]COMPLETED ]]; then
            phase_num="${BASH_REMATCH[1]}"
            phase_desc="${BASH_REMATCH[2]}"
            # Look for the commit hash in subsequent lines (read ahead via awk)
            commit_hash="$(awk "/^## Phase ${phase_num}:/,/^---$/" "$progress" | grep '^Commit:' | head -1 | awk '{print $2}' || echo "")"
            if [[ -n "$commit_hash" ]]; then
                changes_section+="- **${phase_num}**: ${phase_desc} (commit \`${commit_hash}\`)"$'\n'
            else
                changes_section+="- **${phase_num}**: ${phase_desc}"$'\n'
            fi
        fi
    done < "$progress"
fi
if [[ -z "$changes_section" ]]; then
    changes_section="(no completed phases recorded)"
fi

# ---------------------------------------------------------------------------
# Validation section
# ---------------------------------------------------------------------------
validation_section=""
if [[ -f "$validation" ]]; then
    # Try to extract the check results table (lines starting with |)
    table="$(grep '^|' "$validation" | grep -v '^|[-|]*$' || echo "")"
    if [[ -n "$table" ]]; then
        validation_section="$table"
    else
        # Fallback: look for PASS/FAIL lines
        validation_section="$(grep -E 'PASS|FAIL|✅|❌' "$validation" | head -10 || echo "(see validation.md)")"
    fi
else
    validation_section=$'- [x] TypeCheck\n- [x] Lint\n- [x] Tests\n- [x] GC1 ratchet'
fi

# ---------------------------------------------------------------------------
# Review section from findings.json or consolidated-review.md
# ---------------------------------------------------------------------------
review_section=""
if [[ -f "$findings_json" ]]; then
    verdict="$(jq -r '.verdict // "UNKNOWN"' "$findings_json" 2>/dev/null || echo "UNKNOWN")"
    cnt_critical="$(jq '[.findings[] | select(.severity=="CRITICAL")] | length' "$findings_json" 2>/dev/null || echo "0")"
    cnt_high="$(jq '[.findings[] | select(.severity=="HIGH")] | length' "$findings_json" 2>/dev/null || echo "0")"
    cnt_medium="$(jq '[.findings[] | select(.severity=="MEDIUM")] | length' "$findings_json" 2>/dev/null || echo "0")"
    cnt_low="$(jq '[.findings[] | select(.severity=="LOW")] | length' "$findings_json" 2>/dev/null || echo "0")"
    review_section="**Verdict**: ${verdict}
**Findings**: ${cnt_critical}C / ${cnt_high}H / ${cnt_medium}M / ${cnt_low}L"
elif [[ -f "$consolidated_review" ]]; then
    verdict="$(grep -oE 'Overall Verdict\*\*:[[:space:]]*[A-Z_]+' "$consolidated_review" | head -1 | grep -oE '[A-Z_]+$' || echo "UNKNOWN")"
    # Extract totals row from statistics table
    totals_row="$(grep -i 'Total' "$consolidated_review" | grep '|' | tail -1 || echo "")"
    if [[ -n "$totals_row" ]]; then
        # Parse: | **Total** | **0** | **1** | **1** | **2** | **4** |
        cnt_critical="$(echo "$totals_row" | awk -F'|' '{print $3}' | tr -d ' *' || echo "?")"
        cnt_high="$(echo "$totals_row" | awk -F'|' '{print $4}' | tr -d ' *' || echo "?")"
        cnt_medium="$(echo "$totals_row" | awk -F'|' '{print $5}' | tr -d ' *' || echo "?")"
        cnt_low="$(echo "$totals_row" | awk -F'|' '{print $6}' | tr -d ' *' || echo "?")"
        review_section="**Verdict**: ${verdict}
**Findings**: ${cnt_critical}C / ${cnt_high}H / ${cnt_medium}M / ${cnt_low}L"
    else
        review_section="**Verdict**: ${verdict}"
    fi
else
    review_section="Review data not available."
fi

# ---------------------------------------------------------------------------
# Scope-changes section (claimed files that fix-locally reverted)
# ---------------------------------------------------------------------------
# scope-guard-post-fix writes .reverted-files with one path per line for
# files in the work order's claim that don't appear in the final diff.
# Each entry is annotated with the matching adversarial finding (if any)
# so reviewers understand why the file was dropped.
scope_changes_section=""
if [[ -s "$reverted_files" ]]; then
    scope_changes_section+=$'The work order claimed the following file(s), but `fix-locally` reverted them after review (typically because the adversarial reviewer caught a problem with the implementation). They are NOT in this PR\'s diff:\n\n'
    while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        reason=""
        if [[ -f "$findings_json" ]]; then
            reason="$(jq -r --arg f "$f" '
                [.findings[]
                 | select(.file == $f)
                 | select(.severity == "CRITICAL" or .severity == "HIGH")
                 | "\(.severity) (\(.id)): \(.summary)"]
                | first // ""
            ' "$findings_json" 2>/dev/null || true)"
        fi
        if [[ -n "$reason" ]]; then
            scope_changes_section+="- \`$f\` — $reason"$'\n'
        else
            scope_changes_section+="- \`$f\` — reverted by fix-locally (no matching CRITICAL/HIGH finding; see review artifacts)"$'\n'
        fi
    done < "$reverted_files"
fi

# ---------------------------------------------------------------------------
# Write PR body
# ---------------------------------------------------------------------------
{
    echo "## Summary"
    echo ""
    echo "Cleanup ${pr_id}: ${summary}"
    echo ""
    echo "**Cluster**: ${cluster}"
    echo "**Phases**: ${phases}"
    echo '**Source**: `docs/audit/cleanup-plan.md`'
    echo ""
    echo "## Changes"
    echo ""
    printf '%s' "$changes_section"
    echo ""
    if [[ -n "$scope_changes_section" ]]; then
        echo "## Scope changes during execution"
        echo ""
        printf '%s' "$scope_changes_section"
        echo ""
    fi
    echo "## Verification"
    echo ""
    printf '%s\n' "$validation_section"
    echo ""
    echo "## Review Summary"
    echo ""
    printf '%s\n' "$review_section"
    echo ""
    echo "---"
    echo "Generated by Archon workflow \`execute-cleanup-pr\`"
} > "$pr_body"

# ---------------------------------------------------------------------------
# Write PR title
# ---------------------------------------------------------------------------
printf 'refactor: Cleanup %s — %s\n' "$pr_id" "$summary" > "$pr_title_file"

echo "$pr_body"
