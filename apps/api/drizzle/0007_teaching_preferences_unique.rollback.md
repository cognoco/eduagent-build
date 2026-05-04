# Rollback — 0007_teaching_preferences_unique

## Changes in this migration

1. Pre-flight `DELETE` of duplicate `teaching_preferences` rows, keeping only the most recently `updated_at` row per `(profile_id, subject_id)` pair.
2. Add unique constraint `teaching_preferences_profile_subject_unique` on `(profile_id, subject_id)`.

## Rollback

**Possible:** Partial. The constraint can be dropped trivially. The pre-flight `DELETE` in step 1 cannot be undone — duplicate rows that lost the "keep most-recent" tiebreaker are permanently gone from the table. Each duplicate is a per-subject teaching preference (tone, depth, pacing); losing it reverts the affected `(profile_id, subject_id)` pair to whatever the surviving row says.

**Data loss:**
- All `teaching_preferences` rows that were not the latest `updated_at` for their `(profile_id, subject_id)` pair at migration time. The latest row was retained verbatim, so any policy a user had for a given subject is preserved at its most recent value.

**Procedure:**
```sql
ALTER TABLE "teaching_preferences"
  DROP CONSTRAINT IF EXISTS "teaching_preferences_profile_subject_unique";
```

**Side effects on rollback:**
- Application code assumes one row per `(profile_id, subject_id)` after this migration. Dropping the constraint re-opens the duplicate-row write path; any code using `findFirst`/`limit(1)` on the pair will silently pick one of the duplicates non-deterministically.
- Already-deleted historical duplicates are not restored. Recovery requires a point-in-time DB restore from before this migration.

**Recommendation:** Do not roll back unless the constraint itself is the problem. The application contract assumes uniqueness; rolling back without re-asserting it in app code creates silent ambiguity bugs.
