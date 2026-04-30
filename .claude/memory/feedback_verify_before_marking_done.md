---
name: Never mark bugs Done without 100% confidence
description: Do not mark Notion bugs as Done unless the fix is verified with full confidence. Revert to In progress if uncertain.
type: feedback
---

Never mark a Notion bug (or any tracker item) as Done/completed unless 100% confident the fix is correct and verified.

**Why:** User explicitly requested this. Premature Done status hides unfinished work from other agents and team members.

**How to apply:** When dispatching agents to fix bugs, verify their results before allowing Done status. If an agent claims "already fixed" or the fix looks partial/uncertain, revert Notion status to "In progress" and investigate further before marking complete.
