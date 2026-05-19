# Rollback — 0077 subscriptions partial unique index on (account_id, last_revenuecat_event_id)

## Rollback possible?

Yes. The migration is purely additive — it creates a partial unique index. No data is altered, no columns are added or dropped.

## Data loss

None. Dropping the index does not modify any rows.

## Recovery procedure

```sql
DROP INDEX IF EXISTS "subscriptions_account_revenuecat_event_id_idx";
```

## Caveats

If the index has caught any concurrent-write violation since deployment (rejected INSERT/UPDATE with `duplicate key value violates unique constraint`), the rejected event would not have been recorded. The application-layer idempotency check (`isRevenuecatEventProcessed`) would have returned the same "already processed" result, so the rollback does not surface previously-rejected events — they were intended to be no-ops in the first place.
