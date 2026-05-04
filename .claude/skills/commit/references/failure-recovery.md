# Commit Failure Recovery

The pre-commit hook rejected the commit. Changes are still staged — nothing
is lost. Follow this procedure.

## 1. Classify each failing file

- **Lint/format errors**: lint-staged may have auto-fixed these. Re-stage
  the fixed files and retry.
- **Type errors (tsc)**: Parse file paths from the tsc output. If the
  failing file is NOT staged (tsc checks the whole tree), stash unstaged
  changes first: `git stash push --keep-index -u -m "temp: unstaged WIP"`.
  If the failing file IS staged but unrelated to your changes, unstage it
  with `git reset HEAD -- <file>`.
- **Test failures (jest)**: Parse the failing test file paths. Find their
  source files (strip `.test.ts`). If unrelated to your changes, unstage
  both source and test files.
- **NX boundary errors**: Run `pnpm exec nx reset`, re-stage, and retry.

## 2. Determine relatedness

- **Related** (test for code you're committing, same logical scope): fix
  the failure or split the commit. Do not skip related failures.
- **Unrelated** (different feature/layer, pre-existing): unstage and retry.
- If unsure, treat as related.

## 3. Retry

Retry the commit with the reduced staged set. Do NOT use `--no-verify`.

## 4. If it still fails

Two attempts maximum. Report to the user:
- Which files were excluded and why
- What errors remain
- Excluded files remain as unstaged local changes — they are not lost.

## Stash safety

Always use `--keep-index -u` (not just `--keep-index`) when stashing during
a partial commit. Without `-u`, untracked files stay in the working tree and
lint-staged's stash/pop can destroy them.

After commit succeeds, run `git stash pop`. If the output says "stash entry
is kept," the apply was incomplete — verify with
`git stash show --stat 'stash@{0}'` before dropping.

## Expo Router bracket files

Files with `[` or `]` in the name (e.g., `[sessionId].tsx`) need the
`:(literal)` pathspec prefix in `git reset` and `git stash push`:
```
git reset HEAD -- ':(literal)apps/mobile/src/app/session/[sessionId].tsx'
```
