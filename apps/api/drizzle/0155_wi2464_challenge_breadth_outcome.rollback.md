# Rollback — 0155_wi2464_challenge_breadth_outcome

## Changes in this migration

The migration extends the Challenge Round cooldown outcome constraint to accept
`4`, the `insufficient_breadth` completion result.

## Rollback

**Possible:** Yes, after application rollback.

**Data loss:** Rows with `last_outcome = 4` must be removed or remapped before
restoring the old constraint.

**Procedure:**

```sql
UPDATE "challenge_round_cooldowns"
SET "last_outcome" = 1
WHERE "last_outcome" = 4;

ALTER TABLE "challenge_round_cooldowns"
  DROP CONSTRAINT "challenge_round_cooldowns_last_outcome_range";

ALTER TABLE "challenge_round_cooldowns"
  ADD CONSTRAINT "challenge_round_cooldowns_last_outcome_range"
  CHECK (
    "last_outcome" IS NULL
    OR ("last_outcome" >= 0 AND "last_outcome" <= 3)
  );
```

**Side effects on rollback:**

- Remapped rows retain the 24-hour cooldown but lose the distinction between
  insufficient breadth and a partial learner answer.
- Roll back the application changes in lockstep so no new outcome `4` writes
  occur after the old constraint is restored.
