# 0068 Rollback - session_events client id conflict target

Rollback is possible. No data is lost.

## What this migration does

Drops and recreates `session_events_session_client_id_uniq` as a partial unique
index on `(session_id, client_id) WHERE client_id IS NOT NULL`. This restores the
partial-index arbiter that Drizzle's `onConflictDoNothing({ target, where })` calls
depend on — a preceding draft of this migration omitted the `WHERE` clause and
created a plain unique index, which prevented Postgres from selecting the arbiter
index for conflict resolution.

## Rollback SQL

Run this to revert to the state before migration 0068 (restores the same partial
index that was present after migration 0045):

```sql
DROP INDEX IF EXISTS "session_events_session_client_id_uniq";
CREATE UNIQUE INDEX "session_events_session_client_id_uniq"
  ON "session_events" USING btree ("session_id", "client_id")
  WHERE "client_id" IS NOT NULL;
```

Because the pre-0068 state also had `WHERE "client_id" IS NOT NULL`, the rollback
SQL is identical to the forward migration SQL. Both produce the same partial index.

## Application code after rollback

Application code using `.onConflictDoNothing({ target: [...], where: sql\`...\` })`
continues to work unchanged after rollback. The `where` option in Drizzle's conflict
clause must match the partial-index predicate so Postgres can select the correct
arbiter index.
