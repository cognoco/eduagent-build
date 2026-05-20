## Rollback — 0081 quiz_mastery_items.last_reviewed_at

### Rollback possible?

Yes. The migration is purely additive — it adds a new column on an existing
table and backfills from `updated_at`. No existing column is altered, dropped,
or renamed.

### Data loss

Dropping the column loses every per-row `last_reviewed_at` value. Functional
impact:

- Code reverted in lockstep with the column drop falls back to using
  `updated_at` as `lastReviewedAt` — the original bugged behavior. This is
  the exact state we are trying to fix, so rolling back re-introduces the
  bug but does not corrupt any other data.
- No XP, scores, missed-items, or user-visible learning state are affected.

Pre-launch, no real user data exists, so this is a non-event in practice.

### Recovery procedure

```sql
ALTER TABLE "quiz_mastery_items"
  DROP COLUMN IF EXISTS "last_reviewed_at";
```

### Caveats

- The code change in `packages/database/src/schema/quiz-mastery.ts`,
  `packages/database/src/repository.ts`, and
  `apps/api/src/services/quiz/complete-round.ts` must be reverted in the same
  deploy as the column drop. Otherwise:
  - The schema's `notNull()` on `lastReviewedAt` will cause Drizzle to refuse
    inserts.
  - `updateSm2` will set a non-existent column → "column does not exist".
  - `existing.lastReviewedAt` will be `undefined` and `applyQuizSm2` will
    crash on `.toISOString()`.
