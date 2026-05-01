---
name: Notion workspace — L-Space teamspace, Bug Tracker, and API access
description: Notion MCP often unavailable in Claude Code sessions. Use REST API via Doppler key instead. Bug Tracker ID and schema documented.
type: reference
originSessionId: 44bc1dc6-a390-461c-b9ab-c27ed61a5b20
---
**L-Space teamspace:**
- Name: "L-Space"
- ID: `31a8bce9-1f7c-818e-96fd-0042b1b34644`
- Role: owner

**API access — MCP vs REST:**
- Notion MCP tools (`mcp__claude_ai_Notion__*`) are often NOT available in Claude Code sessions (ToolSearch returns nothing)
- When MCP unavailable: use Notion REST API directly with key from Doppler.
  The `NOTION_API_KEY` lives in project `mentomate`, config `dev`:
  `"C:\Tools\doppler\doppler.exe" secrets get NOTION_API_KEY --plain -p mentomate -c dev` (confirmed working 2026-04-16)
- The previous claim that no project/config flags were needed was wrong — Doppler requires -p/-c unless the CWD has a `.doppler.yaml` with matching scope. `cd`-ing into the eduagent repo does resolve the scope automatically (it has a .doppler.yaml with project=mentomate, config=dev).
- Full decision guide: `/notion` skill

**MentoMate Bug Tracker (PRIMARY — always use this):**
- URL: `https://www.notion.so/cognix/b8ce802f11264a2fa123be5f888cbb23`
- Database ID: `b8ce802f-1126-4a2f-a123-be5f888cbb23` (confirmed working 2026-04-06)
- Schema: Bug (title), Bug ID (auto BUG-NNN), **Status (type=`status`, NOT `select`)** values Not started/In progress/Done, Priority (select, P0-P3), Platform (multi_select: API/Mobile-iOS/Mobile-Android/Packages/CI), Found In (rich_text), Fixed In (rich_text), Resolution (rich_text), Reported (date), Resolved (date), Screenshots (files), Related Work Item (relation)
- Status flow: Not started → In progress → Done
- REST endpoint for creating rows: `POST https://api.notion.com/v1/pages` with `"parent": {"database_id": "b8ce802f-1126-4a2f-a123-be5f888cbb23"}`
- Notion-Version header: `2022-06-28`
- **Property-type gotcha (confirmed 2026-04-27):** `Status` is Notion's dedicated `status` property type, not `select`. Payload must be `"Status": {"status": {"name": "Not started"}}` — sending `{"select": {...}}` returns HTTP 400. Easy to miss because both render identically in the UI.

**Known workspace content:**
- "Workbench" — main workspace area
- "L-Space > ZAF > MentoMate Bug Tracker" — bug tracking
- "Work Items Guide" — unified fleet work tracker
- "Work Streams" database
