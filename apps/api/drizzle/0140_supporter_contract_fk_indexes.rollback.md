# 0140_supporter_contract_fk_indexes rollback

This migration only adds non-unique btree indexes for `contract_id` lookups.
Rolling back drops those indexes and does not delete or rewrite table data:

```sql
DROP INDEX IF EXISTS "support_visibility_audit_events_contract_idx";
DROP INDEX IF EXISTS "support_visibility_notices_contract_idx";
```
