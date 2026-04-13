# Notion Integration — MCP vs API Key

Consult this skill before any Notion database operation. It defines tool selection, workspace context, work item lifecycle, and known gotchas.

## Arguments

$ARGUMENTS — Optional: what you need to do in Notion (e.g., "create a work item", "search for decisions"). If omitted, print this guide.

---

## 1. Tool Selection — MCP vs REST API

### Decision Tree

```
Need to interact with Notion?
  |
  +-- Reading a page or DB entry? --------> MCP (notion-fetch)
  +-- Searching workspace? ----------------> MCP (notion-search)
  +-- Writing/updating page content? ------> MCP (notion-update-page)
  +-- Adding entries to existing DB? ------> MCP (notion-create-pages)
  +-- Need ALL items from a DB? -----------> REST API (MCP caps at 25)
  +-- Counting items by status/field? -----> REST API (need exhaustive query)
  +-- Creating a NEW database? ------------> REST API (POST /v1/databases)
  +-- Adding/modifying DB properties? -----> REST API (PATCH /v1/databases/:id)
  +-- Creating templates? -----------------> REST API
  +-- Complex bulk scaffolding? -----------> REST API
```

### Capability Comparison

| Operation | MCP | REST API | Winner |
|-----------|-----|----------|--------|
| Search workspace | notion-search | POST /v1/search | MCP (simpler) |
| Read a page | notion-fetch | GET /v1/pages/:id | MCP |
| Read DB entries (≤25) | notion-search with data_source_url | POST /v1/databases/:id/query | MCP |
| Read DB entries (all) | Capped at 25 | Paginated, exhaustive | **REST** |
| Count by status | Cannot aggregate | Filter + count | **REST** |
| Create page/entry | notion-create-pages | POST /v1/pages | MCP |
| Update page props | notion-update-page | PATCH /v1/pages/:id | MCP |
| Update page content | notion-update-page | PATCH /v1/blocks/:id | MCP |
| Create database | notion-create-database | POST /v1/databases | REST (more control) |
| Modify DB schema | Not supported | PATCH /v1/databases/:id | **REST** |
| Comments | notion-create-comment | POST /v1/comments | MCP |

### REST API Access Pattern

```bash
# 1. Get the API key from Doppler (machine-neutral, no hardcoded paths)
export NOTION_API_KEY="$(doppler secrets get NOTION_API_KEY --plain --config dev 2>/dev/null || grep NOTION_API_KEY .env.development.local 2>/dev/null | cut -d= -f2)"

# 2. Query with pagination (Windows: use file-based JSON to avoid bash escaping)
# Write the filter to a temp file, then curl with --data @file
cat > /tmp/notion-query.json << 'QUERYJSON'
{
  "filter": {
    "property": "Status",
    "status": { "equals": "In Progress" }
  },
  "page_size": 100
}
QUERYJSON

curl -s -X POST "https://api.notion.com/v1/databases/DB_ID/query" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  --data @/tmp/notion-query.json

# 3. Handle pagination — check `has_more` and `next_cursor` in response
```

---

## 2. MCP Tool Gotchas

| Gotcha | Detail | Workaround |
|--------|--------|------------|
| **25-result cap** | `notion-search` returns max 25 results per call | Use REST API for exhaustive queries |
| **Date properties** | Notion splits dates into `start` and `end` sub-fields | Access as `date:Field:start` and `date:Field:end` |
| **Checkbox encoding** | Checkboxes are `__YES__` / `__NO__` in properties, not true/false | Match these strings when reading |
| **`replace_content`** | Using notion-update-page with content replacement **deletes all existing blocks** | Only use when you intend to replace everything; for partial updates, use notion-fetch first then surgical edits |
| **Search scope** | Use `teamspace_id` to scope searches to L-Space | Without it, results include the entire workspace |
| **Data source vs Database** | A database can have multiple data sources (views). Use `collection://` URLs from notion-fetch, not the database URL | Fetch the database first to discover data source URLs |

---

## 3. Work Item Lifecycle (EduAgent / MentoMate)

Work items for MentoMate live in the fleet-wide **Work Items** database in L-Space > ZAF.

### Status Pipeline

```
To-do:        Parked → Backlog → Blocked → Next → Workaround Applied
In progress:  Investigating → Scoping → In Progress
Complete:     In Review → Done | Cancelled
```

**Happy path:** Backlog → Next → In Progress → Done

### Resolution Recording (MANDATORY)

When setting an item to **Done**, you MUST record what was actually done:
- Update the item's **Notes** or page content with a resolution summary
- Include: what was changed, which files/PRs, and any side effects
- This lets future agents understand what happened without reading git history

Example resolution:
> Fixed in PR #91. Root cause: PasswordInput keyboard covered input on Android. Added KeyboardAvoidingView wrapper. Side effect: none.

### Re-open Pattern (Regression / Fix Failed)

**Never reopen a Done item.** Instead:
1. Create a **new work item** with Type = Issue
2. Link it to the original via the **Related Issues** relation
3. In the description, reference the original: "Regression of IID-XXX — previous fix did not resolve the root cause"
4. The original stays Done (its resolution is still valid history)

### Creating Work Items (Agent Protocol)

Minimum required fields:
- **Name** — clear, descriptive title
- **Type** — Issue, Gap, Improvement, Feature, Task, or Hygiene
- **Description** — what you observed and why it matters
- **Host** — which host (or "Fleet-wide")
- **Instance** — which instance(s)
- **Agent** — your name (e.g., "Claude Code / EduAgent")

Leave **Priority, Owner, Track, Stream** unset — assigned during triage.

### Item Types

| Type | When to use |
|------|-------------|
| Issue | Something broken or behaving unexpectedly |
| Gap | Something missing that should exist |
| Hygiene | Cleanup, tech debt, minor maintenance |
| Improvement | Enhance something that already exists |
| Feature | Build something entirely new |
| Task | Specific execution step, often child of another item |

---

## 4. Key Database IDs

| Database | Page ID | Data Source ID |
|----------|---------|----------------|
| **Work Items** | `d38e2f96-8b48-40e6-bfa9-b71900d355ae` | `collection://522630ad-62f5-48a9-a4cc-f69828a601f3` |
| **Work Streams** | `9189c84e-19b9-4da3-8faa-b70d499ac026` | _(fetch to discover)_ |
| **Component Registry** | `eebdd287-ba1d-453c-bca5-9bb28484d244` | `collection://82e88722-74e8-4aa3-9635-720f12b134d4` |

**L-Space teamspace ID:** `31a8bce9-1f7c-818e-96fd-0042b1b34644`

---

## 5. Common Operations Quick Reference

**Search Work Items by keyword:**
```
notion-search: query="keyword", teamspace_id="31a8bce9-1f7c-818e-96fd-0042b1b34644"
```

**Read a specific work item:**
```
notion-fetch: id="<page-id>"
```

**Create a new work item:**
```
notion-create-pages: target database = d38e2f96-8b48-40e6-bfa9-b71900d355ae
```

**Update status + add resolution:**
```
notion-update-page: id="<page-id>", update status property + append resolution to content
```

**Get all items in a status (exhaustive):**
→ Use REST API with pagination (MCP caps at 25)
