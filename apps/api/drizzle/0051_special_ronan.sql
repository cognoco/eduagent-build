-- Pre-emptively dedup any rows that violate the new (profile_id, topic_id)
-- uniqueness invariant. The application-level findFirst guard in
-- insertSessionXpEntry should already prevent these, but a concurrent-insert
-- race could have left duplicates in production. Keep the most recently
-- earned row (highest earned_at, tiebreak on id). The post-multiplier amount
-- is preserved because reflection_multiplier_applied wins on the kept row.
--
-- Wrapped in a single explicit transaction so that if CREATE UNIQUE INDEX
-- fails (e.g. a fresh duplicate is inserted by a concurrent worker between
-- the DELETE and the index build) the DELETE is rolled back too. Without
-- the BEGIN/COMMIT envelope, drizzle-kit runs each chunk as its own
-- auto-commit and the data-loss-without-index failure mode is real.
BEGIN;

DELETE FROM "xp_ledger" a
USING "xp_ledger" b
WHERE a.profile_id = b.profile_id
  AND a.topic_id = b.topic_id
  AND (
    a.earned_at < b.earned_at
    OR (a.earned_at = b.earned_at AND a.id < b.id)
  );

CREATE UNIQUE INDEX "xp_ledger_profile_topic_unique" ON "xp_ledger" USING btree ("profile_id","topic_id");

COMMIT;