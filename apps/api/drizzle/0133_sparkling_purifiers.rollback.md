# Rollback: 0133_sparkling_purifiers

This migration deduplicates retry-created notice rows, then adds unique indexes
that make pending and visibility notice writes idempotent.

Rollback, if required:

```sql
DROP INDEX IF EXISTS "support_visibility_notices_supportership_type_target_payload_uq";
DROP INDEX IF EXISTS "pending_notices_owner_type_payload_uq";
```

Rows removed by the forward dedupe step cannot be reconstructed automatically.
