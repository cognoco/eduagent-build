CREATE INDEX IF NOT EXISTS "session_summaries_session_profile_idx" ON "session_summaries" USING btree ("session_id","profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_summaries_purge_eligible_idx" ON "session_summaries" USING btree ("summary_generated_at") WHERE "purged_at" IS NULL;--> statement-breakpoint
DELETE FROM "session_embeddings"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "session_id", "profile_id"
        ORDER BY "created_at" DESC, "id" DESC
      ) AS "duplicate_rank"
    FROM "session_embeddings"
  ) AS "ranked_session_embeddings"
  WHERE "duplicate_rank" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "session_embeddings_session_profile_uq" ON "session_embeddings" USING btree ("session_id","profile_id");
