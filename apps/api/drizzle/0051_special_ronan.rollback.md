# Rollback — 0051_special_ronan

## Changes in this migration

1. Pre-emptive `DELETE` from `xp_ledger` to dedup any `(profile_id, topic_id)` pairs that have more than one row, keeping the most recently earned row.
2. Create `UNIQUE INDEX xp_ledger_profile_topic_unique ON xp_ledger (profile_id, topic_id)`.

## Rollback

**Possible:** Partial. The unique index can be dropped without side effects. The DELETE in step 1 cannot be undone — duplicate `xp_ledger` rows that existed before the migration are permanently lost. In practice these duplicates only exist in the rare race where two concurrent session closes for the same topic both passed the application-level `findFirst` dedup check.

**Data loss:**
- Up to N-1 XP ledger rows per `(profile_id, topic_id)` pair where duplicates existed at migration time. Total XP totals may shift slightly (decrease) for affected profiles.

**Procedure:**
```sql
DROP INDEX IF EXISTS "xp_ledger_profile_topic_unique";
```

**Side effects on rollback:**
- `insertSessionXpEntry` still uses `onConflictDoNothing({ target: [profile_id, topic_id] })`. Without the unique index, `onConflictDoNothing` silently degrades to a regular insert and the original race window reappears (low probability — application `findFirst` check still runs first).
- `applyReflectionMultiplier` resumes non-deterministic row selection if duplicates ever appear after rollback.

**Recommendation:** Do not roll this migration back unless the dedup DELETE proves to have removed legitimate distinct entries (extremely unlikely given the uniqueness invariant the application has always enforced via `findFirst`). If rollback is unavoidable, accept the data loss and re-deploy with monitoring on `xp_ledger` row counts per profile.
