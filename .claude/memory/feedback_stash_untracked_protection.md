---
name: Stash must use -u to protect untracked files
description: When manually stashing during partial commits, always use --keep-index -u to prevent lint-staged from destroying untracked files
type: feedback
originSessionId: 703e06f6-5553-4c1e-81ac-b3a203080771
---
Always use `git stash push --keep-index -u` (not just `--keep-index`) when stashing during partial commits.

**Why:** Without `-u`, untracked files remain in the working tree. lint-staged's internal stash/pop cycle doesn't use `-u` either, so untracked files can end up in no-man's-land — removed from disk but never saved in any stash entry. In 2026-04-20 session, feedback.ts (untracked) and 4 other new files were permanently lost during a commit cycle because only `--keep-index` was used.

**How to apply:** Whenever staging a partial commit (not all files), always commit untracked files in the same batch as their dependencies (e.g., `feedback.ts` with its schema re-export in `packages/schemas/src/index.ts`). When manually stashing to isolate staged changes from working tree errors, use `-u` flag. The `/commit` skill has been updated with this rule.
