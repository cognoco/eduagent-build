# Rollback — 0046_stormy_cassandra_nova

## Changes in this migration

1. `ALTER TYPE "draft_status" ADD VALUE 'completing'`
2. `ALTER TYPE "draft_status" ADD VALUE 'failed'`
3. `ALTER TYPE "notification_type" ADD VALUE 'interview_ready'`
4. `ALTER TABLE "onboarding_drafts" ADD COLUMN "failure_code" text`
5. `ALTER TABLE "session_events" ADD COLUMN "orphan_reason" text`

## Rollback

**Possible:** Partial. Columns can be dropped; enum values CANNOT be removed in PostgreSQL without recreating the type.

**Data loss:**
- `onboarding_drafts.failure_code` values are dropped.
- `session_events.orphan_reason` values are dropped. Orphan turns already written remain in `session_events` and in `onboardingDrafts.exchangeHistory` JSONB — the rows are still readable as plain user messages.
- Enum values `completing`, `failed`, `interview_ready` persist in the type definition (PostgreSQL limitation) but become dead entries. Rows referencing them must be migrated first.

**Procedure:**
```sql
-- Drop additive columns (safe)
ALTER TABLE "onboarding_drafts" DROP COLUMN "failure_code";
ALTER TABLE "session_events" DROP COLUMN "orphan_reason";

-- Migrate rows using new enum values BEFORE attempting type drop
UPDATE "onboarding_drafts" SET "status" = 'in_progress' WHERE "status" IN ('completing', 'failed');

-- Enum values cannot be removed without DROP TYPE + recreate.
-- If required, the full procedure is:
--   1. Rename existing type: ALTER TYPE draft_status RENAME TO draft_status_old;
--   2. Create new type without the values: CREATE TYPE draft_status AS ENUM('in_progress', 'completed', 'expired');
--   3. Alter column: ALTER TABLE onboarding_drafts ALTER COLUMN status TYPE draft_status USING status::text::draft_status;
--   4. Drop old: DROP TYPE draft_status_old;
-- Same pattern for notification_type removing 'interview_ready'.
```

**Side effects on rollback:**
- Any draft in `completing` or `failed` status will fail to query until migrated.
- Push notifications of type `interview_ready` will fail to insert.
- The `InterviewCompletingPanel` mobile component will render an error state.
