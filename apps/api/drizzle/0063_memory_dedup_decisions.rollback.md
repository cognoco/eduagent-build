# 0063_memory_dedup_decisions Rollback

This migration creates the `memory_dedup_decisions` table only.

## Rollback

Safe. Drop with:

```sql
DROP TABLE IF EXISTS memory_dedup_decisions;
```

The table is a memoization cache only. Dropping it does not lose authoritative
memory data. Facts and supersede chains live in `memory_facts`; future sessions
will re-derive decisions that are no longer cached.
