#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

artifacts_dir="${1:?Usage: cleanup-synthesize.sh <ARTIFACTS_DIR>}"
review_dir="${artifacts_dir}/review"

cr_file="${review_dir}/code-review-findings.json"
tc_file="${review_dir}/test-coverage-findings.json"
adv_file="${review_dir}/adversarial-findings.json"

out_json="${review_dir}/findings.json"
out_md="${review_dir}/consolidated-review.md"

# ---------------------------------------------------------------------------
# 1. Validate jq is available
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is required but not found in PATH." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# 2. Collect available input files
# ---------------------------------------------------------------------------
inputs=()
for f in "$cr_file" "$tc_file" "$adv_file"; do
    if [[ -f "$f" ]]; then
        inputs+=("$f")
        echo "Found: $f"
    else
        echo "WARNING: ${f} not found — skipping" >&2
    fi
done

# Extract pr_id from the first available input, or from work-order.md
pr_id="UNKNOWN"
for f in "${inputs[@]+"${inputs[@]}"}"; do
    candidate="$(jq -r '.pr_id // empty' "$f" 2>/dev/null || true)"
    if [[ -n "$candidate" && "$candidate" != "null" ]]; then
        pr_id="$candidate"
        break
    fi
done
if [[ "$pr_id" == "UNKNOWN" && -f "${artifacts_dir}/work-order.md" ]]; then
    candidate="$(grep -oE 'PR-[0-9]+' "${artifacts_dir}/work-order.md" | head -1 || true)"
    [[ -n "$candidate" ]] && pr_id="$candidate"
fi

generated_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# ---------------------------------------------------------------------------
# 3. Merge all findings arrays into one JSON document
# ---------------------------------------------------------------------------
if [[ ${#inputs[@]} -eq 0 ]]; then
    echo "WARNING: No review artifacts found — writing empty findings with verdict APPROVE" >&2
    jq -n \
        --arg generated_at "$generated_at" \
        --arg pr_id "$pr_id" \
        '{
            generated_at: $generated_at,
            pr_id: $pr_id,
            source: "synthesized",
            verdict: "APPROVE",
            findings: []
        }' > "$out_json"
else
    # Build a jq expression that slurps all input files and merges their findings arrays.
    # We pass each file as a separate --slurpfile argument so jq handles missing fields safely.
    #
    # Strategy:
    #   - reduce all input .findings arrays into one merged array
    #   - determine verdict: BLOCK > REQUEST_CHANGES > APPROVE
    jq_args=()
    jq_body=""
    idx=0
    for f in "${inputs[@]}"; do
        jq_args+=(--slurpfile "inp${idx}" "$f")
        jq_body+=" + (\$inp${idx}[0].findings // [])"
        idx=$((idx + 1))
    done

    # The leading "+" trick: start with [] then concat each findings array
    merged_findings_expr="([]${jq_body})"

    # Feed jq a null document so the slurpfile variables are accessible.
    # /dev/null produces EOF before jq reads any input, so the program never runs.
    echo 'null' | jq "${jq_args[@]}" \
        --arg generated_at "$generated_at" \
        --arg pr_id "$pr_id" \
        "
        ${merged_findings_expr} as \$all |
        (if (\$all | map(select(.severity == \"CRITICAL\")) | length) > 0 then \"BLOCK\"
         elif (\$all | map(select(.severity == \"HIGH\")) | length) > 0 then \"REQUEST_CHANGES\"
         else \"APPROVE\"
         end) as \$verdict |
        {
            generated_at: \$generated_at,
            pr_id: \$pr_id,
            source: \"synthesized\",
            verdict: \$verdict,
            findings: \$all
        }
        " > "$out_json"
fi

echo "Written: $out_json"

# ---------------------------------------------------------------------------
# 4. Render markdown consolidated review from the JSON
# ---------------------------------------------------------------------------

# Read counts for the summary table
total="$(jq '.findings | length' "$out_json")"
n_critical="$(jq '[.findings[] | select(.severity == "CRITICAL")] | length' "$out_json")"
n_high="$(jq '[.findings[] | select(.severity == "HIGH")] | length' "$out_json")"
n_medium="$(jq '[.findings[] | select(.severity == "MEDIUM")] | length' "$out_json")"
n_low="$(jq '[.findings[] | select(.severity == "LOW")] | length' "$out_json")"
verdict="$(jq -r '.verdict' "$out_json")"

# Per-source counts for statistics table
cr_total="$(jq '[.findings[] | select(.source == "code-review")] | length' "$out_json")"
cr_c="$(jq '[.findings[] | select(.source == "code-review" and .severity == "CRITICAL")] | length' "$out_json")"
cr_h="$(jq '[.findings[] | select(.source == "code-review" and .severity == "HIGH")] | length' "$out_json")"
cr_m="$(jq '[.findings[] | select(.source == "code-review" and .severity == "MEDIUM")] | length' "$out_json")"
cr_l="$(jq '[.findings[] | select(.source == "code-review" and .severity == "LOW")] | length' "$out_json")"

tc_total="$(jq '[.findings[] | select(.source == "test-coverage")] | length' "$out_json")"
tc_c="$(jq '[.findings[] | select(.source == "test-coverage" and .severity == "CRITICAL")] | length' "$out_json")"
tc_h="$(jq '[.findings[] | select(.source == "test-coverage" and .severity == "HIGH")] | length' "$out_json")"
tc_m="$(jq '[.findings[] | select(.source == "test-coverage" and .severity == "MEDIUM")] | length' "$out_json")"
tc_l="$(jq '[.findings[] | select(.source == "test-coverage" and .severity == "LOW")] | length' "$out_json")"

adv_total="$(jq '[.findings[] | select(.source == "adversarial")] | length' "$out_json")"
adv_c="$(jq '[.findings[] | select(.source == "adversarial" and .severity == "CRITICAL")] | length' "$out_json")"
adv_h="$(jq '[.findings[] | select(.source == "adversarial" and .severity == "HIGH")] | length' "$out_json")"
adv_m="$(jq '[.findings[] | select(.source == "adversarial" and .severity == "MEDIUM")] | length' "$out_json")"
adv_l="$(jq '[.findings[] | select(.source == "adversarial" and .severity == "LOW")] | length' "$out_json")"

# Render a findings section for one severity level
# Usage: render_severity_section <severity>
render_severity_section() {
    local sev="$1"
    jq -r --arg sev "$sev" '
        .findings[]
        | select(.severity == $sev)
        | "### [\(.id)] \(.summary)\n\n" +
          "**Source**: \(.source)  |  **Severity**: \(.severity)  |  **Category**: \(.category)\n" +
          "**File**: `\(.file)" + (if .line != null and .line != 0 then ":\(.line)" else "" end) + "`\n" +
          (if (.evidence // "") != "" then "\n**Evidence**:\n\(.evidence)\n" else "" end) +
          (if (.suggested_fix // "") != "" then "\n**Suggested fix**:\n\(.suggested_fix)\n" else "" end) +
          (if .deferrable then "\n> *Deferrable — may be addressed in a follow-up PR.*\n" else "" end) +
          "\n---"
    ' "$out_json"
}

{
    cat <<HEADER
# Consolidated Review: ${pr_id}

**Generated**: ${generated_at}
**Agents**: code-review, test-coverage, adversarial-review
**Total Findings**: ${total}

---

## Executive Summary

HEADER

    if [[ "$verdict" == "APPROVE" ]]; then
        echo "No CRITICAL or HIGH findings. The diff is ready to merge."
    elif [[ "$verdict" == "REQUEST_CHANGES" ]]; then
        echo "${n_high} HIGH finding(s) must be addressed before merge. ${n_medium} MEDIUM and ${n_low} LOW findings are deferred or optional."
    else
        echo "${n_critical} CRITICAL finding(s) BLOCK this PR. All must be resolved before merge. Additionally ${n_high} HIGH, ${n_medium} MEDIUM, and ${n_low} LOW findings were found."
    fi

    cat <<STATS

**Overall Verdict**: ${verdict}

---

## Statistics

| Agent | CRITICAL | HIGH | MEDIUM | LOW | Total |
|-------|----------|------|--------|-----|-------|
| Code Review | ${cr_c} | ${cr_h} | ${cr_m} | ${cr_l} | ${cr_total} |
| Test Coverage | ${tc_c} | ${tc_h} | ${tc_m} | ${tc_l} | ${tc_total} |
| Adversarial Review | ${adv_c} | ${adv_h} | ${adv_m} | ${adv_l} | ${adv_total} |
| **Total** | **${n_critical}** | **${n_high}** | **${n_medium}** | **${n_low}** | **${total}** |

---

STATS

    if [[ "$n_critical" -gt 0 ]]; then
        echo "## CRITICAL Issues (Must Fix)"
        echo ""
        render_severity_section "CRITICAL"
        echo ""
        echo "---"
        echo ""
    fi

    if [[ "$n_high" -gt 0 ]]; then
        echo "## HIGH Issues (Should Fix)"
        echo ""
        render_severity_section "HIGH"
        echo ""
        echo "---"
        echo ""
    fi

    if [[ "$n_medium" -gt 0 ]]; then
        echo "## MEDIUM Issues (For Consideration)"
        echo ""
        render_severity_section "MEDIUM"
        echo ""
        echo "---"
        echo ""
    fi

    if [[ "$n_low" -gt 0 ]]; then
        echo "## LOW Issues"
        echo ""
        render_severity_section "LOW"
        echo ""
        echo "---"
        echo ""
    fi

    cat <<FOOTER
## Agent Artifacts

| Agent | Artifact | Findings |
|-------|----------|----------|
| Code Review | \`code-review-findings.json\` | ${cr_total} |
| Test Coverage | \`test-coverage-findings.json\` | ${tc_total} |
| Adversarial Review | \`adversarial-findings.json\` | ${adv_total} |

---

## Metadata

- **Synthesized**: ${generated_at}
- **Source JSON**: \`${out_json}\`
- **GitHub posting**: deferred to \`cleanup-post-review-comments\`
FOOTER
} > "$out_md"

echo "Written: $out_md"

# ---------------------------------------------------------------------------
# 5. Summary to DAG log
# ---------------------------------------------------------------------------
echo ""
echo "=== Synthesis Complete ==="
echo "Verdict: ${verdict}"
echo "Findings: ${n_critical}C / ${n_high}H / ${n_medium}M / ${n_low}L (total: ${total})"
echo "JSON:     ${out_json}"
echo "Markdown: ${out_md}"
