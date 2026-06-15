#!/usr/bin/env bash
# Orchestrator Cosmo Stage/State monitor for a single workstream.
#
# Emits one stdout line per Work-Item Stage|State transition, so it can drive
# the orchestrator's Monitor watcher. This is the orchestrator's INDEPENDENT
# lifecycle channel (see shepherd-protocol.md → "your lifecycle is visible to
# the orchestrator via its Cosmo Stage monitor"): it lets the shepherd stay
# silent about routine churn while the orchestrator still sees graduation
# signal, rework bounces, and human-holds (State -> Blocked / Awaiting Info).
#
# Usage:  orch-stage-monitor.sh <WORKSTREAM_PAGE_ID> [poll_seconds]
# Requires: NOTION_TOKEN in env; yq, jq, curl on PATH; run from repo root
# (reads work-items.data_source_id from zdx-config.yaml).
#
# Durable on purpose (review-loop-reviewer-observations.md 2026-06-14: runtime
# state must not live only in /tmp). Re-arm after any reboot/session end.
set -uo pipefail

WS_ID="${1:?workstream page id required}"
POLL="${2:-120}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
DS_ID="$(yq -r '.zdx.work-items.data_source_id' "${ROOT}/zdx-config.yaml")"

declare -A prev
first=1

while true; do
  snap="$(curl -s -X POST "https://api.notion.com/v1/data_sources/${DS_ID}/query" \
    -H "Authorization: Bearer ${NOTION_TOKEN}" \
    -H "Notion-Version: 2025-09-03" \
    -H "Content-Type: application/json" \
    -d "{\"filter\":{\"property\":\"Workstream\",\"relation\":{\"contains\":\"${WS_ID}\"}},\"page_size\":100}" \
    | jq -r '.results[] | [(.properties.ID.unique_id.prefix + "-" + (.properties.ID.unique_id.number|tostring)), (.properties.Stage.select.name // "?"), (.properties.State.select.name // "?")] | @tsv' 2>/dev/null)"

  if [ -z "${snap}" ]; then
    echo "[$(date -u +%H:%M:%SZ)] WARN: empty/failed WS-${WS_ID} poll (token/network?)"
    sleep "${POLL}"; continue
  fi

  while IFS=$'\t' read -r wi stage state; do
    [ -z "${wi}" ] && continue
    cur="${stage}|${state}"
    if [ -n "${prev[$wi]+x}" ]; then
      [ "${prev[$wi]}" != "${cur}" ] && echo "[$(date -u +%H:%M:%SZ)] ${wi}: ${prev[$wi]} -> ${cur}"
    elif [ "${first}" -eq 1 ]; then
      echo "[baseline $(date -u +%H:%M:%SZ)] ${wi} = ${cur}"
    else
      echo "[$(date -u +%H:%M:%SZ)] ${wi}: NEW = ${cur}"
    fi
    prev[$wi]="${cur}"
  done <<< "${snap}"

  first=0
  sleep "${POLL}"
done
