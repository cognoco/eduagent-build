# Rollback: 0057_memory_facts

## Rollback

Rollback is possible while Phase 1 is still in the dual-write soak period.

1. Set `MEMORY_FACTS_READ_ENABLED=false` in Doppler before rolling back code.
2. Deploy the previous API build that does not read or write `memory_facts`.
3. Run the SQL below only after confirming no deployed code depends on the table or marker column:

```sql
DROP INDEX IF EXISTS "memory_facts_embedding_hnsw_idx";
DROP INDEX IF EXISTS "memory_facts_active_unique_idx";
DROP INDEX IF EXISTS "memory_facts_profile_text_normalized_idx";
DROP INDEX IF EXISTS "memory_facts_active_idx";
DROP INDEX IF EXISTS "memory_facts_profile_created_idx";
DROP INDEX IF EXISTS "memory_facts_profile_category_idx";
DROP TABLE IF EXISTS "memory_facts";
ALTER TABLE "learning_profiles" DROP COLUMN IF EXISTS "memory_facts_backfilled_at";
```

Data loss: dropping `memory_facts` permanently deletes the normalized projection rows. During Phase 1 this is recoverable by re-running the backfill from the retained JSONB columns.
