# Rollback — 0046_session_events_orphan_reason

**Possible:** Yes, additive-only.

**Data loss:** All `orphan_reason` values are dropped. Orphan turns already
written remain in `session_events` (and in `onboardingDrafts.exchangeHistory`
JSONB) WITH the `orphan_reason` field stripped — the rows are still readable
as plain user messages.

**Procedure:**
```sql
ALTER TABLE "session_events" DROP COLUMN "orphan_reason";
```

(Layer 1's `session_events_session_client_id_uniq` index is NOT touched —
it pre-dates this migration and is owned by 0045.)

**Side effects on rollback:**
- Parent transcript filter (Task 11, if shipped) becomes a no-op — the
  filter predicate looks for an absent column. Verify the filter handles
  `undefined` gracefully (it does: `!e.orphanReason` is truthy when the
  column is missing from the row, so orphan rows previously hidden become
  visible).
- The eval harness orphan-turn fixture (Task 12) becomes invalid — remove
  or revert.
