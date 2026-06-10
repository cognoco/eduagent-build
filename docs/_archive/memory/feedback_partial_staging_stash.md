---
name: Partial staging requires stash trick
description: Pre-commit hook tests full working tree — stash in-progress files with --keep-index before committing partial changes
type: feedback
---

When committing a subset of changes while other files have in-progress (incompatible) modifications, the pre-commit hook fails because `tsc --build` and `jest --findRelatedTests` run against the **full working tree**, not just staged files.

**Why:** lint-staged stashes/restores unstaged changes for linting, but `tsc --build` and the test runner execute AFTER lint-staged restores — so they see the full working tree including broken in-progress files.

**How to apply:** Before committing partial changes:
1. `git stash push --keep-index -m "temp: in-progress" -- <in-progress-files>`
2. Verify `git diff --stat` shows no unstaged changes
3. Commit (hooks run against clean tree)
4. `git stash pop` (may need `git checkout -- <conflicting-files>` first if lint-staged modified them)

Also check for **partially staged files** (same file with both staged and unstaged changes) — these cause tsc/test mismatches:
```bash
git diff --name-only | sort > /tmp/u.txt
git diff --cached --name-only | sort > /tmp/s.txt
comm -12 /tmp/s.txt /tmp/u.txt
```
Unstage any matches — they'll fail the pre-commit.
