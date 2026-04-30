---
name: Drizzle PgTransaction requires cast to Database for service functions
description: PgTransaction lacks $withAuth and batch methods. Use `tx as unknown as Database` when passing tx to service functions that accept Database. Safe because services only use standard query methods.
type: feedback
---

When wrapping service calls in `db.transaction()`, the `tx` parameter is typed as `PgTransaction` which is NOT assignable to `Database` (which is `NeonHttpDatabase` with `$withAuth` and `batch`).

**Why:** Drizzle's type system distinguishes between the full database client and a transaction context. The transaction has all query methods (select, insert, update, delete) but lacks batch and auth methods that are only meaningful on the root connection.

**How to apply:**
```typescript
await db.transaction(async (tx) => {
  const txDb = tx as unknown as Database;
  await someService(txDb, profileId, ...);
  await otherService(txDb, profileId, ...);
});
```

This pattern is safe because all service functions only use standard Drizzle query methods. The existing codebase uses `db.transaction()` in `curriculum.ts` and `home-surface-cache.ts`, but those call Drizzle methods directly on `tx` rather than passing to service functions — which is why they don't need the cast.
