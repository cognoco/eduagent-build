---
name: Cosmo done means create PR
description: Use when finishing MentoMate Cosmo WI execution or shepherding subagent batches.
type: feedback
---

For MentoMate Cosmo work, create a GitHub PR every time work is done.
Do not wait for a separate "create PRs" prompt after verified work has been
committed and pushed.

**Why:** The user corrected the prior repo-default interpretation on
2026-06-28: PRs should be created automatically whenever completed Cosmo work is
ready to hand back.

**How to apply:** After a WI has a verified commit, branch push, and Cosmo
execute completion where applicable, open the PR before reporting done. Use the
repo's normal `gh pr create` path and default to draft PRs unless the user asks
for ready-for-review PRs.
