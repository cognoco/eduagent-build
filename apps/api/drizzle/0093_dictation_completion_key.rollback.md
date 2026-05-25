## Rollback - 0093 dictation completion key

This expand migration adds `completion_key` and its non-unique lookup index while preserving the legacy `(profile_id, date, mode)` unique index for migration-before-deploy safety.

Rollback is lossless for the column/index shape because this migration does not yet allow multiple same-day same-mode dictation rows. To restore the previous schema, run:

```sql
DROP INDEX IF EXISTS "idx_dictation_results_profile_completion_key";
ALTER TABLE "dictation_results" DROP COLUMN IF EXISTS "completion_key";
```

Data loss: none expected from rollback. The dropped `completion_key` values can be regenerated from `(profile_id,date,mode)` by re-running the forward migration.

## Forward contract note

After all deployed clients write explicit `completion_key` values, the follow-up contract migration can remove the rollout-only default:

```sql
ALTER TABLE "dictation_results" ALTER COLUMN "completion_key" DROP DEFAULT;
```
