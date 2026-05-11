#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

# Append a follow-up row to the MentoMate Bug Tracker Notion database.
#
# Usage:
#   append-followup.sh \
#       --from <workflow-node> \
#       --pr <pr-id> \
#       --severity <P0|P1|P2|P3> \
#       --platform <csv> \
#       --title <str> \
#       --body <md>
#
# Workspace context (from .claude/memory/reference_notion_workspace.md):
#   - Bug Tracker DB: b8ce802f-1126-4a2f-a123-be5f888cbb23
#   - Notion-Version: 2022-06-28
#   - Status property is type=`status` (NOT `select`) — sending {"select":...}
#     returns HTTP 400.
#   - Platform options: API | Mobile-iOS | Mobile-Android | Packages | CI
#   - NOTION_API_KEY in Doppler project=mentomate config=dev.
#
# Output: prints the created page URL on stdout (so callers can link it from
# their fix-report / blocked.md). Exits 0 on success, non-zero on failure.

DB_ID="b8ce802f-1126-4a2f-a123-be5f888cbb23"
NOTION_VERSION="2022-06-28"

usage() {
    sed -n '4,18p' "${BASH_SOURCE[0]}" >&2
    exit 64
}

from_node=""
pr_id=""
severity=""
platform_csv=""
title=""
body=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --from)     from_node="${2:?--from requires value}";    shift 2;;
        --pr)       pr_id="${2:?--pr requires value}";          shift 2;;
        --severity) severity="${2:?--severity requires value}"; shift 2;;
        --platform) platform_csv="${2:?--platform requires value}"; shift 2;;
        --title)    title="${2:?--title requires value}";       shift 2;;
        --body)
            if [[ $# -lt 2 ]]; then
                echo "ERROR: --body requires a value (use --body '' for empty)." >&2
                usage
            fi
            body="$2"
            shift 2
            ;;
        --help|-h)  usage;;
        *) echo "Unknown arg: $1" >&2; usage;;
    esac
done

[[ -z "$from_node" || -z "$severity" || -z "$title" ]] && {
    echo "ERROR: --from, --severity, --title are required." >&2
    usage
}

case "$severity" in
    P0|P1|P2|P3) ;;
    *) echo "ERROR: --severity must be P0|P1|P2|P3 (got: $severity)" >&2; exit 64;;
esac

if ! command -v doppler >/dev/null 2>&1; then
    echo "ERROR: doppler CLI not on PATH." >&2
    exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq not on PATH." >&2
    exit 1
fi

# Prefer NOTION_API_KEY from the environment (Archon injects codebase env vars
# into bash nodes). Fall back to Doppler CLI for interactive / non-Archon use.
doppler_err="$(mktemp)"
response=""
trap 'rm -f "$doppler_err" "$response"' EXIT
if [[ -n "${NOTION_API_KEY:-}" ]]; then
    echo "Using NOTION_API_KEY from environment" >&2
else
    if NOTION_API_KEY="$(doppler secrets get NOTION_API_KEY --plain -p mentomate -c dev 2>"$doppler_err")"; then
        doppler_rc=0
    else
        doppler_rc=$?
    fi
    if (( doppler_rc != 0 )) || [[ -z "$NOTION_API_KEY" ]]; then
        {
            echo "ERROR: NOTION_API_KEY not in environment and not retrievable from Doppler (project=mentomate config=dev)."
            echo "  doppler exit: ${doppler_rc}"
            echo "  doppler stderr:"
            sed 's/^/    /' < "$doppler_err"
        } >&2
        if [[ -n "${ARTIFACTS_DIR:-}" && -d "${ARTIFACTS_DIR}" ]]; then
            cp "$doppler_err" "${ARTIFACTS_DIR}/notion-filer-doppler-error.txt"
        fi
        exit 1
    fi
fi

today="$(date -u +%Y-%m-%d)"
found_in="${from_node}${pr_id:+ / $pr_id}"

# Build "Platform" multi_select array from CSV (skip empty entries).
platform_json='[]'
if [[ -n "$platform_csv" ]]; then
    platform_json="$(jq -nc --arg csv "$platform_csv" \
        '$csv | split(",") | map(select(length > 0) | gsub("^\\s+|\\s+$"; "")) | map({name: .})')"
fi

# Build page body — Notion accepts at most 100 children blocks per request and
# each rich_text "content" string is capped at 2000 chars. For longer bodies we
# split on blank lines and chunk further if needed. For the small follow-ups we
# expect here (a few paragraphs), one block is plenty.
children_json='[]'
if [[ -n "$body" ]]; then
    children_json="$(jq -nc --arg body "$body" '
        ($body | split("\n\n")
                | map(select(length > 0))
                | map({
                    object: "block",
                    type:   "paragraph",
                    paragraph: {
                        rich_text: [
                            { type: "text", text: { content: (if length > 1900 then .[0:1900] + "…" else . end) } }
                        ]
                    }
                  })
        )')"
fi

payload="$(jq -nc \
    --arg db "$DB_ID" \
    --arg title "$title" \
    --arg sev "$severity" \
    --arg found_in "$found_in" \
    --arg today "$today" \
    --argjson platform "$platform_json" \
    --argjson children "$children_json" \
    '{
      parent: { database_id: $db },
      properties: {
        "Bug": {
          "title": [ { "type": "text", "text": { "content": $title } } ]
        },
        "Status":   { "status":      { "name": "Not started" } },
        "Priority": { "select":      { "name": $sev } },
        "Platform": { "multi_select": $platform },
        "Found In": {
          "rich_text": [ { "type": "text", "text": { "content": $found_in } } ]
        },
        "Reported": { "date": { "start": $today } }
      },
      children: $children
    }')"

response="$(mktemp)"
# EXIT trap was set earlier (line ~84) to clean up both $doppler_err and $response.

http_code="$(curl -sS -o "$response" -w '%{http_code}' \
    -X POST "https://api.notion.com/v1/pages" \
    -H "Authorization: Bearer $NOTION_API_KEY" \
    -H "Notion-Version: $NOTION_VERSION" \
    -H "Content-Type: application/json" \
    --data "$payload")"

if [[ "$http_code" != "200" ]]; then
    echo "ERROR: Notion API responded ${http_code}." >&2
    jq -r '.message // tostring' "$response" >&2 || cat "$response" >&2
    if [[ "$http_code" == "404" ]]; then
        cat >&2 <<EOM
Hint: integration likely doesn't have access to the Bug Tracker DB.
Share https://www.notion.so/cognix/${DB_ID//-/} with the integration whose
key is in Doppler (project=mentomate, config=dev → NOTION_API_KEY).
EOM
    fi
    exit 1
fi

page_url="$(jq -r '.url' "$response")"
echo "Filed follow-up: ${page_url}" >&2
# Final stdout line is the page URL — parseable by callers.
echo "${page_url}"
