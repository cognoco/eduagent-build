# 0133_subscription_person_fk_indexes rollback

This migration only adds non-unique btree indexes for person-scoped erasure
lookups. Rolling back drops those indexes and does not delete or rewrite table
data:

```sql
DROP INDEX IF EXISTS "subscription_payer_person_id_idx";
DROP INDEX IF EXISTS "subscription_payers_person_id_idx";
```
