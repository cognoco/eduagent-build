---
name: Notion REST for exhaustive queries
description: Always use REST API (not MCP) when querying all items from a Notion database — MCP caps at 25 results
type: feedback
---

Always use the Notion REST API for exhaustive database queries. MCP search caps at 25 results with no pagination.

**Why:** MCP's notion-search returns a maximum of 25 results per call. If you need to count items by status, get all open work items, or do any aggregation, MCP will silently truncate and give you wrong numbers.

**How to apply:** When the task requires "all items", "count of", "how many", or any exhaustive listing from a Notion database, use the REST API with pagination (`has_more` + `next_cursor`). Use file-based JSON on Windows to avoid bash escaping issues.
