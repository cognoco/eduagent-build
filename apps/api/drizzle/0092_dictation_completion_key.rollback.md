## Rollback - 0092 dictation completion key

This migration changes dictation result idempotency from `(profile_id, date, mode)` to `(profile_id, completion_key)`.

Rollback is not lossless once users have created multiple same-day same-mode dictation results. To restore the old unique constraint, first choose which duplicate rows to keep, archive or delete the extras, then run:

```sql
DROP INDEX IF EXISTS "uniq_dictation_results_profile_completion_key";
DROP INDEX IF EXISTS "idx_dictation_results_profile_date_mode";

DELETE FROM "dictation_results" a
USING "dictation_results" b
WHERE a.profile_id = b.profile_id
  AND a.date = b.date
  AND a.mode = b.mode
  AND a.created_at < b.created_at;

ALTER TABLE "dictation_results" DROP COLUMN IF EXISTS "completion_key";
CREATE UNIQUE INDEX "uniq_dictation_results_profile_date_mode"
  ON "dictation_results" USING btree ("profile_id","date","mode");
```

Data loss: possible. The delete step keeps the newest row per old uniqueness key and removes legitimate additional completions that the forward migration allowed.
