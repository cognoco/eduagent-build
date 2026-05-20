## Rollback — 0083 mastery_challenge_verified_at + needs_deepening_topics weak-spot columns

### Rollback possible?

Yes. The migration is purely additive — it adds one nullable column to
`assessments` and four columns to `needs_deepening_topics`. No existing column
types, constraints, or indexes are modified. No existing rows are touched beyond
the `source` column defaulting to `'system_signal'` on existing
`needs_deepening_topics` rows.

### Data loss

- **`assessments.mastery_challenge_verified_at`:** Any challenge-verified
  timestamps recorded between deploy and rollback are permanently lost when the
  column is dropped. Pre-launch, no real user data exists, so data loss is nil
  in practice.
- **`needs_deepening_topics.source`:** The default `'system_signal'` is
  back-filled into every existing row automatically by the `DEFAULT` clause.
  Dropping the column discards any `'challenge_round'` source attributions
  written between deploy and rollback — also nil pre-launch.
- **`needs_deepening_topics.concept` / `misconception` / `correction`:** Any
  Challenge Round weak-spot detail (concept, misconception text, correction
  text) written between deploy and rollback is lost. Pre-launch, nil.

Existing `needs_deepening_topics` rows written before this migration survive a
rollback with no data loss — the only change is the server-filled `source`
column disappears, which is the same as it never existing.

### Recovery procedure

Issue the following DDL (in a single transaction or sequentially — both are safe
because all five are column drops with no dependent constraints):

```sql
ALTER TABLE "assessments"
  DROP COLUMN IF EXISTS "mastery_challenge_verified_at";

ALTER TABLE "needs_deepening_topics"
  DROP COLUMN IF EXISTS "source",
  DROP COLUMN IF EXISTS "concept",
  DROP COLUMN IF EXISTS "misconception",
  DROP COLUMN IF EXISTS "correction";
```

Then:

1. Revert `packages/database/src/schema/assessments.ts` (remove the five
   column additions).
2. Revert `packages/schemas/src/progress.ts` (remove
   `masteryChallengeVerifiedAt` from `topicProgressSchema`).
3. Re-run `pnpm run db:push:dev` to confirm the dev schema is clean.

No backup restoration required pre-launch. No FK cascades are affected — the
dropped columns are not referenced by any FK.

### Caveats

- Any service or route that reads or writes `mastery_challenge_verified_at` or
  the new `needs_deepening_topics` columns (Task 9 service code, shipped in a
  subsequent commit) must be reverted in the same deploy as the column drops;
  otherwise writers will 500 with `column does not exist`.
- In this PR the columns are added with no reader/writer wiring yet, so the
  rollback surface is currently nil.
