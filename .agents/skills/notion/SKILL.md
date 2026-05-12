---
name: notion
description: Use before reading, creating, updating, triaging, or resolving EduAgent/MentoMate Notion work items or databases, especially when repo-specific L-Space database IDs, work item lifecycle rules, status changes, resolution notes, or MCP-vs-REST API choice matter.
---

# Notion

Use the Notion plugin skills for general Notion work, but apply these EduAgent-specific rules and IDs whenever touching MentoMate work items.

## Tool Choice

- Read page or DB entry: prefer Notion MCP/plugin tools.
- Search workspace: prefer Notion MCP/plugin tools scoped to L-Space.
- Write/update page content: prefer Notion MCP/plugin tools.
- Add entries to an existing DB: prefer Notion MCP/plugin tools.
- Exhaustive DB query, count by status/field, create/modify database schema, or bulk scaffolding: use the REST API with pagination.

MCP gotchas:

- Search/list calls may cap at 25 results. Use REST for exhaustive queries.
- Date properties split into `start` and `end`.
- Checkboxes may appear as `__YES__` / `__NO__`.
- `replace_content` can delete existing blocks; fetch first and make surgical edits unless replacing everything is intended.
- Scope searches with the L-Space teamspace ID.
- For data sources, fetch the database/page first and use `collection://` URLs where required.

## EduAgent Work Item Lifecycle

Work items for MentoMate live in the fleet-wide Work Items database in L-Space > ZAF.

Status pipeline:

- To-do: `Parked`, `Backlog`, `Blocked`, `Next`, `Workaround Applied`
- In progress: `Investigating`, `Scoping`, `In Progress`
- Complete: `In Review`, `Done`, `Cancelled`

Happy path: `Backlog` -> `Next` -> `In Progress` -> `Done`.

When selecting work from Notion, set selected items to `In Progress` before editing so other agents do not pick the same item.

## Done Requires Resolution

When setting an item to `Done`, record what was actually done in Notes or page content:

- What changed.
- Files, commits, or PRs involved.
- Verification performed.
- Side effects or follow-up risk.

Never mark an item done solely because code was changed. Verify the fix first.

## Regressions

Do not reopen a `Done` item. Create a new work item with `Type = Issue`, link it through `Related Issues`, and describe it as a regression of the original item.

## Creating Work Items

Minimum fields:

- `Name`: clear title.
- `Type`: `Issue`, `Gap`, `Improvement`, `Feature`, `Task`, or `Hygiene`.
- `Description`: observed behavior and why it matters.
- `Host`: host or `Fleet-wide`.
- `Instance`: affected instance(s).
- `Agent`: e.g. `Codex / EduAgent`.

Leave `Priority`, `Owner`, `Track`, and `Stream` unset for triage unless the user explicitly says otherwise.

## Key IDs

- L-Space teamspace ID: `31a8bce9-1f7c-818e-96fd-0042b1b34644`
- Work Items page ID: `d38e2f96-8b48-40e6-bfa9-b71900d355ae`
- Work Items data source: `collection://522630ad-62f5-48a9-a4cc-f69828a601f3`
- Work Streams page ID: `9189c84e-19b9-4da3-8faa-b70d499ac026`
- Component Registry page ID: `eebdd287-ba1d-453c-bca5-9bb28484d244`
- Component Registry data source: `collection://82e88722-74e8-4aa3-9635-720f12b134d4`

## Common Operations

- Search Work Items: query with `teamspace_id="31a8bce9-1f7c-818e-96fd-0042b1b34644"`.
- Read a specific item: fetch by page ID.
- Create a work item: target Work Items page ID `d38e2f96-8b48-40e6-bfa9-b71900d355ae`.
- Exhaustively query a status: use REST API pagination, not capped search.
- Update status plus resolution: update properties and append resolution context; do not replace existing page content unless intended.
