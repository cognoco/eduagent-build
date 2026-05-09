#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

# Compare two cleanup-PR workflow runs (typically claude vs codex flavor on
# the same PR) and emit a side-by-side markdown report.
#
# Usage:
#   cleanup-compare-runs.sh <run-id-A> <run-id-B> [<output-md>]
#
# Inputs are Archon workflow run IDs. Artifacts are read from
# ~/.archon/workspaces/cognoco/eduagent-build/artifacts/runs/<id>/.
# Per-node wall time is extracted from ~/.archon/logs/archon.stdout.log
# by filtering lines with the run's PID.
#
# Output: markdown to <output-md>, or stdout if not provided.
#
# Limitations:
#   - Token cost per node is NOT extracted (would require Logfire querying).
#   - Findings overlap is by file_path + title-substring; cross-flavor
#     finding-id correlation is heuristic.

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <run-id-A> <run-id-B> [<output-md>]" >&2
    exit 64
fi

RUN_A="$1"
RUN_B="$2"
OUT="${3:-/dev/stdout}"

ARTIFACTS_ROOT="$HOME/.archon/workspaces/cognoco/eduagent-build/artifacts/runs"
LOG="$HOME/.archon/logs/archon.stdout.log"

A_DIR="$ARTIFACTS_ROOT/$RUN_A"
B_DIR="$ARTIFACTS_ROOT/$RUN_B"

for d in "$A_DIR" "$B_DIR"; do
    [[ -d "$d" ]] || { echo "ERROR: artifacts dir not found: $d" >&2; exit 1; }
done
[[ -f "$LOG" ]] || { echo "ERROR: archon log not found: $LOG" >&2; exit 1; }

# ── Extract per-run metadata from log ─────────────────────────────────

run_meta() {
    local run_id="$1"
    # Find the workflow_starting line for this run; pull pid + workflowName + start time
    grep "\"workflowRunId\":\"$run_id\"" "$LOG" 2>/dev/null \
        | grep '"msg":"workflow_starting"' \
        | head -1
}

run_pid() {
    run_meta "$1" | grep -oE '"pid":[0-9]+' | head -1 | grep -oE '[0-9]+'
}

run_workflow() {
    run_meta "$1" | grep -oE '"workflowName":"[^"]*"' | head -1 | sed 's/"workflowName":"//;s/"$//'
}

run_start_ms() {
    run_meta "$1" | grep -oE '"time":[0-9]+' | head -1 | grep -oE '[0-9]+'
}

run_args() {
    # The cmd.workflow_starting line carries the args; sibling event to workflow_starting
    grep "\"args\":\"" "$LOG" 2>/dev/null \
        | grep "\"pid\":$(run_pid "$1")," \
        | grep '"msg":"cmd.workflow_starting"' \
        | head -1 \
        | grep -oE '"args":"[^"]*"' \
        | head -1 \
        | sed 's/"args":"//;s/"$//'
}

# Find the upper time bound for this run by locating the next
# workflow_starting event (any run) after this run's start, OR using "now"
# if this is the most recent run. This is reliable when runs are serial;
# concurrent runs (same Archon process, overlapping intervals) will still
# bleed events because dag_node_* events don't carry workflowRunId.
run_end_ms() {
    local run_id="$1"
    local start; start="$(run_start_ms "$run_id")"
    [[ -z "$start" ]] && return 0
    local next_start
    next_start=$(grep '"msg":"workflow_starting"' "$LOG" \
        | grep -oE '"time":[0-9]+' \
        | grep -oE '[0-9]+' \
        | awk -v s="$start" '$1 > s' \
        | sort -n \
        | head -1)
    if [[ -n "$next_start" ]]; then
        echo "$next_start"
    else
        # Use 24h after start as a safe upper bound when this is the latest run
        echo "$((start + 86400000))"
    fi
}

# Per-node events filtered by pid AND time-window (this run's start to next
# run's start). Output: nodeId TAB ms TAB status TAB reason
node_events() {
    local run_id="$1"
    local pid; pid="$(run_pid "$run_id")"
    local start; start="$(run_start_ms "$run_id")"
    local end; end="$(run_end_ms "$run_id")"
    [[ -z "$pid" || -z "$start" || -z "$end" ]] && return 0
    grep "\"pid\":$pid," "$LOG" \
        | grep -E '"msg":"dag_node_(completed|failed|skipped)"' \
        | jq -rc --argjson start "$start" --argjson end "$end" \
            'select(.time >= $start and .time < $end) | [.nodeId, (.durationMs // 0), (.msg | sub("dag_node_"; "")), (.reason // "-")] | @tsv' \
        2>/dev/null
}

# ── Read artifact data ───────────────────────────────────────────────

read_simple() {
    # Read a small file, default to "(missing)"
    [[ -f "$1" ]] && cat "$1" | tr -d '\n\r' || echo "(missing)"
}

pr_id() {
    local d="$1"
    grep -oE 'PR-[0-9]+' "$d/work-order.md" 2>/dev/null | head -1 || echo "(unknown)"
}

plan_review_verdict() {
    read_simple "$1/plan-review-verdict.txt"
}

# Extract risk-class verdict from log (it's a stdout-only output of the bash node).
# Captured via jq from the dag_node_completed event of the risk-class node.
# Actually risk-class output isn't in the dag_node_completed event itself —
# it's in stdout which Archon may capture separately. Look in the log for
# the bash node's stdout summary line.
risk_class_verdict() {
    local run_id="$1"
    local pid; pid="$(run_pid "$run_id")"
    [[ -z "$pid" ]] && { echo "(unknown)"; return; }
    # risk-class.sh writes verdict to stdout AND logs "verdict=X" to stderr.
    # Archon captures stderr in bash_node_stderr events; grep that.
    local v
    v=$(grep "\"pid\":$pid," "$LOG" \
        | grep '"nodeId":"risk-class"' \
        | grep '"msg":"bash_node_stderr"' \
        | head -1 \
        | grep -oE 'verdict=(tiny|normal|risky)' \
        | head -1 \
        | sed 's/verdict=//')
    echo "${v:-(not found)}"
}

scope_guard_outcome() {
    local d="$1"
    if [[ -f "$d/scope-violation.md" ]]; then
        # Extract files from the "## Unexpected Files" section only — ignore
        # the "## Allowed Files" section which lists everything in scope.
        local files
        files=$(awk '
            /^## Unexpected Files/ { in_section = 1; next }
            /^## / && in_section    { exit }
            in_section              { print }
        ' "$d/scope-violation.md" \
            | grep -oE '`[^`]+`' \
            | tr -d '`' \
            | grep -E '/.*\.[a-zA-Z]' \
            | tr '\n' ',' \
            | sed 's/,$//')
        echo "FIRED: ${files:-(no files found)}"
    else
        echo "clean"
    fi
}

validation_status() {
    local d="$1"
    [[ -f "$d/validation.md" ]] || { echo "(no validation.md)"; return; }
    grep -E '^\*\*Status\*\*:' "$d/validation.md" | head -1 | sed 's/.*: //'
}

# Findings counts: returns "TOTAL CRIT HIGH MED LOW"
findings_counts() {
    local f="$1/review/findings.json"
    [[ -f "$f" ]] || { echo "0 0 0 0 0"; return; }
    jq -r '
        .findings as $f
        | [
            ($f | length),
            ($f | map(select(.severity == "CRITICAL")) | length),
            ($f | map(select(.severity == "HIGH"))     | length),
            ($f | map(select(.severity == "MEDIUM"))   | length),
            ($f | map(select(.severity == "LOW"))      | length)
          ]
        | @tsv' "$f" 2>/dev/null \
        | tr '\t' ' '
}

# Findings list: id|severity|source|file|summary — one per line.
# Note: the synthesizer emits `.file` (not `.file_path`) and `.summary`
# (not `.title`) in findings.json.
findings_list() {
    local f="$1/review/findings.json"
    [[ -f "$f" ]] || return 0
    jq -r '.findings[] | [.id, .severity, .source, (.file // "-"), (.summary // "-")] | @tsv' "$f" 2>/dev/null
}

final_outcome() {
    local d="$1"
    local run_id="$2"
    if [[ -f "$d/.pr-number" ]]; then
        echo "PR #$(cat "$d/.pr-number")"
    else
        # Find the FIRST failed node within this run's time window.
        local failed_node
        failed_node=$(node_events "$run_id" \
            | awk -F'\t' '$3 == "failed" {print $1; exit}')
        echo "FAILED at: ${failed_node:-(unknown)}"
    fi
}

# ── Build the report ─────────────────────────────────────────────────

A_PR=$(pr_id "$A_DIR")
B_PR=$(pr_id "$B_DIR")
A_FLAVOR=$(run_workflow "$RUN_A")
B_FLAVOR=$(run_workflow "$RUN_B")
A_START_MS=$(run_start_ms "$RUN_A")
B_START_MS=$(run_start_ms "$RUN_B")

date_from_ms() {
    local ms="$1"
    [[ -z "$ms" ]] && { echo "(unknown)"; return; }
    date -u -r "$((ms / 1000))" '+%Y-%m-%d %H:%M UTC' 2>/dev/null || echo "(parse failed)"
}

A_DATE=$(date_from_ms "$A_START_MS")
B_DATE=$(date_from_ms "$B_START_MS")

{
    cat <<EOF
# Workflow Run Comparison

| Field | Run A | Run B |
|---|---|---|
| Run ID | \`$RUN_A\` | \`$RUN_B\` |
| Flavor | $A_FLAVOR | $B_FLAVOR |
| PR | $A_PR | $B_PR |
| Started | $A_DATE | $B_DATE |

---

## Per-node wall time

| Node | $A_FLAVOR (ms) | $B_FLAVOR (ms) | Δ | Status A | Status B |
|---|---:|---:|---:|---|---|
EOF

    # Build a sorted union of node IDs from both runs.
    a_events=$(node_events "$RUN_A")
    b_events=$(node_events "$RUN_B")

    # Get distinct node IDs in workflow order. Pull from union, dedupe.
    nodes=$(printf "%s\n%s\n" "$a_events" "$b_events" | awk -F'\t' '!seen[$1]++ {print $1}')

    while IFS= read -r node; do
        [[ -z "$node" ]] && continue
        a_line=$(echo "$a_events" | awk -F'\t' -v n="$node" '$1 == n {print; exit}')
        b_line=$(echo "$b_events" | awk -F'\t' -v n="$node" '$1 == n {print; exit}')
        a_ms=$(echo "$a_line" | awk -F'\t' '{print $2}')
        b_ms=$(echo "$b_line" | awk -F'\t' '{print $2}')
        a_status=$(echo "$a_line" | awk -F'\t' '{print $3}')
        b_status=$(echo "$b_line" | awk -F'\t' '{print $3}')
        [[ -z "$a_ms" ]] && a_ms="-"
        [[ -z "$b_ms" ]] && b_ms="-"
        [[ -z "$a_status" ]] && a_status="(absent)"
        [[ -z "$b_status" ]] && b_status="(absent)"
        delta="-"
        if [[ "$a_ms" != "-" && "$b_ms" != "-" && "$a_ms" -gt 0 && "$b_ms" -gt 0 ]]; then
            delta=$((a_ms - b_ms))
        fi
        echo "| $node | $a_ms | $b_ms | $delta | $a_status | $b_status |"
    done <<< "$nodes"

    cat <<EOF

---

## plan-review

| Verdict | $A_FLAVOR | $B_FLAVOR |
|---|---|---|
| Verdict file | $(plan_review_verdict "$A_DIR") | $(plan_review_verdict "$B_DIR") |

---

## risk-class

| Output | $A_FLAVOR | $B_FLAVOR |
|---|---|---|
| Verdict | $(risk_class_verdict "$RUN_A") | $(risk_class_verdict "$RUN_B") |

---

## validate

| Field | $A_FLAVOR | $B_FLAVOR |
|---|---|---|
| Status | $(validation_status "$A_DIR") | $(validation_status "$B_DIR") |

---

## scope-guard

| Outcome | $A_FLAVOR | $B_FLAVOR |
|---|---|---|
| Result | $(scope_guard_outcome "$A_DIR") | $(scope_guard_outcome "$B_DIR") |

---

## review findings

| Severity | $A_FLAVOR | $B_FLAVOR |
|---|---:|---:|
EOF

    A_COUNTS=($(findings_counts "$A_DIR"))
    B_COUNTS=($(findings_counts "$B_DIR"))
    labels=("Total" "CRITICAL" "HIGH" "MEDIUM" "LOW")
    for i in 0 1 2 3 4; do
        echo "| ${labels[$i]} | ${A_COUNTS[$i]:-0} | ${B_COUNTS[$i]:-0} |"
    done

    cat <<EOF

### Findings detail — $A_FLAVOR

| ID | Severity | Source | File | Title |
|---|---|---|---|---|
EOF
    findings_list "$A_DIR" | while IFS=$'\t' read -r id sev src file title; do
        echo "| ${id} | ${sev} | ${src} | \`${file}\` | ${title} |"
    done

    cat <<EOF

### Findings detail — $B_FLAVOR

| ID | Severity | Source | File | Title |
|---|---|---|---|---|
EOF
    findings_list "$B_DIR" | while IFS=$'\t' read -r id sev src file title; do
        echo "| ${id} | ${sev} | ${src} | \`${file}\` | ${title} |"
    done

    cat <<EOF

### Cross-flavor file overlap

Files mentioned in findings on **both** flavors (potential agreement signal):

EOF
    A_FILES=$(findings_list "$A_DIR" | awk -F'\t' '{print $4}' | sort -u)
    B_FILES=$(findings_list "$B_DIR" | awk -F'\t' '{print $4}' | sort -u)
    overlap=$(comm -12 <(echo "$A_FILES") <(echo "$B_FILES") | grep -v '^-$' || true)
    if [[ -n "$overlap" ]]; then
        echo "$overlap" | sed 's/^/- `/' | sed 's/$/`/'
    else
        echo "_(no overlap, or insufficient findings)_"
    fi

    cat <<EOF

Files only in $A_FLAVOR:

EOF
    only_a=$(comm -23 <(echo "$A_FILES") <(echo "$B_FILES") | grep -v '^-$' || true)
    if [[ -n "$only_a" ]]; then echo "$only_a" | sed 's/^/- `/;s/$/`/'; else echo "_(none)_"; fi

    cat <<EOF

Files only in $B_FLAVOR:

EOF
    only_b=$(comm -13 <(echo "$A_FILES") <(echo "$B_FILES") | grep -v '^-$' || true)
    if [[ -n "$only_b" ]]; then echo "$only_b" | sed 's/^/- `/;s/$/`/'; else echo "_(none)_"; fi

    cat <<EOF

---

## final outcome

| | $A_FLAVOR | $B_FLAVOR |
|---|---|---|
| Result | $(final_outcome "$A_DIR" "$RUN_A") | $(final_outcome "$B_DIR" "$RUN_B") |

---

## known gaps

- **Token cost per node** is not captured here. Logfire spans carry it (claude side via \`LOGFIRE_ENVIRONMENT\` tagging from Stage 1; codex side via \`ARCHON_DEPLOYMENT_ENVIRONMENT\` and codex_sdk_ts OTel emission) — adding requires a Logfire query step.
- **Concurrent runs in the same Archon process** share a pid and \`dag_node_*\` events have no \`workflowRunId\`. The script uses a time-window filter (this run's start to the next run's start) to disambiguate, which works only for **serial** runs. Run flavors back-to-back per PR, not in parallel, until Archon's log emission carries \`workflowRunId\` on every event.
- **Log rotation** drops events. \`~/.archon/logs/archon.stdout.log\` is the source of truth for timing; rotated runs disappear from this report. Run the comparison soon after the runs complete.
- **Adversarial vs reviewer attribution** is via the \`source\` field on each finding; if reviewers were skipped (tiny class), only adversarial+scope sources appear.
- **Wall-time totals** are per-node; pipeline wall-clock is the sum of the longest path through the DAG, not the sum of all node times. The table is for differential analysis, not absolute runtime.

EOF
} > "$OUT"

echo "Comparison written to: $OUT" >&2
