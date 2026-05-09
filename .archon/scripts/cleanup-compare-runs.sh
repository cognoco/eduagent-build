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
# Inputs are Archon workflow_run_id values (32-char hex). Both invocation
# paths (web UI and CLI in separate terminals) populate the same DB tables.
# Per-run timing and tool-call detail come from ~/.archon/archon.db
# (remote_agent_workflow_runs + remote_agent_workflow_events). Artifact
# detail (work-order, findings, scope-violation, plan-review verdict) is
# read from the run's artifacts directory on disk.
#
# Output: markdown to <output-md>, or stdout if not provided.
#
# Known gaps:
#   - LLM token cost per node is NOT in the DB; it lives in Logfire spans
#     keyed by LOGFIRE_ENVIRONMENT. Add as a follow-up if needed.
#   - workflow_runs.status is currently unreliable for live runs (we saw
#     'failed' / SIGINT metadata appear while events kept flowing). Trust
#     the events stream over the status column for run liveness.

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <run-id-A> <run-id-B> [<output-md>]" >&2
    exit 64
fi

RUN_A="$1"
RUN_B="$2"
OUT="${3:-/dev/stdout}"

DB="$HOME/.archon/archon.db"
ARTIFACTS_ROOT="$HOME/.archon/workspaces/cognoco/eduagent-build/artifacts/runs"

A_DIR="$ARTIFACTS_ROOT/$RUN_A"
B_DIR="$ARTIFACTS_ROOT/$RUN_B"

[[ -f "$DB" ]] || { echo "ERROR: Archon DB not found at $DB" >&2; exit 1; }

# Confirm both run IDs exist in the DB.
for rid in "$RUN_A" "$RUN_B"; do
    n=$(sqlite3 "$DB" "SELECT COUNT(*) FROM remote_agent_workflow_runs WHERE id = '$rid';")
    if [[ "$n" != "1" ]]; then
        echo "ERROR: workflow_run_id '$rid' not found in DB (got $n rows)" >&2
        exit 1
    fi
done

# ── DB query helpers ────────────────────────────────────────────────

# Fetch a single field from workflow_runs.
run_field() {
    local rid="$1"
    local field="$2"
    sqlite3 "$DB" "SELECT COALESCE($field, '') FROM remote_agent_workflow_runs WHERE id = '$rid';"
}

# Per-node completion events as: step_name<TAB>duration_ms
# Order is by created_at to preserve workflow execution order.
node_durations() {
    local rid="$1"
    sqlite3 -separator $'\t' "$DB" "
        SELECT step_name, COALESCE(json_extract(data, '\$.duration_ms'), 0)
        FROM remote_agent_workflow_events
        WHERE workflow_run_id = '$rid'
          AND event_type = 'node_completed'
        ORDER BY created_at;
    "
}

# Set of node names that have a node_started event (regardless of completion).
nodes_started() {
    local rid="$1"
    sqlite3 "$DB" "
        SELECT DISTINCT step_name
        FROM remote_agent_workflow_events
        WHERE workflow_run_id = '$rid'
          AND event_type = 'node_started';
    "
}

# Tool-call summary per step: step_name<TAB>tool_name<TAB>calls<TAB>total_ms.
# claude reports clean tool names (Bash, Read, Write); codex reports the full
# shell command as the tool name (`/bin/zsh -lc '...'`). We bucket codex's
# shell calls as `Bash` so the two flavors compare on equal footing.
tool_summary() {
    local rid="$1"
    sqlite3 -separator $'\t' "$DB" "
        WITH bucketed AS (
            SELECT
                step_name,
                CASE
                    WHEN json_extract(data, '\$.tool_name') LIKE '/bin/%' THEN 'Bash'
                    WHEN json_extract(data, '\$.tool_name') LIKE 'shell%' THEN 'Bash'
                    ELSE COALESCE(json_extract(data, '\$.tool_name'), 'unknown')
                END AS tool,
                COALESCE(json_extract(data, '\$.duration_ms'), 0) AS ms
            FROM remote_agent_workflow_events
            WHERE workflow_run_id = '$rid'
              AND event_type = 'tool_completed'
        )
        SELECT step_name, tool, COUNT(*) AS calls, SUM(ms) AS total_ms
        FROM bucketed
        GROUP BY step_name, tool
        ORDER BY step_name, total_ms DESC;
    "
}

# ── Artifact-dir helpers (unchanged from log-based version) ─────────

read_simple() {
    [[ -f "$1" ]] && cat "$1" | tr -d '\n\r' || echo "(missing)"
}

pr_id_from_artifacts() {
    local d="$1"
    [[ -f "$d/work-order.md" ]] || { echo "(unknown)"; return; }
    grep -oE 'PR-[0-9]+' "$d/work-order.md" 2>/dev/null | head -1 || echo "(unknown)"
}

plan_review_verdict() {
    read_simple "$1/plan-review-verdict.txt"
}

# risk-class verdict: prefer the artifact-side capture (if we ever add one);
# fall back to scraping bash_node_stderr from the log if available, else
# parse it out of the events.data blob.
risk_class_verdict() {
    local rid="$1"
    sqlite3 "$DB" "
        SELECT COALESCE(
            (SELECT json_extract(data, '\$.stderr')
             FROM remote_agent_workflow_events
             WHERE workflow_run_id = '$rid'
               AND step_name = 'risk-class'
               AND event_type = 'node_completed'
             LIMIT 1),
            ''
        );
    " 2>/dev/null \
        | grep -oE 'verdict=(tiny|normal|risky)' \
        | head -1 \
        | sed 's/verdict=//' \
        | grep . \
        || echo "(not captured)"
}

scope_guard_outcome() {
    local d="$1"
    if [[ -f "$d/scope-violation.md" ]]; then
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

findings_list() {
    local f="$1/review/findings.json"
    [[ -f "$f" ]] || return 0
    jq -r '.findings[] | [.id, .severity, .source, (.file // "-"), (.summary // "-")] | @tsv' "$f" 2>/dev/null
}

final_outcome() {
    local d="$1"
    local rid="$2"
    if [[ -f "$d/.pr-number" ]]; then
        echo "PR #$(cat "$d/.pr-number")"
        return
    fi
    local status; status=$(run_field "$rid" "status")
    if [[ "$status" == "completed" ]]; then
        echo "completed (no PR file — check artifacts)"
        return
    fi
    # Find the last node_started without a matching node_completed.
    local stuck_node
    stuck_node=$(sqlite3 "$DB" "
        WITH started AS (
            SELECT step_name, created_at FROM remote_agent_workflow_events
            WHERE workflow_run_id = '$rid' AND event_type = 'node_started'
        ),
        completed AS (
            SELECT step_name FROM remote_agent_workflow_events
            WHERE workflow_run_id = '$rid' AND event_type = 'node_completed'
        )
        SELECT s.step_name FROM started s
        WHERE s.step_name NOT IN (SELECT step_name FROM completed)
        ORDER BY s.created_at DESC
        LIMIT 1;
    ")
    echo "${status} (last incomplete node: ${stuck_node:-(none)})"
}

# ── Build the report ─────────────────────────────────────────────────

A_PR=$(pr_id_from_artifacts "$A_DIR")
B_PR=$(pr_id_from_artifacts "$B_DIR")
A_FLAVOR=$(run_field "$RUN_A" "workflow_name")
B_FLAVOR=$(run_field "$RUN_B" "workflow_name")
A_STARTED=$(run_field "$RUN_A" "started_at")
B_STARTED=$(run_field "$RUN_B" "started_at")
A_COMPLETED=$(run_field "$RUN_A" "completed_at")
B_COMPLETED=$(run_field "$RUN_B" "completed_at")
A_STATUS=$(run_field "$RUN_A" "status")
B_STATUS=$(run_field "$RUN_B" "status")

{
    cat <<EOF
# Workflow Run Comparison

| Field | Run A | Run B |
|---|---|---|
| Run ID | \`$RUN_A\` | \`$RUN_B\` |
| Flavor | $A_FLAVOR | $B_FLAVOR |
| PR | $A_PR | $B_PR |
| Started | $A_STARTED | $B_STARTED |
| Completed | ${A_COMPLETED:-(running)} | ${B_COMPLETED:-(running)} |
| Status | $A_STATUS | $B_STATUS |

---

## Configuration Matrix

| Tier | Claude flavor | Codex flavor |
|------|---------------|--------------|
| Implementation (implement, fix-locally) | claude-opus-4-6 / high | gpt-5.5 / high |
| Triage (plan-review, review-scope, code-review, test-coverage, ci-watch-and-fix) | sonnet / medium | gpt-5.5 / medium |
| Validation (validate, re-validate) | sonnet / low | gpt-5.5 / low |
| Adversarial (cross-LLM) | gpt-5.5 / high | claude-opus-4-6 / high |

Note: this is "best-tuned per provider," not a model-controlled A/B. Claude uses model size as the primary lever (opus/sonnet/haiku) plus effort as secondary; Codex uses one model with effort as the primary lever.

---

## Per-node wall time

Source: \`remote_agent_workflow_events\` filtered by \`workflow_run_id\` and \`event_type = 'node_completed'\`. \`(absent)\` means the node has no node_started event for that run.

| Node | $A_FLAVOR (ms) | $B_FLAVOR (ms) | Δ |
|---|---:|---:|---:|
EOF

    A_DURS=$(node_durations "$RUN_A")
    B_DURS=$(node_durations "$RUN_B")
    A_STARTED_NODES=$(nodes_started "$RUN_A")
    B_STARTED_NODES=$(nodes_started "$RUN_B")

    # Distinct node IDs in encounter order (A first, then any new from B).
    nodes=$(printf "%s\n%s\n" "$A_DURS" "$B_DURS" | awk -F'\t' '$1 != "" && !seen[$1]++ {print $1}')

    while IFS= read -r node; do
        [[ -z "$node" ]] && continue
        a_ms=$(echo "$A_DURS" | awk -F'\t' -v n="$node" '$1 == n {print $2; exit}')
        b_ms=$(echo "$B_DURS" | awk -F'\t' -v n="$node" '$1 == n {print $2; exit}')
        a_started=$(echo "$A_STARTED_NODES" | grep -Fxq -- "$node" && echo y || echo n)
        b_started=$(echo "$B_STARTED_NODES" | grep -Fxq -- "$node" && echo y || echo n)

        # If a node started but never completed, show "(in flight)".
        if [[ -z "$a_ms" ]]; then a_ms=$([[ "$a_started" == y ]] && echo "(in flight)" || echo "-"); fi
        if [[ -z "$b_ms" ]]; then b_ms=$([[ "$b_started" == y ]] && echo "(in flight)" || echo "-"); fi

        delta="-"
        if [[ "$a_ms" =~ ^[0-9]+$ && "$b_ms" =~ ^[0-9]+$ ]]; then
            delta=$((a_ms - b_ms))
        fi
        echo "| $node | $a_ms | $b_ms | $delta |"
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

| ID | Severity | Source | File | Summary |
|---|---|---|---|---|
EOF
    findings_list "$A_DIR" | while IFS=$'\t' read -r id sev src file summary; do
        echo "| ${id} | ${sev} | ${src} | \`${file}\` | ${summary} |"
    done

    cat <<EOF

### Findings detail — $B_FLAVOR

| ID | Severity | Source | File | Summary |
|---|---|---|---|---|
EOF
    findings_list "$B_DIR" | while IFS=$'\t' read -r id sev src file summary; do
        echo "| ${id} | ${sev} | ${src} | \`${file}\` | ${summary} |"
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

## tool-call summary

Per-node tool usage from \`remote_agent_workflow_events\` filtered by \`event_type = 'tool_completed'\`. Useful for "where did each provider spend its turns" — a high tool-call count on one flavor for the same node suggests one model is more thorough or more confused.

### Tool calls — $A_FLAVOR

| Step | Tool | Calls | Total ms |
|---|---|---:|---:|
EOF
    tool_summary "$RUN_A" | while IFS=$'\t' read -r step tool calls total; do
        [[ -z "$step" ]] && continue
        echo "| ${step} | ${tool} | ${calls} | ${total} |"
    done

    cat <<EOF

### Tool calls — $B_FLAVOR

| Step | Tool | Calls | Total ms |
|---|---|---:|---:|
EOF
    tool_summary "$RUN_B" | while IFS=$'\t' read -r step tool calls total; do
        [[ -z "$step" ]] && continue
        echo "| ${step} | ${tool} | ${calls} | ${total} |"
    done

    cat <<EOF

---

## final outcome

| | $A_FLAVOR | $B_FLAVOR |
|---|---|---|
| Result | $(final_outcome "$A_DIR" "$RUN_A") | $(final_outcome "$B_DIR" "$RUN_B") |

---

## known gaps

- **LLM token cost per node** is not in the DB. Spans tagged by \`LOGFIRE_ENVIRONMENT\` (set in init-tracing.sh) carry per-call cost — adding requires a Logfire query function. Defer until cost data is needed for the merge decision.
- **\`workflow_runs.status\`** can be misleading on live runs. We've observed runs with \`status='failed'\` and SIGINT metadata while the events stream continued flowing. The events table is the reliable source of liveness.
- **Web UI vs CLI** both populate the DB equivalently. Run-id is the universal handle. PIDs no longer matter for extraction.
- **\`risk-class\` verdict capture** depends on a node_completed event whose data blob includes the bash node's stderr. If Archon's event schema changes, this falls back to "(not captured)".

EOF
} > "$OUT"

echo "Comparison written to: $OUT" >&2
