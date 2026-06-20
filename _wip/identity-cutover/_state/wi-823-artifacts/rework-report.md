# WI-823 Rework Report

## Fix

**File:** `apps/api/src/services/recaps.ts:305-310`

**Diff (exact change):**

```diff
-        return await getChildSessionDetail(
-          db,
-          parentProfileId,
-          child.profileId,
-          recapId,
-        );
+        return await getChildSessionDetail(
+          db,
+          parentProfileId,
+          child.profileId,
+          recapId,
+          { identityV2Enabled: opts?.identityV2Enabled },
+        );
```

One argument added — forwarding `opts?.identityV2Enabled` into `getChildSessionDetail` as its 5th `opts` parameter. Mirrors the already-correct list path at recaps.ts:207-209.

## Regression Test

**File:** `apps/api/src/services/recap-parent-detail-v2.integration.test.ts` (new)

Two cases in `(RUN ? describe : describe.skip)` harness (skips silently when DATABASE_URL is absent):

1. **[FLAG-ON]** — guardian has guardianship edge to child; child has a completed `learning_session` + `subjects` row (seeded with legacy profile twin for pre-repoint FK compatibility) → `getRecapForParent(db, guardianPersonId, recapId, { identityV2Enabled: true })` resolves to a non-null `RecapListItem`. Without the fix this returns null because `assertParentAccess` runs flag-OFF, finds no `family_links` row, throws ForbiddenError, which is caught at recaps.ts:311-312.

2. **[BREAK / FLAG-ON]** — parent has no guardianship edge to a seeded charge → `getRecapForParent` returns null (IDOR guard holds; `getChildrenForParent` returns `[]` so the loop never executes).

## Red-Green-Revert Evidence

All three runs executed against the dev Neon DB (`mentomate` Doppler dev config):

**GREEN (fix applied):**
```
PASS apps/api/src/services/recap-parent-detail-v2.integration.test.ts
  ✓ [FLAG-ON] returns the recap for a guardianship-only parent ... (3630 ms)
  ✓ [BREAK / FLAG-ON] returns null when the parent has no guardianship edge ... (615 ms)
Tests: 2 passed, 2 total
```

**RED (fix reverted — opts arg removed):**
```
FAIL apps/api/src/services/recap-parent-detail-v2.integration.test.ts
  ✕ [FLAG-ON] returns the recap for a guardianship-only parent ... (1693 ms)
  ✓ [BREAK / FLAG-ON] returns null when the parent has no guardianship edge ... (587 ms)

expect(received).not.toBeNull()
Received: null

  at Object.<anonymous> (apps/api/src/services/recap-parent-detail-v2.integration.test.ts:225:27)
```

Case 1 fails with `received: null` — exactly the bug. Case 2 passes (IDOR guard still holds without the fix).

**GREEN (fix restored):**
```
PASS apps/api/src/services/recap-parent-detail-v2.integration.test.ts
  ✓ [FLAG-ON] returns the recap for a guardianship-only parent ... (1840 ms)
  ✓ [BREAK / FLAG-ON] returns null when the parent has no guardianship edge ... (576 ms)
Tests: 2 passed, 2 total
```

## Gate Results

**tsc:**
```
NX   Successfully ran target typecheck for project api and 5 tasks it depends on
```
Clean — no new errors.

**eslint (api:lint):**
```
NX   Successfully ran target lint for project api
```
0 errors, 0 warnings in changed/new files. (7 pre-existing warnings in unrelated files.)

**No git performed.** Shepherd owns commit.

## Files Changed

- `apps/api/src/services/recaps.ts` — 1 line added (the `opts` arg)
- `apps/api/src/services/recap-parent-detail-v2.integration.test.ts` — new file (regression test)
