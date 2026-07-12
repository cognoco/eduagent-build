# 0143_wi1844_chip_fk_indexes rollback

This migration adds two leading-column btree indexes on the nullable set-null FK
columns `supporter_encouragement_chips.subject_id` and
`supporter_encouragement_chips.topic_id` (WI-1844). It only creates indexes and
does not read, delete, or rewrite any table data.

Rolling back drops the two indexes. No data loss — dropping an index never
removes rows; queries fall back to the prior (unindexed) scan on the cold
cascade-delete path.

```sql
DROP INDEX IF EXISTS "supporter_encouragement_chips_subject_id_idx";
DROP INDEX IF EXISTS "supporter_encouragement_chips_topic_id_idx";
```
