# Rollback: 0014 — Add `recall_nudge` to `notification_type` enum; create `topic_notes` table; set `curriculum_topics.book_id` NOT NULL

Migration:
- Adds `recall_nudge` value to `notification_type` enum via `ALTER TYPE ADD VALUE`
- Creates `topic_notes` table with a topic-per-profile unique constraint
- Backfills `curriculum_topics.book_id` and sets it `NOT NULL`

## Rollback

- **(a) Rollback possible?** Partially. The `topic_notes` table and the `book_id` NOT NULL constraint are reversible. The `recall_nudge` enum value added to `notification_type` is **not reversible** — PostgreSQL does not support `ALTER TYPE ... DROP VALUE`.

- **(b) Data lost?**
  - All rows in `topic_notes` are permanently destroyed on `DROP TABLE`.
  - If any `notifications` or related rows have `type = 'recall_nudge'`, those rows would become invalid when code no longer expects that type. They cannot be automatically cleaned up by the rollback.
  - The `book_id NOT NULL` constraint removal is safe (reverting to nullable) but loses the schema guarantee.

- **(c) Recovery procedure?**

  1. Ensure no business-critical `topic_notes` rows exist (or back them up separately).
  2. Apply the following SQL:
     ```sql
     DROP TABLE IF EXISTS "topic_notes" CASCADE;
     ALTER TABLE "curriculum_topics" ALTER COLUMN "book_id" DROP NOT NULL;
     -- NOTE: 'recall_nudge' value in notification_type CANNOT be removed.
     ```
  3. Revert the TypeScript schema and service code that references `topic_notes` and the `recall_nudge` notification type.
  4. Rebuild and redeploy the API Worker.
