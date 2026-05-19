## Rollback — 0078 webhook_idempotency_keys

### Rollback possible?

Yes. The migration is purely additive — it creates a new standalone table with no foreign keys in either direction. No data is altered, no columns are added or dropped on any existing table.

### Data loss

Dropping the table loses the historical record of which webhook IDs have been processed. This data is forensic only — not referenced by any other table, not used to derive any user-visible state. The functional impact of losing the idempotency records is that, after rollback, the brief window in which the same `webhook_id` might be redelivered is no longer atomically guarded; the system reverts to the partial KV-based mitigation that existed before this migration.

Records older than 5 minutes are eligible for cleanup anyway (Svix signature-tolerance window), so the practical data-loss surface is tiny.

### Recovery procedure

```sql
DROP INDEX IF EXISTS "webhook_idempotency_keys_received_at_idx";
DROP TABLE IF EXISTS "webhook_idempotency_keys";
```

### Caveats

- Any code paths that depend on `webhook_idempotency_keys` (e.g. `apps/api/src/routes/resend-webhook.ts`) must be reverted in the same deploy as the table drop; otherwise the next inbound webhook will 500 with `relation "webhook_idempotency_keys" does not exist`.
- The handler is designed so the KV fast-path still functions if `c.get('db')` is unavailable, but on a deployed environment with `databaseMiddleware` always providing a `db`, missing the table is a hard failure — drop the table only after deploying the rollback code.
