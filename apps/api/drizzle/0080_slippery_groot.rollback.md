## Rollback — 0080 challenge_round_cooldowns

### Rollback possible?

Yes. The migration is purely additive — it creates a new standalone table for
the Challenge Round per-`(profile_id, topic_id)` decline cooldown. No data is
altered on any existing table, and no other table references this one yet.

### Data loss

Dropping the table loses any accumulated cooldown rows. Functional impact: a
learner who previously declined a Challenge Round offer for a given topic
could be re-offered the round before the 24h cooldown window naturally
elapses. This is user-visible but non-destructive — no learning state, no
mastery, no notes are affected. The trigger evaluator falls back to its
non-cooldown gates (struggle, retention, streak, quota) when the cooldown
row is absent.

Pre-launch, no real user data exists.

### Recovery procedure

```sql
DROP TABLE IF EXISTS "challenge_round_cooldowns";
```

The FKs cascade with the table drop. No additional cleanup needed.

### Caveats

- Any service or route that writes to `challenge_round_cooldowns` (added in
  subsequent Task 9 work — `recordCooldown` helper and `/decline` route) must
  be reverted in the same deploy as the table drop; otherwise the writer will
  500 with `relation "challenge_round_cooldowns" does not exist`. In this PR
  the table is added without any reader/writer wiring yet, so the rollback
  surface is currently nil.
