---
name: Notion workspace — L-Space teamspace, Issue Trackers (Open + Resolved), API access
description: Issue tracker split into Open (active work) and Resolved (archive) on 2026-05-18. New bugs ALWAYS go into Open. Notion MCP often unavailable — use REST API via Doppler.
type: reference
---
**L-Space teamspace:**
- Name: "L-Space"
- ID: `31a8bce9-1f7c-818e-96fd-0042b1b34644`
- Role: owner

**API access — MCP vs REST:**
- Notion MCP tools (`mcp__claude_ai_Notion__*`) are often NOT available in Claude Code sessions (ToolSearch returns nothing).
- When MCP unavailable: use Notion REST API directly with key from Doppler.
  The `NOTION_API_KEY` lives in project `mentomate`, config `dev`:
  `doppler secrets get NOTION_API_KEY --plain -p mentomate -c dev` (confirmed working 2026-04-16)
- `cd`-ing into the eduagent repo resolves Doppler scope automatically (it has a `.doppler.yaml` with project=mentomate, config=dev). Outside that scope, pass `-p mentomate -c dev` explicitly.
- Notion REST endpoint: `https://api.notion.com/v1/...`, header `Notion-Version: 2022-06-28`.
- Full decision guide: `/notion` skill.

**Issue Tracker split (renamed 2026-05-18):**

Two separate databases, identical schema, different purpose:

| Use case | DB name | ID | Status group |
|---|---|---|---|
| **New bugs, active work** | `Issue Tracker - Open` | `3598bce9-1f7c-8070-86eb-e012bd99f184` | Not started / In progress |
| **Archive** | `Issue Tracker - Resolved` | `b8ce802f-1126-4a2f-a123-be5f888cbb23` | Done only |

- **ALWAYS create new bug rows in `Issue Tracker - Open`.** The Resolved DB is a frozen archive.
- **When a row in Open transitions to Done, the same agent MUST move it to Resolved.** The `/fix-notion-bugs` skill contains the move recipe (read page → read body blocks → POST clone into Resolved → archive source). Open stays small only if every Done row is archived.
- URL prefix: `https://www.notion.so/cognix/<id-without-dashes>`

**Shared schema (both DBs):**
- `Bug` (title)
- `Bug ID` (auto-increment — IDs are scoped per DB, so Open and Resolved each have their own counter)
- `Status` — **type=`status`, NOT `select`** — values: Not started / In progress / Done
- `Priority` (select) — P0/P1/P2/P3 (also legacy P0 Critical / P1 High / P2 Moderate / P3 Low)
- `Platform` (multi_select) — API / Mobile-iOS / Mobile-Android / Mobile-Web / Web / Packages / CI / iOS / Android
- `Found In` (rich_text) — branch/PR/commit where discovered
- `Fixed In` (rich_text) — PR or commit that resolved it
- `Resolution` (rich_text) — required before closing
- `Reported` (date)
- `Resolved` (date)
- `Screenshots` (files)
- `Related Work Item` (relation → Work Items DB `522630ad-62f5-48a9-a4cc-f69828a601f3`)
- (Only on Open) `Implementation Status` (select: Done/Obsolete/Open) — legacy/optional field

**REST payload to create a new bug:**
```http
POST https://api.notion.com/v1/pages
{
  "parent": { "database_id": "3598bce9-1f7c-8070-86eb-e012bd99f184" },
  "properties": {
    "Bug":      { "title":     [{ "type": "text", "text": { "content": "..." } }] },
    "Status":   { "status":    { "name": "Not started" } },
    "Priority": { "select":    { "name": "P1" } },
    "Platform": { "multi_select": [{ "name": "Mobile-Android" }] },
    "Reported": { "date":      { "start": "2026-05-18" } }
  }
}
```

**Property-type gotcha (confirmed 2026-04-27):** `Status` is Notion's dedicated `status` property type, not `select`. Payload must be `"Status": {"status": {"name": "Not started"}}` — sending `{"select": {...}}` returns HTTP 400. Easy to miss because both render identically in the UI.

**Known workspace content:**
- "Workbench" — main workspace area
- "L-Space > ZAF > Mentomate" — project hub containing both Issue Tracker DBs
- "Work Items Guide" — unified fleet work tracker
- "Work Streams" database
