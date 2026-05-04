# Rollback — 0051_special_ronan

## Changes in this migration

1. Pre-emptive `DELETE` from `xp_ledger` to dedup any `(profile_id, topic_id)` pairs that have more than one row, keeping the most recently earned row.
2. Create `UNIQUE INDEX xp_ledger_profile_topic_unique ON xp_ledger (profile_id, topic_id)`.

## Rollback

**Possible:** Partial. The unique index can be dropped without side effects. The DELETE in step 1 cannot be undone — duplicate `xp_ledger` rows that existed before the migration are permanently lost. In practice these duplicates only exist in the rare race where two concurrent session closes for the same topic both passed the application-level `findFirst` dedup check.

## Partial-application failure mode

The original (un-wrapped) version of this migration ran the DELETE and the CREATE UNIQUE INDEX as separate auto-commit chunks (`--> statement-breakpoint`). If the index build had failed — for example because a *new* duplicate was inserted by a concurrent worker between the DELETE and the index creation — the DELETE would have already committed and the table would be in a state where (a) the historical duplicates were destroyed and (b) no uniqueness invariant was enforced going forward.

Production was deployed against this un-wrapped form. The window was narrow (the index build is sub-second on the production row count), no failure was observed, and the production table has been verified to hold the unique index. Test / CI / fresh-dev databases run the wrapped version (`BEGIN; … COMMIT;`) so the failure mode no longer exists for new environments.

If a future re-deploy of this migration is needed against an environment that has not yet run it, the wrapped form will roll back the DELETE on any index-build failure — preventing the data-loss-without-index outcome described above.

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
