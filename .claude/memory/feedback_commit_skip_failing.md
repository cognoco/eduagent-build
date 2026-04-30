---
name: Commit what passes, skip failing files
description: When pre-commit hooks fail on some files, unstage the failing files and commit the rest. Don't fix failing files before committing — leave them locally and handle after push.
type: feedback
originSessionId: d5bd725c-61cb-4654-84b6-de8cbc2737c4
---
When committing and some files fail pre-commit hooks (lint, typecheck, tests), unstage those failing files and commit + push what passes. Don't spend time fixing the failing files just to get them into the commit.

**Why:** The user wants fast iteration. Blocking the entire commit to fix one failing file wastes time. Ship what's ready, deal with the rest after.

**How to apply:**
- Stage all changed files
- If pre-commit fails, identify which files caused the failure
- Unstage those files, commit the rest, push
- Only then go back and work on getting the failing files right
- This applies to coordinator commits — subagents still never commit at all
