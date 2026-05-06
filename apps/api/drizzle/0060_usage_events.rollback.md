## Rollback

Rollback is possible. The `usage_events` table is additive and contains only
per-profile quota attribution created after this migration.

Data loss: dropping the table permanently deletes per-profile usage attribution
recorded since the migration. It does not affect `quota_pools` counters,
subscriptions, profiles, or billing entitlements.

Recovery procedure:

```sql
DROP TABLE IF EXISTS "usage_events";
```

After rollback, deploy worker code that does not read or write
`usage_events`; subscription screens fall back to aggregate quota usage only.
