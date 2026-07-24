#!/usr/bin/env bash
# Regenerates roadmap-data.js for roadmap-viz.html from live Cosmo (Notion).
# Requires NOTION_TOKEN in env. Run from this directory: bash viz-export.sh
set -eu
cd "$(dirname "$0")"
WI_DS=36fd1119-9955-4684-8bfe-deb145e6a21f
OPQ_DS=3948bce9-1f7c-81cd-aef5-000b10a9ec94
PROJECT_ID=3658bce9-1f7c-8128-9f9b-fa7fcf75a13b
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# ponytail: control-char sanitize — Notion rich_text can carry raw U+0000-001F that hard-fail jq
san() { perl -pe 's/[\x00-\x08\x0b\x0c\x0e-\x1f]/ /g'; }

# --- open work items (paginated) ---
cursor=""
: > "$TMP/wi.pages"
while :; do
  body=$(jq -n --arg pid "$PROJECT_ID" --arg cur "$cursor" '{
    filter:{and:[{property:"Project",relation:{contains:$pid}},{property:"Stage",select:{does_not_equal:"Closed"}}]},
    page_size:100} + (if $cur != "" then {start_cursor:$cur} else {} end)')
  resp=$(curl -s -X POST "https://api.notion.com/v1/data_sources/$WI_DS/query" \
    -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2025-09-03" \
    -H "Content-Type: application/json" -d "$body" | san)
  echo "$resp" | jq -c '.results[]' >> "$TMP/wi.pages"
  has_more=$(echo "$resp" | jq -r '.has_more')
  cursor=$(echo "$resp" | jq -r '.next_cursor // ""')
  [ "$has_more" = "true" ] || break
done

# --- workstream id -> name map ---
curl -s -X POST "https://api.notion.com/v1/data_sources/08b3ab36-709d-44af-b78c-5e9f74f6e745/query" \
  -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" -d '{"page_size":100}' | san \
  | jq '[.results[] | {(.id): ([.properties.Name.title[].plain_text]|join(""))}] | add' > "$TMP/wsmap.json"

# --- open OPQ rows ---
curl -s -X POST "https://api.notion.com/v1/data_sources/$OPQ_DS/query" \
  -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2025-09-03" \
  -H "Content-Type: application/json" \
  -d '{"filter":{"or":[{"property":"Status","select":{"equals":"Open"}},{"property":"Status","select":{"equals":"Processed"}}]},"page_size":100}' | san \
  | jq '[.results[] | {opq:("OPQ-"+(.properties.ID.unique_id.number|tostring)),
        title:(([.properties.Item.title[].plain_text]|join(""))[0:110]),
        type:(.properties.Type.select.name//""),
        status:(.properties.Status.select.name//""),
        deadline:(.properties.Deadline.date.start//"")}] | sort_by(.opq|ltrimstr("OPQ-")|tonumber)' > "$TMP/opq.json"

# --- assemble ---
jq -s --slurpfile ws "$TMP/wsmap.json" --slurpfile opq "$TMP/opq.json" \
   --arg gen "$(date -u +%Y-%m-%dT%H:%MZ)" '
  {generated:$gen,
   opq:$opq[0],
   items:[ .[] | {
     wi:("WI-"+(.properties.ID.unique_id.number|tostring)),
     n:.properties.ID.unique_id.number,
     name:([.properties.Name.title[].plain_text]|join("")),
     stage:(.properties.Stage.select.name//"UNSET"),
     priority:(.properties.Priority.select.name//""),
     lanes:[.properties.Workstream.relation[].id | ($ws[0][.] // "?")]
   }] | sort_by(.n)}' "$TMP/wi.pages" > "$TMP/data.json"

{ printf 'window.ROADMAP_DATA = '; cat "$TMP/data.json"; printf ';\n'; } > roadmap-data.js
echo "roadmap-data.js: $(jq '.items|length' "$TMP/data.json") items, $(jq '.opq|length' "$TMP/data.json") OPQ rows, generated $(jq -r .generated "$TMP/data.json")"
