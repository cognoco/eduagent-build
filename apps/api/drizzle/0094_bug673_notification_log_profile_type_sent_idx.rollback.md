# Rollback - 0094_bug673_notification_log_profile_type_sent_idx

**Bug:** L10.L5 / BUG-673
**Effect:** Replaces `notification_log_profile_sent_idx (profile_id, sent_at)` with
`notification_log_profile_type_sent_idx (profile_id, type, sent_at)` so the
`type`-filtered queries in daily-reminder-scan, review-due-scan, recall-nudge,
and weekly-progress-push can use an index covering all three predicates.

## Is rollback possible?

Yes. No data is lost - only an index definition changes. Both indexes serve
correctness; the new one is strictly more selective for the existing query
shape.

## Rollback SQL

```sql
DROP INDEX "notification_log_profile_type_sent_idx";
CREATE INDEX "notification_log_profile_sent_idx" ON "notification_log"
  USING btree ("profile_id", "sent_at");
```

## Why rollback should be unnecessary

The new (profile_id, type, sent_at) index is a strict superset of the
information in (profile_id, sent_at) for the planner: any query that could
use the old index can also use the new one (Postgres will use the first N
columns of a multi-column index). Rolling back would only restore the
narrower index - there is no scenario where the narrower one outperforms
the wider one for these queries.

## Notes

- No table lock - `CREATE INDEX` without `CONCURRENTLY` is acceptable for
  this table size (notification_log is event-log scale, but the rebuild
  briefly blocks writes). If row count exceeds a few million by the time
  this ships to prod, hand-edit the migration to use
  `CREATE INDEX CONCURRENTLY` (which cannot run inside a transaction;
  drizzle-kit's auto-generated DDL will need adjustment).
