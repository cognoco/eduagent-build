# 0068 Rollback - session_events client id conflict target

Rollback is possible. This migration changes only the shape of the unique index
used for idempotent session event writes.

```sql
DROP INDEX IF EXISTS "session_events_session_client_id_uniq";
CREATE UNIQUE INDEX "session_events_session_client_id_uniq"
  ON "session_events" USING btree ("session_id", "client_id")
  WHERE "client_id" IS NOT NULL;
```

No data is lost. PostgreSQL unique indexes allow multiple NULL values, so the
forward migration does not change behavior for legacy rows without `client_id`;
it only makes `ON CONFLICT ("session_id", "client_id")` match a non-partial
arbiter index.
