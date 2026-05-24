## Rollback - 0092 dictation completion key

This expand migration adds `completion_key` and its unique index while preserving the legacy `(profile_id, date, mode)` unique index for migration-before-deploy safety.

Rollback is lossless for the column/index shape because this migration does not yet allow multiple same-day same-mode dictation rows. To restore the previous schema, run:

```sql
DROP INDEX IF EXISTS "uniq_dictation_results_profile_completion_key";
ALTER TABLE "dictation_results" DROP COLUMN IF EXISTS "completion_key";
```

Data loss: none expected from rollback. The dropped `completion_key` values can be regenerated from `(profile_id,date,mode)` by re-running the forward migration.
