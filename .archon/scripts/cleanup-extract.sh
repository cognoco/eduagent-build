#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

# Deterministic extraction of a cleanup-plan PR's work order.
#
# Usage: cleanup-extract.sh <PR-identifier> <ARTIFACTS_DIR>
#
# Parses docs/audit/cleanup-plan.md mechanically. Falls through (exit 1)
# with a structured error on unparseable input so the YAML node can
# fall back to the LLM-based cleanup-extract-pr command.
#
# Outputs:
#   $ARTIFACTS_DIR/work-order.md   — full work order (same format as LLM version)
#   $ARTIFACTS_DIR/patterns.md     — sibling-shape hints per claimed file
#   $ARTIFACTS_DIR/rules-digest.md — focused CLAUDE.md rules for touched packages

raw_pr="${1:?Usage: cleanup-extract.sh <PR-id> <ARTIFACTS_DIR>}"
ARTIFACTS_DIR="${2:?Usage: cleanup-extract.sh <PR-id> <ARTIFACTS_DIR>}"
PLAN="docs/audit/cleanup-plan.md"

[[ -f "$PLAN" ]] || { echo "ERROR: $PLAN not found" >&2; exit 1; }

# Markdown-table-safe field extractor.
# awk -F'|' splits on every literal `|`, including escaped `\|` characters
# that appear inside cell content (e.g. type unions like `'a' \| 'b'`).
# We substitute `\|` → SOH (byte 0x01, won't appear in markdown) before splitting,
# then restore `|` in the extracted field. Caller specifies 1-based field index.
# SOH is generated via printf for portability — BSD sed (macOS) does not interpret
# `\x01` in s/// replacements; GNU sed does. Using $SOH avoids the divergence.
safe_field() {
    local row="$1" field="$2"
    local SOH
    SOH=$(printf '\001')
    echo "$row" \
        | sed "s/\\\\|/$SOH/g" \
        | awk -F'|' -v f="$field" '{print $f}' \
        | tr "$SOH" '|' \
        | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# Normalize PR number: PR-08, PR-8, 08, 8 → 08 (two-digit zero-padded).
# Optional lowercase letter suffix is preserved for sub-PRs: PR-15a, 15b, etc.
pr_token="$(echo "$raw_pr" | grep -oE '[0-9]+[a-z]*' | head -1)"
[[ -n "$pr_token" ]] || { echo "ERROR: cannot parse PR number from '$raw_pr'" >&2; exit 1; }
pr_num="${pr_token//[a-z]/}"
pr_suffix="${pr_token//[0-9]/}"
# Force base-10 (leading zeros like "08" are invalid octal in bash/printf)
pr_num="$(printf '%02d' "$((10#$pr_num))")"
pr_id="PR-${pr_num}${pr_suffix}"

echo "Extracting work order for ${pr_id}..."

# ── Step 1: PR Execution Plan row ──────────────────────────────────────

pr_row="$(grep -E "^\|[[:space:]]*(\*\*)?${pr_id}(\*\*)?[[:space:]]*\|" "$PLAN" || true)"
[[ -n "$pr_row" ]] || { echo "ERROR: ${pr_id} not found in PR Execution Plan table" >&2; exit 1; }

# Check for superseded/struck-through PRs
if echo "$pr_row" | grep -q '~~'; then
    echo "WARNING: ${pr_id} appears struck through — may be superseded" >&2
fi

# Parse pipe-separated fields (1-indexed): PR | Cluster | Phases | Summary
cluster_raw="$(safe_field "$pr_row" 3)"
phases_raw="$(safe_field "$pr_row" 4)"
summary_raw="$(safe_field "$pr_row" 5)"

# Extract cluster number (C1, C3, etc.)
cluster_num="$(echo "$cluster_raw" | grep -oE 'C[0-9]+' | head -1)"
[[ -n "$cluster_num" ]] || { echo "ERROR: cannot parse cluster from '$cluster_raw'" >&2; exit 1; }

# Parse phase list: P1+P2 → array
IFS='+' read -ra phase_ids <<< "$(echo "$phases_raw" | grep -oE 'P[0-9]+[a-z]*(\+P[0-9]+[a-z]*)*' | head -1)"
[[ ${#phase_ids[@]} -gt 0 ]] || { echo "ERROR: cannot parse phases from '$phases_raw'" >&2; exit 1; }

echo "  Cluster: ${cluster_num} / Phases: ${phase_ids[*]} / Summary: ${summary_raw:0:80}..."

# ── Step 2: Cluster section ────────────────────────────────────────────

# Find cluster header line number
cluster_header_line="$(grep -nE "^###[[:space:]]+${cluster_num}[[:space:]]*—" "$PLAN" | head -1 | cut -d: -f1)"
[[ -n "$cluster_header_line" ]] || { echo "ERROR: cluster section '### ${cluster_num}' not found" >&2; exit 1; }

# Find the next section (next ### or ##) to bound our cluster
next_section_line="$(awk -v start="$((cluster_header_line + 1))" 'NR > start && /^#{2,3}[[:space:]]/ {print NR; exit}' "$PLAN")"
next_section_line="${next_section_line:-99999}"

cluster_title="$(sed -n "${cluster_header_line}p" "$PLAN" | sed 's/^###[[:space:]]*//')"

# Extract cluster metadata (Severity, Headline)
cluster_block="$(sed -n "${cluster_header_line},${next_section_line}p" "$PLAN")"
cluster_severity="$(echo "$cluster_block" | grep -oE '\*\*(RED|YELLOW-RED|YELLOW|GREEN-YELLOW|GREEN)\*\*' | head -1 | tr -d '*' || true)"
cluster_severity="${cluster_severity:-UNKNOWN}"

# ── Step 3: Phase details from cluster table ───────────────────────────

# Extract all phase rows from the cluster's phase table
all_files_claimed=()
phase_details=""

for pid in "${phase_ids[@]}"; do
    # Match the phase row by its Phase column (first field after leading |)
    phase_row="$(echo "$cluster_block" | grep -E "^\|[[:space:]]*${pid}[[:space:]]*\|" | head -1 || true)"
    if [[ -z "$phase_row" ]]; then
        echo "WARNING: Phase ${pid} not found in ${cluster_num} table" >&2
        continue
    fi

    # Parse pipe-separated fields: Phase | Description | Status | Owner | PR | Files-claimed | Notes
    p_desc="$(safe_field "$phase_row" 3)"
    p_status="$(safe_field "$phase_row" 4)"
    p_files="$(safe_field "$phase_row" 7)"
    p_notes="$(safe_field "$phase_row" 8)"

    # Extract individual file paths from backticks (no mapfile — macOS bash 3.x compat)
    files=()
    while IFS= read -r _f; do
        [[ -n "$_f" ]] && files+=("$_f")
    done < <(echo "$p_files" | grep -oE '`[^`]+`' | tr -d '`' | grep -E '\.[a-zA-Z][a-zA-Z0-9]*$' || true)
    for f in ${files[@]+"${files[@]}"}; do
        all_files_claimed+=("$f")
    done

    # Extract verification command from Notes (pattern: Verify: <command>)
    verify_cmd="$(echo "$p_notes" | grep -oE 'Verify:[[:space:]]*.*' | sed 's/^Verify:[[:space:]]*//' || true)"
    verify_cmd="${verify_cmd:-pnpm exec nx run-many -t typecheck}"

    phase_details+="
### Phase ${pid}: $(echo "$p_desc" | head -c 200)

**Description**: ${p_desc}
**Status**: ${p_status}
**Files**:
$(for f in ${files[@]+"${files[@]}"}; do echo "- \`$f\`"; done)

**Verification command**:
\`\`\`bash
${verify_cmd}
\`\`\`

**Notes**: ${p_notes}
"
done

# ── Step 4: Dependencies ───────────────────────────────────────────────

deps="$(grep -E "(${pr_id}|PR-${pr_num})" "$PLAN" | grep -iE 'depend|gate|block|→|↔' | grep -v '^|' || true)"
if [[ -z "$deps" ]]; then
    deps_section="No upstream dependencies. This PR is independently startable."
else
    deps_section="$deps"
fi

# ── Step 5: Resolved decisions ─────────────────────────────────────────

# Check if any phase notes reference decision IDs (D-C1-1, D-C4-3, etc.)
decision_refs="$(echo "$phase_details" | grep -oE 'D-C[0-9]+-[0-9]+' | sort -u || true)"
decisions_section=""
if [[ -n "$decision_refs" ]]; then
    for dref in $decision_refs; do
        decision_text="$(grep -A5 "^\| ${dref}" "$PLAN" | head -5 || true)"
        decisions_section+="
#### ${dref}
${decision_text}
"
    done
fi

# ── Step 6: Write work-order.md ────────────────────────────────────────

mkdir -p "$ARTIFACTS_DIR"
cat > "$ARTIFACTS_DIR/work-order.md" <<WORKORDER
# Cleanup Work Order: ${pr_id}

**Generated**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Source**: docs/audit/cleanup-plan.md

---

## PR Summary

| Field | Value |
|-------|-------|
| **PR** | ${pr_id} |
| **Cluster** | ${cluster_title} |
| **Phases** | ${phases_raw} |
| **Summary** | ${summary_raw} |
| **Dependencies** | ${deps_section:0:200} |

---

## Phases
${phase_details}

---

## Dependencies

${deps_section}

---

## Files Summary

| File | Phase |
|------|-------|
$(for f in ${all_files_claimed[@]+"${all_files_claimed[@]}"}; do
    phase_for_file="$(echo "$phase_details" | grep -B5 "\`$f\`" | grep -oE 'Phase P[0-9]+[a-z]*' | head -1 | sed 's/Phase //' || echo "?")"
    echo "| \`$f\` | ${phase_for_file} |"
done)

${decisions_section:+---

## Resolved Decisions
${decisions_section}}
WORKORDER

echo "Wrote: $ARTIFACTS_DIR/work-order.md"

# ── Step 7: Write patterns.md (sibling-shape analysis) ─────────────────

{
    echo "# Sibling Patterns for ${pr_id}"
    echo ""
    echo "Generated by cleanup-extract.sh. Helps the implement loop understand"
    echo "which files have existing test siblings (append to them) vs. which"
    echo "don't (do NOT create new test files — defer via filer)."
    echo ""

    for f in ${all_files_claimed[@]+"${all_files_claimed[@]}"}; do
        echo "## \`$f\`"
        if [[ -f "$f" ]]; then
            # Find sibling test file
            base="${f%.*}"
            ext="${f##*.}"
            test_sibling=""
            for tpat in "${base}.test.${ext}" "${base}.test.ts" "${base}.test.tsx" "${base}.spec.${ext}"; do
                if [[ -f "$tpat" ]]; then
                    test_sibling="$tpat"
                    break
                fi
            done

            if [[ -n "$test_sibling" ]]; then
                # `grep -c` exits non-zero when there are zero matches even though
                # it prints "0" to stdout. Capture stdout, drop the exit status,
                # and reserve "?" for the actual error path (empty output).
                test_count="$(grep -cE '^\s*(it|test)\(' "$test_sibling" 2>/dev/null || true)"
                test_count="${test_count:-?}"
                echo "- Test sibling: \`${test_sibling}\` (${test_count} test cases)"
                echo "- Action: append tests to existing file"
            else
                echo "- Test sibling: **NONE**"
                echo "- Action: do NOT create a new test file — defer coverage via filer"
            fi

            if echo "$f" | grep -q '_layout'; then
                if grep -q 'unstable_settings' "$f" 2>/dev/null; then
                    echo "- Layout file: unstable_settings present"
                else
                    echo "- Layout file: unstable_settings MISSING"
                fi
            fi
        else
            echo "- File does not exist yet (will be created)"
        fi
        echo ""
    done
} > "$ARTIFACTS_DIR/patterns.md"

echo "Wrote: $ARTIFACTS_DIR/patterns.md"

# ── Step 8: Write rules-digest.md ──────────────────────────────────────

# Determine touched packages from file paths
touched_pkgs=""
for f in ${all_files_claimed[@]+"${all_files_claimed[@]}"}; do
    case "$f" in
        apps/api/*) touched_pkgs+=" api" ;;
        apps/mobile/*) touched_pkgs+=" mobile" ;;
        packages/database/*|packages/drizzle/*) touched_pkgs+=" database" ;;
        packages/schemas/*) touched_pkgs+=" schemas" ;;
        packages/*) touched_pkgs+=" packages" ;;
        docs/*) touched_pkgs+=" docs" ;;
    esac
done
touched_pkgs="$(echo "$touched_pkgs" | tr ' ' '\n' | sort -u | tr '\n' ' ')"

{
    echo "# Rules Digest for ${pr_id}"
    echo ""
    echo "Touched packages: ${touched_pkgs}"
    echo "Auto-generated from CLAUDE.md by cleanup-extract.sh."
    echo "CLAUDE.md is also auto-loaded into the system prompt — this digest"
    echo "highlights the rules most relevant to this PR's scope."
    echo ""

    # Always include these universal rules
    sed -n '/^## Non-Negotiable Engineering Rules/,/^## /{ /^## Non-Negotiable/p; /^## [^N]/!p; }' CLAUDE.md 2>/dev/null || true
    echo ""
    sed -n '/^## Known Exceptions/,/^## /{ /^## Known/p; /^## [^K]/!p; }' CLAUDE.md 2>/dev/null || true
    echo ""
    sed -n '/^## Code Quality Guards/,/^## /{ /^## Code Quality/p; /^## [^C]/!p; }' CLAUDE.md 2>/dev/null || true
    echo ""
    sed -n '/^## Fix Development Rules/,/^## /{ /^## Fix/p; /^## [^F]/!p; }' CLAUDE.md 2>/dev/null || true
    echo ""

    # Conditionally include package-specific rules
    if echo "$touched_pkgs" | grep -q 'mobile'; then
        echo ""
        sed -n '/^## Repo-Specific Guardrails/,/^## /{ /^## Repo-Specific/p; /^## [^R]/!p; }' CLAUDE.md 2>/dev/null || true
        echo ""
        sed -n '/^## UX Resilience Rules/,/^## /{ /^## UX/p; /^## [^U]/!p; }' CLAUDE.md 2>/dev/null || true
    fi

    if echo "$touched_pkgs" | grep -q 'database'; then
        echo ""
        sed -n '/^## Schema And Deploy Safety/,/^## /{ /^## Schema/p; /^## [^S]/!p; }' CLAUDE.md 2>/dev/null || true
    fi

    # Always include governance enforcement constraints — these describe
    # non-obvious interactions between the enforcement layer and common change
    # types. CLAUDE.md describes the rules; this doc describes how the rules
    # are enforced and what surprising things break when adjacent code changes.
    # Captures gotchas like ESLint flat-config glob resolution and tsc --build
    # reference graph traversal that have caused prior Archon runs to ship
    # reverted-mid-PR changes.
    if [[ -f .archon/governance-constraints.md ]]; then
        echo ""
        echo "---"
        echo ""
        cat .archon/governance-constraints.md
    fi
} > "$ARTIFACTS_DIR/rules-digest.md"

echo "Wrote: $ARTIFACTS_DIR/rules-digest.md"

# ── Done ───────────────────────────────────────────────────────────────

echo ""
echo "Extraction complete for ${pr_id}:"
echo "  Cluster: ${cluster_title}"
echo "  Phases: ${#phase_ids[@]} (${phase_ids[*]})"
echo "  Files: ${#all_files_claimed[@]}"
echo "  Artifacts: work-order.md, patterns.md, rules-digest.md"
