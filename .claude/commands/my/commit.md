# Safe Commit — Stage Everything First

Commit all current changes without reverting any work. This prevents lint-staged's
stash/restore cycle from silently dropping unstaged changes made by other agents.

## The Problem This Solves

lint-staged runs `git stash push` before formatting, then `git stash pop` after.
If Agent B has unstaged changes while Agent A commits, those changes can be lost
during stash restore. Staging everything first makes the stash empty — nothing to lose.

## Algorithm

Follow these steps in order. Do NOT skip or reorder them.

### 1. Snapshot

Run `git status` (never use `-uall`) and `git diff --stat` to see all changes.
Also run `git log --oneline -5` for commit message style reference.

If there are no changes (no modified, deleted, or untracked files), report "Nothing to commit" and stop.

### 2. Safety check

Identify any files that should NOT be committed:
- `.env`, `.dev.vars`, `credentials.json`, `*.pem`, `*.key`, secrets, tokens — WARN the user and exclude
- Binary / large files that look unintentional — ask first

### 3. Stage everything

Stage ALL remaining changes — modified, deleted, AND untracked files.

- **If step 2 found no exclusions** (the common case): use `git add -A` — one command, instant.
- **If step 2 found exclusions**: use `git add -A` then `git reset HEAD -- <excluded-files>`.

**Expo Router bracket files**: Any file with `[` or `]` in the name (e.g., `[sessionId].tsx`) requires the `:(literal)` pathspec prefix when used in `git reset`, `git stash push`, or individual `git add` — otherwise git treats brackets as glob character classes and may target wrong files. Example: `git reset HEAD -- ':(literal)apps/mobile/src/app/session/[sessionId].tsx'`

This is the critical step: with nothing left unstaged, lint-staged cannot stash or revert anything.

### 4. Draft commit message

Run `git diff --cached --stat` to see the staged summary. Use the stat output (file names + change counts) to draft the message — do not read the full line-by-line diff unless the stat is ambiguous.

- First line: `<type>(<scope>): <summary>` (max 72 chars)
- Types: feat, fix, chore, docs, refactor, test, style, perf, ci
- Body: 2-4 bullet points summarizing the changes
- Footer: `Co-Authored-By: Claude <noreply@anthropic.com>`
- Use a HEREDOC to pass the message (preserves formatting)

#### Verified-By table for multi-ID commits

If the staged diff references **3 or more distinct** `BUG-\d+` / `CR-...` / `PERF-\d+` IDs (count by scanning file paths, code comments, and the planned message), produce a structured table in the body — one row per ID:

```
| ID       | Files                                  | Verified By                                    |
|----------|----------------------------------------|------------------------------------------------|
| BUG-XXX  | apps/api/foo.ts, foo.test.ts           | test: foo.test.ts:"BUG-XXX break test"         |
| BUG-YYY  | apps/mobile/bar.tsx                    | manual: walked through quiz screen on web      |
| CR-ZZZ   | packages/database/baz.ts               | N/A: schema-only, drizzle-kit migrate verified |
```

Every row needs a non-empty `Verified By` cell — `test:`, `manual:`, or `N/A:` with reason. If you can't fill one, the fix is PARTIAL — split the commit so each commit covers what's actually verified.

If the diff bundles 6+ IDs, prefer splitting into smaller commits (one per logical fix) over a long table. Bundles hide weak fixes among solid ones.

#### Sweep-audit block

If the message claims a sweep (extends to all remaining sites, fixes the same bug everywhere, completes a cascade), include a `Sweep audit:` block with the actual grep query and result count. The `commit-msg` hook enforces this:

```
Sweep audit:
  rg 'sendPushNotification\(' apps/api/src/inngest/functions
  -> 7 hits across 7 files; all 7 now reach getRecentNotificationCount gate.
```

If the keyword is incidental (e.g., "swept floor" in a chore commit) include the literal `(no-sweep)` anywhere in the message to bypass the check.

#### Prompt + eval pairing

If the commit touches `apps/api/src/services/**/*-prompts.ts` or `apps/api/src/services/llm/*.ts` (non-test), `apps/api/eval-llm/snapshots/**` must also be staged in the same commit. Run `pnpm eval:llm` and re-stage. The pre-commit hook enforces this. Bypass only for pure refactors (rename, comment, type-only) that cannot affect generation output.

### 5. Commit (let hooks run naturally)

Run `git commit` with the message. Do NOT use `--no-verify`.
The pre-commit hook runs three phases in order: (1) lint-staged (eslint --fix + prettier), (2) `tsc --build` (incremental, only if .ts/.tsx staged), (3) surgical jest tests via `scripts/pre-commit-tests.sh`. Since everything is staged, lint-staged's stash is a no-op.

### 6. If the commit fails

The hook rejected the commit. Changes are still staged — nothing is lost.
Do NOT try to fix the failing files. Just unstage them and commit what passes.

a) **Read the error output carefully.** Classify the failure:
   - **Lint/format errors**: lint-staged may have auto-fixed these. Re-stage the fixed files (`git add` the modified files) and retry the commit.
   - **Type errors (tsc)**: Parse file paths from the tsc output. Unstage ONLY those files with `git reset HEAD -- <file>`. Retry the commit immediately.
   - **Test failures (jest)**: Parse the failing test file paths. Find their source files (strip `.test.ts` / `.test.tsx`). Unstage both the source and test files. Retry the commit immediately.
   - **Type errors in UNSTAGED files**: tsc checks the whole working tree, not just staged files. If the failing file is NOT staged, stash all unstaged + untracked changes before retrying: `git stash push --keep-index -u -m "temp: unstaged WIP during commit"`. After the commit succeeds, run `git stash pop`. If the output says "stash entry is kept," the apply was **incomplete** — do NOT drop the stash. Verify with `git stash show --stat 'stash@{0}'` and compare file count against `git status --short` before proceeding.
   - **NX boundary errors** (e.g., "Static imports of lazy-loaded libraries are forbidden"): Likely stale NX project graph cache. Run `pnpm exec nx reset`, re-stage, and retry.

b) **Retry the commit** with the reduced staged set. Do NOT attempt to fix the code — just commit what passes.

c) **If it still fails**, report to the user:
   - Which files were excluded and why
   - What errors remain
   - Do NOT keep retrying in a loop — two attempts max

d) **Excluded files remain as unstaged local changes** — they are NOT lost, just not in this commit. Do NOT try to fix them before pushing.

**IMPORTANT — Stash safety for untracked files**: Always use `--keep-index -u` (not just `--keep-index`) when manually stashing during a partial commit. Without `-u`, untracked files stay in the working tree and lint-staged's own stash/pop cycle can destroy them. The `-u` flag stashes untracked files too, protecting them from being lost. Always commit untracked files in the same batch as their dependencies (e.g., commit `feedback.ts` together with the schema re-export it imports from).

### 7. Push

After a successful commit, run `git push`. If push fails (e.g., behind remote),
ask the user before force-pushing or rebasing.

### 8. Report

Tell the user:
- The commit hash and message
- Which files were committed
- Which files (if any) were excluded and why — so they know what's still pending
