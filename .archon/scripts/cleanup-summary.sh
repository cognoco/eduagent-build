#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

artifacts_dir="${1:?Usage: cleanup-summary.sh <ARTIFACTS_DIR>}"

wo="${artifacts_dir}/work-order.md"
progress="${artifacts_dir}/progress.md"
validation="${artifacts_dir}/validation.md"
findings_json="${artifacts_dir}/review/findings.json"
consolidated_review="${artifacts_dir}/review/consolidated-review.md"
fix_report="${artifacts_dir}/review/fix-report.md"
pr_number_file="${artifacts_dir}/.pr-number"
pr_url_file="${artifacts_dir}/.pr-url"
blocked_file="${artifacts_dir}/blocked.md"
summary_file="${artifacts_dir}/summary.md"

# ---------------------------------------------------------------------------
# Collect header fields
# ---------------------------------------------------------------------------
workflow_id="${WORKFLOW_ID:-unknown}"

pr_id="UNKNOWN"
cluster="unknown"
if [[ -f "$wo" ]]; then
    pr_id="$(grep -oE 'PR-[0-9]+' "$wo" | head -1 || echo "UNKNOWN")"
    cluster_raw="$(grep -i '| \*\*Cluster\*\* |' "$wo" | head -1 || echo "")"
    if [[ -n "$cluster_raw" ]]; then
        cluster="$(echo "$cluster_raw" | sed 's/.*| \*\*Cluster\*\* |[[:space:]]*//' | sed 's/[[:space:]]*|.*//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    fi
fi

pr_number="(not created)"
pr_url="(not created)"
[[ -f "$pr_number_file" ]] && pr_number="$(cat "$pr_number_file")"
[[ -f "$pr_url_file" ]] && pr_url="$(cat "$pr_url_file")"

# ---------------------------------------------------------------------------
# Build phases table from progress.md
# ---------------------------------------------------------------------------
phases_table=""
if [[ -f "$progress" ]]; then
    phases_table="| Phase | Status | Commit |"$'\n'
    phases_table+="|-------|--------|--------|"$'\n'
    # Parse phase blocks: "## Phase P1: Title — COMPLETED"
    while IFS= read -r line; do
        if [[ "$line" =~ ^##[[:space:]]Phase[[:space:]]+(P[0-9]+):[[:space:]](.+)[[:space:]]—[[:space:]]([A-Z]+) ]]; then
            phase_num="${BASH_REMATCH[1]}"
            phase_desc="${BASH_REMATCH[2]}"
            phase_status="${BASH_REMATCH[3]}"
            commit_hash="$(awk "/^## Phase ${phase_num}:/,/^---$/" "$progress" | grep '^Commit:' | head -1 | awk '{print $2}' || echo "")"
            if [[ -n "$commit_hash" ]]; then
                phases_table+="| ${phase_num}: ${phase_desc} | ${phase_status} | \`${commit_hash}\` |"$'\n'
            else
                phases_table+="| ${phase_num}: ${phase_desc} | ${phase_status} | — |"$'\n'
            fi
        fi
    done < "$progress"
fi
if [[ -z "$phases_table" ]]; then
    phases_table="(no phase data recorded)"
fi

# ---------------------------------------------------------------------------
# Blocked phases section
# ---------------------------------------------------------------------------
blocked_section=""
if [[ -f "$blocked_file" ]]; then
    blocked_section="$(cat "$blocked_file")"
fi

# ---------------------------------------------------------------------------
# Review section
# ---------------------------------------------------------------------------
verdict="UNKNOWN"
cnt_critical="0"
cnt_high="0"
cnt_medium="0"
cnt_low="0"
review_source="(none)"

if [[ -f "$findings_json" ]]; then
    review_source="findings.json"
    verdict="$(jq -r '.verdict // "UNKNOWN"' "$findings_json" 2>/dev/null || echo "UNKNOWN")"
    cnt_critical="$(jq '[.findings[] | select(.severity=="CRITICAL")] | length' "$findings_json" 2>/dev/null || echo "0")"
    cnt_high="$(jq '[.findings[] | select(.severity=="HIGH")] | length' "$findings_json" 2>/dev/null || echo "0")"
    cnt_medium="$(jq '[.findings[] | select(.severity=="MEDIUM")] | length' "$findings_json" 2>/dev/null || echo "0")"
    cnt_low="$(jq '[.findings[] | select(.severity=="LOW")] | length' "$findings_json" 2>/dev/null || echo "0")"
elif [[ -f "$consolidated_review" ]]; then
    review_source="consolidated-review.md"
    verdict="$(grep -oE 'Overall Verdict\*\*:[[:space:]]*[A-Z_]+' "$consolidated_review" | head -1 | grep -oE '[A-Z_]+$' || echo "UNKNOWN")"
    totals_row="$(grep -i 'Total' "$consolidated_review" | grep '|' | tail -1 || echo "")"
    if [[ -n "$totals_row" ]]; then
        cnt_critical="$(echo "$totals_row" | awk -F'|' '{print $3}' | tr -d ' *' || echo "?")"
        cnt_high="$(echo "$totals_row" | awk -F'|' '{print $4}' | tr -d ' *' || echo "?")"
        cnt_medium="$(echo "$totals_row" | awk -F'|' '{print $5}' | tr -d ' *' || echo "?")"
        cnt_low="$(echo "$totals_row" | awk -F'|' '{print $6}' | tr -d ' *' || echo "?")"
    fi
fi

# ---------------------------------------------------------------------------
# Fix report section
# ---------------------------------------------------------------------------
fix_status="(no fix report)"
fix_critical=""
fix_high=""
if [[ -f "$fix_report" ]]; then
    fix_status_raw="$(grep -E '^\*\*Status\*\*:' "$fix_report" | head -1 || echo "")"
    if [[ -n "$fix_status_raw" ]]; then
        fix_status="$(echo "$fix_status_raw" | sed 's/\*\*Status\*\*:[[:space:]]*//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    fi
    # Extract CRITICAL and HIGH fix counts from lines like "### CRITICAL Fixes (0/0)"
    critical_line="$(grep -oE 'CRITICAL Fixes \([0-9]+/[0-9]+\)' "$fix_report" | head -1 || echo "")"
    high_line="$(grep -oE 'HIGH Fixes \([0-9]+/[0-9]+\)' "$fix_report" | head -1 || echo "")"
    [[ -n "$critical_line" ]] && fix_critical="$(echo "$critical_line" | grep -oE '\([0-9]+/[0-9]+\)' | tr -d '()')"
    [[ -n "$high_line" ]] && fix_high="$(echo "$high_line" | grep -oE '\([0-9]+/[0-9]+\)' | tr -d '()')"
fi

# ---------------------------------------------------------------------------
# Validation section
# ---------------------------------------------------------------------------
validation_status="(no validation data)"
if [[ -f "$validation" ]]; then
    overall="$(grep -oE 'Status\*\*:[[:space:]]*[A-Z_]+' "$validation" | head -1 | grep -oE '[A-Z_]+$' || echo "")"
    if [[ -n "$overall" ]]; then
        validation_status="Overall: **${overall}**"
    fi
    # Add per-check results
    check_rows="$(grep '^|' "$validation" | grep -v '^|[-|]*$' | grep -v '^| Check ' || echo "")"
    if [[ -n "$check_rows" ]]; then
        validation_status+=$'\n'"$check_rows"
    fi
fi

# ---------------------------------------------------------------------------
# Assemble summary
# ---------------------------------------------------------------------------
summary_content="## Workflow Summary

**Workflow ID**: ${workflow_id}
**Plan**: \`docs/audit/cleanup-plan.md\` -> ${pr_id} / ${cluster}
**PR**: #${pr_number} (${pr_url})

### Phases

${phases_table}"

if [[ -n "$blocked_section" ]]; then
    summary_content+=$'\n'"### Blocked Phases

${blocked_section}"
fi

summary_content+=$'\n'"### Review

**Source**: ${review_source}
**Verdict**: ${verdict}
| Severity | Count |
|----------|-------|
| CRITICAL | ${cnt_critical} |
| HIGH | ${cnt_high} |
| MEDIUM | ${cnt_medium} |
| LOW | ${cnt_low} |"

if [[ -f "$fix_report" ]]; then
    summary_content+=$'\n'$'\n'"### Fix Report

**Status**: ${fix_status}"
    [[ -n "$fix_critical" ]] && summary_content+=$'\n'"**CRITICAL fixed**: ${fix_critical}"
    [[ -n "$fix_high" ]] && summary_content+=$'\n'"**HIGH fixed**: ${fix_high}"
fi

summary_content+=$'\n'$'\n'"### Validation

${validation_status}"

# ---------------------------------------------------------------------------
# Write to file and stdout
# ---------------------------------------------------------------------------
printf '%s\n' "$summary_content" | tee "$summary_file"
