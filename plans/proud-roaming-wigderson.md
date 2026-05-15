# Plan: Rebase PR #262 onto main and resolve 48 conflicts

## Context

PR #262 (`goal/mock-claude`) completed the GC1 shadow-mock drain (Metric 1 = 0, Metric 2 = 0) across 23 batch commits. Meanwhile, main merged partial GC1 work (PRs #258, #260) that touched the same files, creating 48 merge conflicts. Per file-by-file analysis, our branch has strictly better mock quality on 43 of 48 files; 3 files need main's new test content preserved; 2 are pure take-ours.

## Steps

### Step 1: Rebase with `-X theirs`

```bash
git rebase origin/main -X theirs
```

This takes our version on all 48 conflicts. Safe for 45 of 48. We fix the 3 exceptions next.

### Step 2: Restore main's content in 3 files

**File A: `apps/api/src/middleware/env-validation.test.ts`**
- Main added a `production binding gate` describe block (+3 tests, +89 lines) we don't have.
- Action: `git show origin/main:apps/api/src/middleware/env-validation.test.ts` → take main's full version, then convert its 1 remaining shadow mock to Pattern A + add gc1-allow on call line.

**File B: `apps/api/src/routes/dashboard.test.ts`**
- Main added a BUG-62 regression test (consent-state parameterized test, +98 lines).
- Action: `git show origin/main:apps/api/src/routes/dashboard.test.ts` → take main's full version, then convert its 1 shadow mock + tag its 4 untagged mocks with gc1-allow on call lines.

**File C: `apps/api/src/middleware/auth.test.ts`**
- Main has a `logger.warn` assertion in the BUG-1 test our conversion simplified away.
- Action: Diff main vs ours for this file, restore the warn assertion into our Pattern A version.

### Step 3: Verify

1. Metric 1 (shadows) = 0
2. Metric 2 (untagged) = 0
3. `pnpm exec nx run api:test` — all pass
4. `pnpm exec nx run api:typecheck` — clean
5. `pnpm exec nx run api:lint` — 0 errors

### Step 4: Force-push

```bash
git push --force-with-lease origin goal/mock-claude
```

This updates PR #262 with the rebased, conflict-free branch.

## Files modified

- 48 files rebased (automatic via `-X theirs`)
- 3 files manually fixed post-rebase (env-validation, dashboard, auth)

## Verification

Both exit metrics at 0, full API test suite green, typecheck + lint clean.
