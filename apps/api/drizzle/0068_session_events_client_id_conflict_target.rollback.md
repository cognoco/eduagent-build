# 0068 Rollback - session_events client id conflict target

Rollback is possible. This migration changes only the shape of the unique index
used for idempotent session event writes.

```sql
DROP INDEX IF EXISTS "session_events_session_client_id_uniq";
CREATE UNIQUE INDEX "session_events_session_client_id_uniq"
  ON "session_events" USING btree ("session_id", "client_id")
  WHERE "client_id" IS NOT NULL;
```

No data is lost. The forward migration keeps the existing partial predicate
(`WHERE "client_id" IS NOT NULL`) so legacy rows without `client_id` keep their
previous duplicate-NULL behavior. Application writes that target this index must
include the same conflict predicate (`targetWhere: client_id IS NOT NULL`) so
Postgres can select the partial arbiter index.
