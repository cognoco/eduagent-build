# Notion Integration — MCP vs API Key

This skill defines when to use Notion MCP tools vs the Notion API key for direct HTTP calls.

## Two Access Modes

### MCP Tools (Default — Read & Write Content)

Use the `mcp__claude_ai_Notion__*` tools for everyday content operations:

| Operation | Tool |
|-----------|------|
| Search workspace | `notion-search` |
| Read page/database content | `notion-fetch` |
| Create pages (within existing databases/pages) | `notion-create-pages` |
| Update existing pages | `notion-update-page` |
| Add comments | `notion-create-comment` |
| Move/duplicate pages | `notion-move-pages`, `notion-duplicate-page` |
| Find users/teams | `notion-get-users`, `notion-get-teams` |
| Read/update views | `notion-update-view`, `notion-create-view` |

**When to use MCP:**
- Searching for content across the workspace
- Reading page or database contents
- Writing/updating page content (text, properties, blocks)
- Adding entries to existing databases
- Commenting on pages
- Any read or write to existing Notion structures

### Notion API Key (Structural / Administrative Operations)

Use the Notion API key via direct HTTP requests (`curl` / `WebFetch`) for operations that create new **structural elements** — things that define the shape of the workspace rather than fill it with content:

- Creating **new databases** (with custom property schemas, relations, rollups)
- Creating **templates** inside databases
- Setting up **new lists** with specific column configurations
- Adding **database properties** (columns, relations, formulas)
- Bulk-creating complex structures (e.g., a PARA system scaffold)
- Operations requiring fine-grained control over property types, formulas, or relation configurations

**How to use the API key:**
1. Retrieve the API key from Doppler: `C:\Tools\doppler\doppler.exe secrets get NOTION_API_KEY --plain -p mentomate -c dev`
2. Make direct API calls:
   ```bash
   curl -X POST https://api.notion.com/v1/databases \
     -H "Authorization: Bearer $NOTION_API_KEY" \
     -H "Notion-Version: 2022-06-28" \
     -H "Content-Type: application/json" \
     -d '{ ... }'
   ```

## Decision Flowchart

```
Need to interact with Notion?
  |
  +-- Reading content? ---------> MCP (notion-fetch, notion-search)
  +-- Writing to a page? -------> MCP (notion-update-page, notion-create-pages)
  +-- Adding DB entries? -------> MCP (notion-create-pages into database)
  +-- Creating a NEW database? -> API Key (POST /v1/databases)
  +-- Creating templates? ------> API Key (template_pages in database)
  +-- Adding DB properties? ----> API Key (PATCH /v1/databases/:id)
  +-- Complex bulk scaffolding? -> API Key (multiple structured calls)
```

## Key Context

- **L-Space teamspace ID:** `31a8bce9-1f7c-818e-96fd-0042b1b34644` — use as `teamspace_id` filter for scoped searches
- Secrets are in **Doppler** (project: `mentomate`) — never hardcode API keys
- Notion API version: `2022-06-28`
- All Notion work for this project lives in the L-Space teamspace

## Arguments

$ARGUMENTS — Optional: what you need to do in Notion (e.g., "create a task database", "search for meeting notes"). If omitted, just print this guide.
