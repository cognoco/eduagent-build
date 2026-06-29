# Plan: WI-1077 — Extract scattered API utility helpers to shared modules

**Date:** 2026-06-29  
**Branch:** WI-1077  
**Claimant:** claude:shepherd:WI-1077

## Problem

Identical cursor-based pagination tail logic appears in 4 service files (grep
found an additional site beyond the 3 listed in the WI):

| File | Lines | Pattern |
|------|-------|---------|
| `apps/api/src/services/bookmarks.ts` | 186-195 | identical |
| `apps/api/src/services/notes.ts` | 465-474 | identical |
| `apps/api/src/services/practice-activity-history.ts` | 80-111 | identical contract; `page` used for further mapping before return |
| `apps/api/src/services/session/session-crud.ts` | 2219-2224 | identical |

Each computes:
```ts
const hasMore = rows.length > limit;
const page = hasMore ? rows.slice(0, limit) : rows;
// ... (practice-activity-history does additional mapping here) ...
return { ..., nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
```

## Solution

### Step 1 — Create `apps/api/src/services/pagination.ts`

Export a single generic helper:

```ts
/**
 * Applies keyset-pagination tail logic to a pre-fetched `rows` array.
 *
 * Callers must query `limit + 1` rows so that the extra row signals whether
 * a next page exists. This function slices the array back to `limit`, derives
 * the cursor from the last item's `id`, and returns both.
 */
export function paginateRows<T extends { id: string }>(
  rows: T[],
  limit: number,
): { page: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}
```

No imports needed — pure TS utility.

### Step 2 — Migrate call sites

**bookmarks.ts (lines 186-196):**
- Import `paginateRows` from `'./pagination'`
- Replace the 2-line `hasMore`/`page` block + `nextCursor` in return with:
  ```ts
  const { page, nextCursor } = paginateRows(rows, limit);
  return { bookmarks: page.map(mapBookmarkRow), nextCursor };
  ```

**notes.ts (lines 465-475):**
- Import `paginateRows` from `'./pagination'`
- Replace the 2-line block + `nextCursor` in return with:
  ```ts
  const { page, nextCursor } = paginateRows(rows, limit);
  return {
    notes: page.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor,
  };
  ```

**practice-activity-history.ts (lines 80-112):**
- Import `paginateRows` from `'./pagination'`
- Replace the 2-line block with `const { page, nextCursor } = paginateRows(rows, limit);`
- Remove `hasMore` references; use `nextCursor` directly in the return

**session-crud.ts (lines 2219-2225):**
- Import `paginateRows` from `'./pagination'`
- Replace the 2-line block + `nextCursor` in return with:
  ```ts
  const { page, nextCursor } = paginateRows(rows, limit);
  return { sessions: await hydrateChildSessions(db, profileId, page), nextCursor };
  ```

### Step 3 — Sweep confirm

Run: `grep -rn 'hasMore.*rows.length\|nextCursor.*page\[' apps/api/src/services/`  
Expected: zero hits after migration.

### Step 4 — Validate

```bash
pnpm exec nx run api:test --testPathPattern='bookmarks|notes|session-crud|practice-activity-history'
pnpm exec nx run api:typecheck
```

Both must be green.

## What NOT to change

- No test files touched (production code only per WI spec)
- No barrel/index.ts changes — `pagination.ts` is imported directly from sibling files
- No other services touched beyond the 4 call sites
