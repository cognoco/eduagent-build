-- 0090_bug393_fk_indexes.sql
-- BUG-393: Add missing B-tree indexes on FK columns that lack index coverage.
--
-- Background: Postgres does not automatically index FK columns. Without
-- explicit indexes, ON DELETE CASCADE operations on the referenced table
-- (profiles) perform sequential scans on each FK-bearing child table, causing
-- O(N) delete times as row counts grow.
--
-- Columns covered by this migration:
--   1. session_summaries.profile_id
--   2. session_events.profile_id (subject_id covered separately)
--   3. parking_lot_items.profile_id
--   4. session_embeddings.profile_id
--   5. curriculum_adaptations.profile_id
--   6. assessments.profile_id
--   7. retention_cards.profile_id
--   8. needs_deepening_topics.profile_id
--   9. teaching_preferences.profile_id
--  10. topic_notes.profile_id
--  11. bookmarks.profile_id
--
-- Intentionally excluded (already covered):
--   - subjects.profile_id           — unique index (subjects_profile_name_uq)
--   - learning_sessions.profile_id  — composite index (learning_sessions_profile_...)
--   - streaks.profile_id            — primary key or unique
--   - xp_ledger.profile_id          — composite index
--   - notification_log.profile_id   — composite index
--   - learning_modes.profile_id     — primary key or unique
--   - coaching_card_cache.profile_id — primary key or unique
--   - vocabulary.profile_id         — composite index
--   - vocabulary_retention_cards.profile_id — composite
--   - memory_facts.profile_id       — composite index
--   - memory_dedup_decisions.profile_id — leftmost column of compound PK
--   - quiz_rounds.profile_id        — idx_quiz_rounds_profile_activity
--   - quiz_missed_items.profile_id  — idx_quiz_missed_items_profile
--   - quiz_mastery_items.profile_id — composite index
--   - nudges.from_profile_id / to_profile_id — handled separately
--   - family_links.parent_profile_id — already covered by the leftmost prefix
--     of the unique compound index family_links_parent_child_unique
--     (parentProfileId, childProfileId); no standalone index needed.
--   - family_links.child_profile_id — family_links_child_profile_id_idx (0000)
--
-- All CREATE INDEX statements use IF NOT EXISTS for idempotency.

CREATE INDEX IF NOT EXISTS "session_summaries_profile_id_idx"
  ON "session_summaries" ("profile_id");

CREATE INDEX IF NOT EXISTS "session_events_profile_id_idx"
  ON "session_events" ("profile_id");

CREATE INDEX IF NOT EXISTS "parking_lot_items_profile_id_idx"
  ON "parking_lot_items" ("profile_id");

CREATE INDEX IF NOT EXISTS "session_embeddings_profile_id_idx"
  ON "session_embeddings" ("profile_id");

CREATE INDEX IF NOT EXISTS "curriculum_adaptations_profile_id_idx"
  ON "curriculum_adaptations" ("profile_id");

CREATE INDEX IF NOT EXISTS "assessments_profile_id_idx"
  ON "assessments" ("profile_id");

CREATE INDEX IF NOT EXISTS "retention_cards_profile_id_idx"
  ON "retention_cards" ("profile_id");

CREATE INDEX IF NOT EXISTS "needs_deepening_topics_profile_id_idx"
  ON "needs_deepening_topics" ("profile_id");

CREATE INDEX IF NOT EXISTS "teaching_preferences_profile_id_idx"
  ON "teaching_preferences" ("profile_id");

CREATE INDEX IF NOT EXISTS "topic_notes_profile_id_idx"
  ON "topic_notes" ("profile_id");

CREATE INDEX IF NOT EXISTS "bookmarks_profile_id_idx"
  ON "bookmarks" ("profile_id");
