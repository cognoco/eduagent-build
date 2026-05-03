-- Pre-emptively dedup any rows that violate the new (profile_id, topic_id)
-- uniqueness invariant. The application-level findFirst guard in
-- insertSessionXpEntry should already prevent these, but a concurrent-insert
-- race could have left duplicates in production. Keep the most recently
-- earned row (highest earned_at, tiebreak on id). The post-multiplier amount
-- is preserved because reflection_multiplier_applied wins on the kept row.
DELETE FROM "xp_ledger" a
USING "xp_ledger" b
WHERE a.profile_id = b.profile_id
  AND a.topic_id = b.topic_id
  AND (
    a.earned_at < b.earned_at
    OR (a.earned_at = b.earned_at AND a.id < b.id)
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "xp_ledger_profile_topic_unique" ON "xp_ledger" USING btree ("profile_id","topic_id");