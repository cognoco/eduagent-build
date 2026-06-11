---
name: Notion work item resolution recording
description: Always record resolution when marking work items Done — never reopen, create linked new item instead
type: feedback
---

When marking a work item Done, ALWAYS record a resolution summary in the item's Notes/content: what changed, which files/PRs, side effects.

Never reopen a Done item. If a fix didn't work, create a new Issue linked via Related Issues relation with "Regression of IID-XXX" in description. The original stays Done — its resolution is valid history.

**Why:** Future agents need to understand what was actually done without digging through git history. And reopening items destroys the historical record of what was attempted.

**How to apply:** Every time you complete a work item via Notion, update it with a resolution block before setting status to Done. If a previous fix failed, create a fresh linked item instead of reopening.
