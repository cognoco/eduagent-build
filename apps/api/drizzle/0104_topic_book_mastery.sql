ALTER TABLE "retention_cards" ADD COLUMN IF NOT EXISTS "mastered_at" timestamp with time zone;
ALTER TABLE "curriculum_books" ADD COLUMN IF NOT EXISTS "mastered_at" timestamp with time zone;

UPDATE "retention_cards"
   SET "mastered_at" = COALESCE("last_reviewed_at", "updated_at")
 WHERE "xp_status" = 'verified'
   AND "mastered_at" IS NULL;

-- Runs after the retention_cards backfill above. Stamp books whose entire
-- non-skipped topic set is now mastered. Books with zero topics are not stamped.
UPDATE "curriculum_books" b
   SET "mastered_at" = NOW()
 WHERE b."mastered_at" IS NULL
   AND EXISTS (
     SELECT 1
       FROM "curriculum_topics" t
      WHERE t."book_id" = b."id"
        AND t."skipped" = false
   )
   AND NOT EXISTS (
     SELECT 1
       FROM "curriculum_topics" t
       LEFT JOIN "retention_cards" rc
         ON rc."topic_id" = t."id"
      WHERE t."book_id" = b."id"
        AND t."skipped" = false
        AND rc."mastered_at" IS NULL
   );
