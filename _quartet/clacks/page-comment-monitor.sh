#!/usr/bin/env bash
# Notion page-comment monitor for a single page (workstream or Work Item).
#
# Emits one stdout line per NEW comment, so it can drive a Monitor watcher.
# Complements orch-stage-monitor.sh, which sees Stage/State transitions but is
# blind to comments — and comments are how the orchestrator delivers rulings and
# escalations to the operator/PM.
#
# REPLAY, NEVER SILENTLY SEED (monitor-hygiene.md, WI-1606): pass --since with
# the created_time of the last comment you can attest was delivered. Every
# comment newer than that is emitted on the first pass. Omitting --since seeds
# from "now" and will swallow anything that landed while no watcher was armed.
#
# Usage:  page-comment-monitor.sh <PAGE_ID> [--since <ISO8601>] [--label <text>] [--poll <seconds>]
# Requires: NOTION_TOKEN in env; jq, curl on PATH.
set -uo pipefail

PAGE_ID="${1:?page id required}"; shift
SINCE=""
LABEL=""
POLL=120

while [ $# -gt 0 ]; do
  case "$1" in
    --since) SINCE="${2:?}"; shift 2 ;;
    --label) LABEL="${2:?}"; shift 2 ;;
    --poll)  POLL="${2:?}";  shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# No --since => seed from now (and say so loudly; this is the lossy mode).
if [ -z "${SINCE}" ]; then
  SINCE="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  echo "[warn] no --since given: seeding from ${SINCE}; comments older than this are NOT replayed"
fi

last="${SINCE}"
prefix="${LABEL:+[${LABEL}] }"

while true; do
  body="$(curl -s "https://api.notion.com/v1/comments?block_id=${PAGE_ID}&page_size=100" \
    -H "Authorization: Bearer ${NOTION_TOKEN}" \
    -H "Notion-Version: 2022-06-28")"

  # Coverage: a failed/permission-denied poll must be audible, not silent.
  if ! echo "${body}" | jq -e '.results' >/dev/null 2>&1; then
    echo "[$(date -u +%H:%M:%SZ)] WARN: comment poll failed for ${PAGE_ID}: $(echo "${body}" | jq -r '.message // "no .results"' 2>/dev/null | head -c 120)"
    sleep "${POLL}"; continue
  fi

  # Emit strictly-newer comments, oldest first, then advance the watermark.
  while IFS=$'\t' read -r ts text; do
    [ -z "${ts}" ] && continue
    echo "${prefix}${ts} ${text}"
    last="${ts}"
  done < <(echo "${body}" | jq -r --arg last "${last}" '
      .results
      | map(select(.created_time > $last))
      | sort_by(.created_time)[]
      | [.created_time, ([.rich_text[].plain_text] | join("") | gsub("\n"; " ") | .[0:400])]
      | @tsv')

  sleep "${POLL}"
done
