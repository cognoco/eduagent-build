---
name: project_conflicting_pr_blocks_ci
description: "A CONFLICTING PR produces ZERO github-actions CI runs; symptom is \"every check app except github-actions\""
metadata: 
  node_type: memory
  type: project
  created: 2026-06-29
  last_confirmed: 2026-06-29
  status: active
  originSessionId: 81910f48-b079-4b28-a001-1676e74908c3
---

A PR with `mergeable: CONFLICTING` / `mergeStateStatus: DIRTY` triggers **zero github-actions workflow runs** — GitHub can't compute `refs/pull/N/merge`, so the CI workflow never fires. Webhook check apps (CodeRabbit, netlify, vercel, cursor) still post, so the tell is **"every check app fires EXCEPT github-actions"** + no `github-actions` entry in `gh api .../commits/<sha>/check-suites`.

Diagnose FIRST with `gh pr view N --json mergeable,mergeStateStatus` before assuming a trigger drift. Fix = **rebase/resolve the conflict**, NOT re-author / close-reopen / fresh-PR / fresh-SHA (all five wasted ~1h on the WI-867 cutover 2026-06-29 before the conflict was spotted — `mergeStateStatus: DIRTY` was visible the whole time and means *conflicts*, not "behind main"). Secondary gotcha from the same session: builder worktrees commit as `Test User <test@example.com>` when `setup-worktree.sh` doesn't set git identity — bad provenance on the cutover commit; re-author before merge. See [[project_ci_db_journaled_chain_divergence]].
