# 0142_supporter_contract_fk_indexes_partial rollback

This migration converts the two `contract_id` FK indexes from full to partial
(`WHERE contract_id IS NOT NULL`) to match the WI-1002 Acceptance Criterion. It
only swaps index definitions and does not delete or rewrite table data.

Rolling back drops the partial indexes and restores the full (unconditional)
indexes as they were after 0141:

```sql
DROP INDEX IF EXISTS "support_visibility_audit_events_contract_idx";
DROP INDEX IF EXISTS "support_visibility_notices_contract_idx";
CREATE INDEX IF NOT EXISTS "support_visibility_audit_events_contract_idx" ON "support_visibility_audit_events" USING btree ("contract_id");
CREATE INDEX IF NOT EXISTS "support_visibility_notices_contract_idx" ON "support_visibility_notices" USING btree ("contract_id");
```
