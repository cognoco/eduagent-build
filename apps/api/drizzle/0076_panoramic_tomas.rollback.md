# Rollback — 0076_panoramic_tomas (BUG-4 dictation idempotency)

## Forward change

- Drops index `idx_dictation_results_profile_date` (non-unique, (profile_id, date)).
- Collapses pre-existing duplicate `(profile_id, date, mode)` rows by keeping the latest by `id` (UUIDv7 ordered).
- Creates unique index `uniq_dictation_results_profile_date_mode` on `(profile_id, date, mode)`.

## Rollback possible?

**Partial.** The schema change is fully reversible (drop unique index, recreate plain index). The pre-step DELETE is **not** reversible: rows collapsed by the dedup are permanently gone. In practice this is acceptable because:

- Pre-launch: there are no production users. Any duplicates collapsed in dev/staging are test data.
- The collapsed rows are by definition duplicates of the surviving row (same profile, same date, same mode) — the only information lost is the historic counts/reviewed flag of older retry attempts, which were superseded by the most recent attempt anyway.

## Rollback procedure

```sql
DROP INDEX "uniq_dictation_results_profile_date_mode";
CREATE INDEX "idx_dictation_results_profile_date"
  ON "dictation_results" USING btree ("profile_id", "date");
```

Then revert the schema file (`packages/database/src/schema/dictation.ts`) to use `index` instead of `uniqueIndex`, and revert the repository (`packages/database/src/repository.ts`) `dictationResults.insert()` to drop the `.onConflictDoUpdate({...})` clause.

## Data loss on rollback

None on the rollback itself — the rollback only swaps indexes. Forward-direction data loss (the pre-step DELETE) cannot be reversed without a prior backup.
