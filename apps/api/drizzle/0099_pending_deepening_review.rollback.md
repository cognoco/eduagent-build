# Rollback - 0099_pending_deepening_review

**Feature:** Challenge Round mastery verification (L15-001)
**Effect:** Adds enum value `pending_review` to `needs_deepening_status` and
column `pending_expires_at` (timestamptz, nullable) to `needs_deepening_topics`.

## Is rollback possible?

**Partial.** Postgres has no `ALTER TYPE ... DROP VALUE`, so the
`pending_review` enum value cannot be removed in place once committed. The
column can be dropped trivially. Full revert requires rebuilding the enum
type, which is a multi-step procedure that briefly locks the table.

## Rollback SQL

Trivial revert (drop the column only, leaves the orphaned enum value):

```sql
ALTER TABLE "needs_deepening_topics" DROP COLUMN "pending_expires_at";
```

Full revert (recreate the enum type without `pending_review`):

```sql
-- 1. Purge any rows in pending_review state (DATA LOSS; see below)
DELETE FROM needs_deepening_topics WHERE status = 'pending_review';

-- 2. Build the replacement type
CREATE TYPE needs_deepening_status_new AS ENUM ('active', 'resolved');

-- 3. Re-point the column at the new type
ALTER TABLE needs_deepening_topics
  ALTER COLUMN status TYPE needs_deepening_status_new
  USING status::text::needs_deepening_status_new;

-- 4. Swap the type names
DROP TYPE needs_deepening_status;
ALTER TYPE needs_deepening_status_new RENAME TO needs_deepening_status;

-- 5. Drop the column
ALTER TABLE needs_deepening_topics DROP COLUMN pending_expires_at;
```

## What data is lost

All `needs_deepening_topics` rows in `status = 'pending_review'` (Challenge
Round concepts flagged as `partial`/`missing`/`misconception` and not yet
promoted by a corroborating signal). These rows represent learner-specific
weak-spot evidence with no equivalent in any other table; once deleted, the
"this learner had a wobble on this concept" signal is gone.

## Why rollback should be unnecessary

The change is purely additive at the schema level. Application code that
reads `pending_expires_at` is null-tolerant (`isoDateField.nullable()` in
the schema package). Application code that writes `status = 'pending_review'`
is gated by the Challenge Round runtime path and can be disabled without a
schema revert.

## Notes

- `ALTER TYPE ... ADD VALUE` cannot safely run in the same transaction chunk as
  later statements that depend on the new value. The migration uses Drizzle's
  `statement-breakpoint` marker and the journal entry uses `breakpoints: true`.
- If rollback is ever needed in production, prefer the trivial revert (drop
  the column only) and leave the enum value orphaned. Orphan enum values are
  harmless if no row writes them.
