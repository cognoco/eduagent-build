## Rollback

Rollback is safe — dropping the CHECK constraint simply re-opens `source_type` to
any text value. No data is lost; existing rows are unaffected. The constraint
is added with `NOT VALID` so it is applied only to *new* writes at runtime; no
backfill is required, and rollback has no data implications.

```sql
ALTER TABLE "practice_activity_events"
  DROP CONSTRAINT IF EXISTS "practice_activity_events_source_type_known";
```
