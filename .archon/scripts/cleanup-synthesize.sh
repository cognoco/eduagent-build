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
# 1.5 Determine risk class to know which reviewers were *expected* to run
# ---------------------------------------------------------------------------
# Archon's `when:` gates skip code-review + test-coverage when risk-class is
# 'tiny'. For any other class (or when the file is missing/unreadable —
# defensive default) we expect ALL three findings artifacts. Adversarial-review
# always runs regardless of risk class.
risk_class_file="${artifacts_dir}/risk-class.txt"
if [[ -r "$risk_class_file" ]]; then
    risk_class="$(tr -d '[:space:]' < "$risk_class_file" || true)"
else
    risk_class=""
fi
case "$risk_class" in
    tiny|normal|risky) ;;
    *)
        echo "WARNING: risk-class.txt missing or unreadable (got '${risk_class}') — defaulting to 'normal' (expects all reviewers)" >&2
        risk_class="normal"
        ;;
esac
echo "INFO: synthesize: risk_class=${risk_class}" >&2

# Build the list of expected artifacts based on risk class. Adversarial is
# always expected. Code-review + test-coverage are expected for normal/risky.
declare -a expected_files=("$adv_file")
if [[ "$risk_class" != "tiny" ]]; then
    expected_files+=("$cr_file" "$tc_file")
fi

# Reverse lookup so we can label a missing artifact in the synthetic finding.
artifact_label() {
    case "$1" in
        "$cr_file")  echo "code-review" ;;
        "$tc_file")  echo "test-coverage" ;;
        "$adv_file") echo "adversarial-review" ;;
        *)           echo "unknown-reviewer" ;;
    esac
}

# ---------------------------------------------------------------------------
# 2. Collect available input files + detect missing-but-expected ones
# ---------------------------------------------------------------------------
inputs=()
missing_expected=()  # reviewer labels for expected-but-missing artifacts
for f in "$cr_file" "$tc_file" "$adv_file"; do
    if [[ -f "$f" ]]; then
        inputs+=("$f")
        echo "Found: $f"
        continue
    fi
    # Was this artifact expected for the current risk class?
    is_expected=false
    for ef in "${expected_files[@]}"; do
        if [[ "$ef" == "$f" ]]; then
            is_expected=true
            break
        fi
    done
    if [[ "$is_expected" == true ]]; then
        label="$(artifact_label "$f")"
        echo "ERROR: expected reviewer artifact missing: ${f} (reviewer=${label})" >&2
        missing_expected+=("$label")
    else
        echo "INFO: ${f} not found — legitimately skipped for risk-class=${risk_class}" >&2
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
# 2.5 Build synthetic CRITICAL findings for any missing-but-expected artifact
# ---------------------------------------------------------------------------
# These are appended to the merged findings array below. Because they are
# CRITICAL, the existing verdict logic ("any CRITICAL → BLOCK") will naturally
# escalate the overall verdict to BLOCK — no need to override an existing
# real-finding BLOCK (CRITICAL findings are idempotent under the verdict
# computation; adding more CRITICALs cannot downgrade the verdict).
synthetic_findings_json='[]'
if [[ ${#missing_expected[@]} -gt 0 ]]; then
    synth_idx=0
    for label in "${missing_expected[@]}"; do
        synth_idx=$((synth_idx + 1))
        synthetic_findings_json="$(jq -c \
            --arg id "MISSING-ARTIFACT-${synth_idx}" \
            --arg label "$label" \
            --arg risk "$risk_class" \
            '. + [{
                id: $id,
                source: "synthesize",
                severity: "CRITICAL",
                category: "infrastructure",
                summary: ("Reviewer artifact missing: " + $label),
                file: "",
                line: 0,
                evidence: ("The " + $label + " reviewer was expected to run for risk-class=" + $risk + " but its findings JSON was not produced. The reviewer node likely failed, errored, or was skipped unexpectedly. Treating this PR as APPROVE without that reviewer would mask the failure."),
                suggested_fix: ("Investigate the " + $label + " node in the Archon run log (artifacts/runs/<run-id>/dag.log) and re-run the workflow once the underlying issue is resolved. Do not merge until the reviewer has produced findings."),
                deferrable: false
            }]' <<< "$synthetic_findings_json")"
    done
fi

# ---------------------------------------------------------------------------
# 3. Merge all findings arrays into one JSON document
# ---------------------------------------------------------------------------
if [[ ${#inputs[@]} -eq 0 && ${#missing_expected[@]} -eq 0 ]]; then
    # No real artifacts AND none were expected — only legitimate when ALL
    # reviewers were skipped, which shouldn't happen given adversarial is
    # always expected. Preserve original safe behaviour just in case.
    echo "WARNING: No review artifacts found and none were expected — writing empty findings with verdict APPROVE" >&2
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
    # Synthetic findings (for missing expected artifacts) are merged in via --argjson.
    #
    # Strategy:
    #   - reduce all input .findings arrays into one merged array, then append synthetics
    #   - determine verdict: BLOCK > REQUEST_CHANGES > APPROVE (any CRITICAL → BLOCK)
    jq_args=()
    jq_body=""
    idx=0
    for f in "${inputs[@]+"${inputs[@]}"}"; do
        jq_args+=(--slurpfile "inp${idx}" "$f")
        jq_body+=" + (\$inp${idx}[0].findings // [])"
        idx=$((idx + 1))
    done

    # The leading "+" trick: start with [] then concat each findings array,
    # then append the synthetic findings array (always defined, may be []).
    merged_findings_expr="([]${jq_body} + \$synthetic)"

    # Feed jq a null document so the slurpfile variables are accessible.
    # Use safe-expansion ${jq_args[@]+...} to tolerate empty arrays under set -u
    # (case: only synthetic findings, no real inputs).
    echo 'null' | jq "${jq_args[@]+"${jq_args[@]}"}" \
        --argjson synthetic "$synthetic_findings_json" \
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

# Synthesizer-emitted findings (e.g. MISSING-ARTIFACT). Without their own row,
# the per-source rows would not sum to the Total when synthetics fire.
syn_total="$(jq '[.findings[] | select(.source == "synthesize")] | length' "$out_json")"
syn_c="$(jq '[.findings[] | select(.source == "synthesize" and .severity == "CRITICAL")] | length' "$out_json")"
syn_h="$(jq '[.findings[] | select(.source == "synthesize" and .severity == "HIGH")] | length' "$out_json")"
syn_m="$(jq '[.findings[] | select(.source == "synthesize" and .severity == "MEDIUM")] | length' "$out_json")"
syn_l="$(jq '[.findings[] | select(.source == "synthesize" and .severity == "LOW")] | length' "$out_json")"

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
| Synthesized | ${syn_c} | ${syn_h} | ${syn_m} | ${syn_l} | ${syn_total} |
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
