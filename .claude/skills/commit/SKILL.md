---
name: commit
description: Use when committing or pushing in the EduAgent repo (commit, save
  changes, commit staged/specific files, commit and push, push).
---

# Commit (EduAgent overlay)

> **Requires the global `zdx-core` plugin.** This skill defers every commit
> mechanic to **`/zdx-core:commit`** and only layers EduAgent's message
> conventions on top. If `/zdx-core:commit` is not available, stop and report
> that the global `zdx-core` plugin must be installed — do not hand-roll a
> commit.

> **Runs INLINE — resolve your worktree explicitly (WI-1246).** This skill is
> deliberately NOT a forked sub-agent (see `agents/claude.yaml`). A fork's cwd
> resolves to the shared main checkout, not the worktree you are working in, so
> a forked commit could land on `origin/main`. Running inline keeps the commit
> in the context of the agent that knows its own worktree — but an agent's cwd
> can still reset between shell calls, so **never rely on ambient cwd**: resolve
> the working tree once (`ROOT=$(git rev-parse --show-toplevel)`) and pass it to
> every git call as `git -C "$ROOT" …`, or `cd "$ROOT" && git …` within a single
> shell invocation. The `.husky` main-guards backstop a miss, but they refuse
> the commit rather than redirect it — get the path right.

## What the CORE owns (follow `/zdx-core:commit` exactly)

All commit mechanics live in the portable core, not here:

- explicit `git -C <path>` working-tree resolution (never ambient cwd);
- **own-work scope by default** — stage only files you edited this session;
  list any other modified/untracked files and never touch them. `git add -A`
  happens **only** on an explicit sweep/all instruction;
- the secret / large-file safety scan (`.env*`, `*.pem`, `*.key`,
  `credentials.json`, stray large binaries);
- the conventional-commit message base (`type(scope): summary` + body bullets);
- **hooks always run — never `--no-verify`** on your own initiative; the
  one-retry failure ladder (related failure → stop and report; unrelated noise
  → unstage and retry once);
- push-by-default with the open-PR exception;
- the never-rewrite-history boundaries (no rebase / force-push / amend-pushed /
  reset-hard-to-non-HEAD; non-fast-forward push → stop and report).

**Do not restate or hardcode the allowed commit types.** `/zdx-core:commit`
reads this repo's `commitlint.config.js` at commit time and uses whatever it
enforces, so the type set can never drift out of sync with the linter.

## What this overlay adds (apply on top of the CORE message)

1. **Finding-ID in the subject.** When the diff fixes a tracked item, tag it:
   `fix(api): atomic quota decrement [CR-1C.1]`.

2. **Verified-By table** — required when **3+ distinct finding IDs** appear in
   one commit. One row per ID; every "Verified By" cell must be non-empty
   (`test:`, `manual:`, or `N/A:` with a reason):

   ```text
   | ID      | Files                         | Verified By                          |
   |---------|-------------------------------|--------------------------------------|
   | BUG-XXX | apps/api/foo.ts, foo.test.ts  | test: foo.test.ts:"break test name"  |
   | CR-YYY  | packages/database/baz.ts      | N/A: schema-only, migrate verified   |
   ```

   6+ IDs → split into smaller commits instead (bundles hide weak fixes among
   solid ones).

3. **Sweep-audit block** — required when the message claims a sweep (the
   `commit-msg` hook enforces this). Paste the query and the result:

   ```text
   Sweep audit:
     rg 'pattern' path/
     -> N hits; all N now have the fix.
   ```

   Use `(no-sweep)` if a sweep keyword is incidental.

4. **Prompt ↔ eval-snapshot pairing.** If the staged diff touches
   `apps/api/src/services/**/*-prompts.ts` or non-test
   `apps/api/src/services/llm/*.ts`, the matching
   `apps/api/eval-llm/snapshots/**` updates must be staged too — run
   `pnpm eval:llm` and re-stage before committing. Bypass only for pure
   rename / comment / type-only refactors that cannot change generation output.

## Worktree push rule

When the current workspace is a linked worktree (detected by `GIT_DIR ≠ GIT_COMMON_DIR`),
**always push with an explicit refspec** — never a bare `git push`:

```bash
git push origin HEAD:<local-branch-name>
```

This pushes to `origin/<local-branch-name>` (e.g. `origin/WI-78`), not to whatever
the worktree's upstream may track. An orchestrator or operator then merges that
branch into the shared integration branch via PR — the executor never lands directly.

Rationale: worktrees created by `scripts/setup-worktree.sh` are intentionally
`--no-track`, so a bare `git push` will error. If a worktree was created by other
means and has tracking set, a bare push can accidentally fast-forward a protected
branch. The explicit refspec is safe in both cases.

**Never override this with `--set-upstream` or `git branch --set-upstream-to`**
to "fix" the missing upstream — the missing upstream is the guard.

## EduAgent staging note

Don't commit half a feature: if a staged file references code that is modified
but **unstaged** in the same logical scope, pull that file in (or split the
commit) so each commit is self-contained. For Expo Router files with `[`/`]`
in the path, use a literal pathspec, e.g.
`git add ':(literal)apps/mobile/src/app/session/[sessionId].tsx'`.

## Plumbing authorization (docs-only)

This repo declares a **plumbing authorization** for the working-tree-free plumbing
commit path (the alternate path in `/zdx-core:commit`, zdx-core ≥ 1.2.0):

- **Permitted change classes:** documentation artifacts ONLY — `docs/**`
  markdown/HTML/PDF evidence and repo meta-docs. No code, config, CI, schema, or
  test files. A change-set containing any file outside this class uses the
  standard worktree→PR procedure, whatever else it contains.
- **Compensating CI gate:** the PR pipeline — the change-class router routes the
  docs class, and the armed merge gate (green checks + clean automated-review
  verdict at head + disposed bot threads) stands in for the skipped local hooks.
- **Landing rule:** always branch + PR; never a commit on `main`, never a branch
  switch of the shared checkout.

Provenance: operator-ruled 2026-07-29 (docs-only exception), promoted to the
estate mechanism 2026-08-02 (WI-3042).

**Recipe** (interim copy — the canonical home is `/zdx-core:commit` § "Alternate
path: working-tree-free plumbing commit"; delete this block once zdx-core 1.2.0
is rolled out on every surface):

```bash
git -C <path> fetch origin main
base=$(git -C <path> rev-parse origin/main)
export GIT_INDEX_FILE=$(mktemp)
git -C <path> read-tree "$base"
blob=$(git -C <path> hash-object -w <local-file>)                        # repeat per file
git -C <path> update-index --add --cacheinfo 100644 "$blob" <repo-path>  # or --force-remove to delete
tree=$(git -C <path> write-tree); unset GIT_INDEX_FILE
commit=$(git -C <path> commit-tree "$tree" -p "$base" -m "docs(scope): summary")
git -C <path> push origin "$commit":refs/heads/<branch>
```
