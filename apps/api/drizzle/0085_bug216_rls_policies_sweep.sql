-- 0085_bug216_rls_policies_sweep.sql
-- BUG-216: Add permissive USING / WITH CHECK RLS policies to the 37
-- profile-scoped tables that have ENABLE ROW LEVEL SECURITY (from
-- migrations 0027, 0029, 0058, 0066, 0071) but no policy yet.
--
-- Without policies, neondb_owner (current connection) bypasses RLS and
-- everything works, BUT a future Phase 2-4 switch to an app_user role would
-- produce zero visible rows on every covered table. This migration closes
-- that gap before the role switch lands.
--
-- Policy convention: profile_id = current_setting('app.current_profile_id').
-- Exceptions:
--   withdrawal_archive_preferences, pending_notices, family_preferences:
--     use owner_profile_id (not profile_id).
--   family_links: parent_profile_id OR child_profile_id (see below).
--
-- All CREATE POLICY statements are guarded by DO $$ BEGIN / IF NOT EXISTS so
-- the migration is safe to re-run (idempotent).
--
-- ## Rollback
-- See 0085_bug216_rls_policies_sweep.rollback.md

-- Helper macro used by every DO $$ block below:
--   IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
--                  AND tablename=<t> AND policyname=<p>) THEN
--     CREATE POLICY ...
--   END IF;

-- 1. assessments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='assessments' AND policyname='assessments_profile_isolation') THEN
    CREATE POLICY "assessments_profile_isolation" ON "assessments"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 2. retention_cards
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='retention_cards' AND policyname='retention_cards_profile_isolation') THEN
    CREATE POLICY "retention_cards_profile_isolation" ON "retention_cards"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 3. needs_deepening_topics
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='needs_deepening_topics' AND policyname='needs_deepening_topics_profile_isolation') THEN
    CREATE POLICY "needs_deepening_topics_profile_isolation" ON "needs_deepening_topics"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 4. teaching_preferences
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='teaching_preferences' AND policyname='teaching_preferences_profile_isolation') THEN
    CREATE POLICY "teaching_preferences_profile_isolation" ON "teaching_preferences"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 5. consent_states
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='consent_states' AND policyname='consent_states_profile_isolation') THEN
    CREATE POLICY "consent_states_profile_isolation" ON "consent_states"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 6. subjects
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subjects' AND policyname='subjects_profile_isolation') THEN
    CREATE POLICY "subjects_profile_isolation" ON "subjects"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 7. curriculum_adaptations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='curriculum_adaptations' AND policyname='curriculum_adaptations_profile_isolation') THEN
    CREATE POLICY "curriculum_adaptations_profile_isolation" ON "curriculum_adaptations"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 8. learning_sessions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='learning_sessions' AND policyname='learning_sessions_profile_isolation') THEN
    CREATE POLICY "learning_sessions_profile_isolation" ON "learning_sessions"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 9. session_events
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_events' AND policyname='session_events_profile_isolation') THEN
    CREATE POLICY "session_events_profile_isolation" ON "session_events"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 10. session_summaries
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_summaries' AND policyname='session_summaries_profile_isolation') THEN
    CREATE POLICY "session_summaries_profile_isolation" ON "session_summaries"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 11. parking_lot_items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='parking_lot_items' AND policyname='parking_lot_items_profile_isolation') THEN
    CREATE POLICY "parking_lot_items_profile_isolation" ON "parking_lot_items"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 12. streaks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='streaks' AND policyname='streaks_profile_isolation') THEN
    CREATE POLICY "streaks_profile_isolation" ON "streaks"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 13. xp_ledger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='xp_ledger' AND policyname='xp_ledger_profile_isolation') THEN
    CREATE POLICY "xp_ledger_profile_isolation" ON "xp_ledger"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 14. notification_log
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notification_log' AND policyname='notification_log_profile_isolation') THEN
    CREATE POLICY "notification_log_profile_isolation" ON "notification_log"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 15. learning_modes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='learning_modes' AND policyname='learning_modes_profile_isolation') THEN
    CREATE POLICY "learning_modes_profile_isolation" ON "learning_modes"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 16. coaching_card_cache
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='coaching_card_cache' AND policyname='coaching_card_cache_profile_isolation') THEN
    CREATE POLICY "coaching_card_cache_profile_isolation" ON "coaching_card_cache"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 17. vocabulary
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='vocabulary' AND policyname='vocabulary_profile_isolation') THEN
    CREATE POLICY "vocabulary_profile_isolation" ON "vocabulary"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 18. vocabulary_retention_cards
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='vocabulary_retention_cards' AND policyname='vocabulary_retention_cards_profile_isolation') THEN
    CREATE POLICY "vocabulary_retention_cards_profile_isolation" ON "vocabulary_retention_cards"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 19. session_embeddings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_embeddings' AND policyname='session_embeddings_profile_isolation') THEN
    CREATE POLICY "session_embeddings_profile_isolation" ON "session_embeddings"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 20. dictation_results
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dictation_results' AND policyname='dictation_results_profile_isolation') THEN
    CREATE POLICY "dictation_results_profile_isolation" ON "dictation_results"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 21. learning_profiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='learning_profiles' AND policyname='learning_profiles_profile_isolation') THEN
    CREATE POLICY "learning_profiles_profile_isolation" ON "learning_profiles"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 22. progress_snapshots
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='progress_snapshots' AND policyname='progress_snapshots_profile_isolation') THEN
    CREATE POLICY "progress_snapshots_profile_isolation" ON "progress_snapshots"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 23. milestones
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='milestones' AND policyname='milestones_profile_isolation') THEN
    CREATE POLICY "milestones_profile_isolation" ON "milestones"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 24. monthly_reports
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='monthly_reports' AND policyname='monthly_reports_profile_isolation') THEN
    CREATE POLICY "monthly_reports_profile_isolation" ON "monthly_reports"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 25. topic_notes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='topic_notes' AND policyname='topic_notes_profile_isolation') THEN
    CREATE POLICY "topic_notes_profile_isolation" ON "topic_notes"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 26. memory_facts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='memory_facts' AND policyname='memory_facts_profile_isolation') THEN
    CREATE POLICY "memory_facts_profile_isolation" ON "memory_facts"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 27. memory_dedup_decisions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='memory_dedup_decisions' AND policyname='memory_dedup_decisions_profile_isolation') THEN
    CREATE POLICY "memory_dedup_decisions_profile_isolation" ON "memory_dedup_decisions"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 28. nudges (both sides must be visible to the current profile)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nudges' AND policyname='nudges_profile_isolation') THEN
    CREATE POLICY "nudges_profile_isolation" ON "nudges"
      USING (
        "from_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid
        OR "to_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid
      )
      WITH CHECK (
        "from_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid
      );
  END IF;
END $$;

-- 29. withdrawal_archive_preferences (owner_profile_id scoping)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='withdrawal_archive_preferences' AND policyname='withdrawal_archive_preferences_profile_isolation') THEN
    CREATE POLICY "withdrawal_archive_preferences_profile_isolation" ON "withdrawal_archive_preferences"
      USING ("owner_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("owner_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 30. pending_notices (owner_profile_id scoping)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pending_notices' AND policyname='pending_notices_profile_isolation') THEN
    CREATE POLICY "pending_notices_profile_isolation" ON "pending_notices"
      USING ("owner_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("owner_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 31. family_links (parent or child is the current profile)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='family_links' AND policyname='family_links_profile_isolation') THEN
    CREATE POLICY "family_links_profile_isolation" ON "family_links"
      USING (
        "parent_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid
        OR "child_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid
      )
      WITH CHECK (
        "parent_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid
        OR "child_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid
      );
  END IF;
END $$;

-- 32. quiz_rounds
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_rounds' AND policyname='quiz_rounds_profile_isolation') THEN
    CREATE POLICY "quiz_rounds_profile_isolation" ON "quiz_rounds"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 33. quiz_missed_items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_missed_items' AND policyname='quiz_missed_items_profile_isolation') THEN
    CREATE POLICY "quiz_missed_items_profile_isolation" ON "quiz_missed_items"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 34. quiz_mastery_items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_mastery_items' AND policyname='quiz_mastery_items_profile_isolation') THEN
    CREATE POLICY "quiz_mastery_items_profile_isolation" ON "quiz_mastery_items"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 35. bookmarks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookmarks' AND policyname='bookmarks_profile_isolation') THEN
    CREATE POLICY "bookmarks_profile_isolation" ON "bookmarks"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 36. progress_summaries
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='progress_summaries' AND policyname='progress_summaries_profile_isolation') THEN
    CREATE POLICY "progress_summaries_profile_isolation" ON "progress_summaries"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 37. support_messages
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='support_messages' AND policyname='support_messages_profile_isolation') THEN
    CREATE POLICY "support_messages_profile_isolation" ON "support_messages"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;

-- 38. weekly_reports
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='weekly_reports' AND policyname='weekly_reports_profile_isolation') THEN
    CREATE POLICY "weekly_reports_profile_isolation" ON "weekly_reports"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;
