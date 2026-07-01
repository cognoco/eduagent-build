---
name: project_conflicting_pr_blocks_ci
description: "A CONFLICTING PR produces ZERO github-actions CI runs; symptom is \"every check app except github-actions\""
metadata: 
  node_type: memory
  type: project
  created: 2026-06-29
  last_confirmed: 2026-06-30
  status: active
  originSessionId: 81910f48-b079-4b28-a001-1676e74908c3
---

A PR with `mergeable: CONFLICTING` / `mergeStateStatus: DIRTY` triggers **zero github-actions workflow runs** — GitHub can't compute `refs/pull/N/merge`, so the CI workflow never fires. Webhook check apps (CodeRabbit, netlify, vercel, cursor) still post, so the tell is **"every check app fires EXCEPT github-actions"** + no `github-actions` entry in `gh api .../commits/<sha>/check-suites`.

Diagnose FIRST with `gh pr view N --json mergeable,mergeStateStatus` before assuming a trigger drift. Fix = **rebase/resolve the conflict**, NOT re-author / close-reopen / fresh-PR / fresh-SHA (all five wasted ~1h on the WI-867 cutover 2026-06-29 before the conflict was spotted — `mergeStateStatus: DIRTY` was visible the whole time and means *conflicts*, not "behind main"). Secondary gotcha from the same session: builder worktrees commit as `Test User <test@example.com>` when `setup-worktree.sh` doesn't set git identity — bad provenance on the cutover commit; re-author before merge. See [[project_ci_db_journaled_chain_divergence]].

**Object-push is the corruption-immune promote (WI-867 landed 2026-06-30).** When worktrees are being corrupted (a rogue process appended `Test User` "init" commits wiping worktree indexes — git-metadata only, on-disk files intact so tests stay valid), promote a PR branch by pushing the immutable commit OBJECT, not a working tree: `git push origin <sha>:<branch> --force-with-lease=<branch>:<expected-sha>` (run from any worktree; SKIP_PRE_PUSH justified once tsc + the binding suites are verified, since CI backstops). Recover a corrupted worktree with `git reset --hard <your-real-sha>`; always verify against the commit object (`git show <sha>`), not the working tree.

**Stale-base treadmill on a large PR.** A 125-file PR re-conflicts every time `main` advances through a file it touches — even a 1-line test-fix push re-flips it to CONFLICTING if `main` moved meanwhile. Only main commits that touch the PR's files re-conflict (mobile/doc/wip-chore commits don't). Defense: land FAST on green+confirm to minimize the window; re-rebase onto current `origin/main` (`git fetch` + rebase, never trust a named tip), resolve, re-object-push. **Local DB drift gives false CI-fail positives**: local pg missing a recent migration (e.g. WI-902 `sentences` column) or Neon-dev M-DROP makes suites fail locally but pass on CI's fresh-migrated DB — differential signature = PASS-on-CI + imports-no-changed-file + missing-column/relation error. CI is the binding gate.

**Cosmo `complete` on an already-Executing item (no `fetch` possible — `fetch` requires Stage=Ready):** construct a minimal `workitem.json` (`{pageId, id, name}` — `complete` only needs `pageId`), author `completion-summary.md` with the 4 self-gated sections (`What was done: / What changed: / Verification: / Caveats / Follow-ups:` — regex `/What was done[^:\n]*:/i` per `review/dod.ts`), then run `bun <plugin>/skills/execute/execute.ts complete <artifacts-dir> green` from a checkout whose HEAD is the merge commit (Fixed In = `gitHead()`).
