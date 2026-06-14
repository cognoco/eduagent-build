-- M-REPOINT preview — the 58 concrete ALTER statements the m-repoint.sql
-- DO-block emits when generated against the STAGING catalog on 2026-06-14.
-- FOR HUMAN REVIEW ONLY. Do NOT apply this file directly — at the freeze,
-- m-repoint.sql regenerates from the frozen catalog (the set may differ;
-- the catalog is authoritative, not this snapshot — cutover-plan §2.7).
-- Source: pg_constraint, mapping profiles->person, subscriptions->subscription.
-- 54 -> person, 4 -> subscription. All ON DELETE CASCADE except the one SET NULL.

ALTER TABLE assessments
  DROP CONSTRAINT assessments_profile_id_profiles_id_fk,
  ADD CONSTRAINT assessments_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE bookmarks
  DROP CONSTRAINT bookmarks_profile_id_profiles_id_fk,
  ADD CONSTRAINT bookmarks_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE celebration_events
  DROP CONSTRAINT celebration_events_profile_id_profiles_id_fk,
  ADD CONSTRAINT celebration_events_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE challenge_round_cooldowns
  DROP CONSTRAINT challenge_round_cooldowns_profile_id_profiles_id_fk,
  ADD CONSTRAINT challenge_round_cooldowns_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE child_cap_notifications
  DROP CONSTRAINT child_cap_notifications_child_profile_id_profiles_id_fk,
  ADD CONSTRAINT child_cap_notifications_child_profile_id_person_id_fk
    FOREIGN KEY (child_profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE child_cap_notifications
  DROP CONSTRAINT child_cap_notifications_owner_profile_id_profiles_id_fk,
  ADD CONSTRAINT child_cap_notifications_owner_profile_id_person_id_fk
    FOREIGN KEY (owner_profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE coaching_card_cache
  DROP CONSTRAINT coaching_card_cache_profile_id_profiles_id_fk,
  ADD CONSTRAINT coaching_card_cache_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE concept_mastery
  DROP CONSTRAINT concept_mastery_profile_id_profiles_id_fk,
  ADD CONSTRAINT concept_mastery_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE concepts
  DROP CONSTRAINT concepts_profile_id_profiles_id_fk,
  ADD CONSTRAINT concepts_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE curriculum_adaptations
  DROP CONSTRAINT curriculum_adaptations_profile_id_profiles_id_fk,
  ADD CONSTRAINT curriculum_adaptations_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE curriculum_topics
  DROP CONSTRAINT curriculum_topics_source_child_profile_id_profiles_id_fk,
  ADD CONSTRAINT curriculum_topics_source_child_profile_id_person_id_fk
    FOREIGN KEY (source_child_profile_id) REFERENCES person(id) ON DELETE SET NULL;

ALTER TABLE dictation_results
  DROP CONSTRAINT dictation_results_profile_id_profiles_id_fk,
  ADD CONSTRAINT dictation_results_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE family_preferences
  DROP CONSTRAINT family_preferences_owner_profile_id_profiles_id_fk,
  ADD CONSTRAINT family_preferences_owner_profile_id_person_id_fk
    FOREIGN KEY (owner_profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE learning_modes
  DROP CONSTRAINT learning_modes_profile_id_profiles_id_fk,
  ADD CONSTRAINT learning_modes_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE learning_profiles
  DROP CONSTRAINT learning_profiles_profile_id_profiles_id_fk,
  ADD CONSTRAINT learning_profiles_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE learning_sessions
  DROP CONSTRAINT learning_sessions_profile_id_profiles_id_fk,
  ADD CONSTRAINT learning_sessions_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE memory_dedup_decisions
  DROP CONSTRAINT memory_dedup_decisions_profile_id_profiles_id_fk,
  ADD CONSTRAINT memory_dedup_decisions_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE memory_facts
  DROP CONSTRAINT memory_facts_profile_id_profiles_id_fk,
  ADD CONSTRAINT memory_facts_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE mentor_activity_ledger
  DROP CONSTRAINT mentor_activity_ledger_profile_id_profiles_id_fk,
  ADD CONSTRAINT mentor_activity_ledger_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE milestones
  DROP CONSTRAINT milestones_profile_id_profiles_id_fk,
  ADD CONSTRAINT milestones_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE monthly_reports
  DROP CONSTRAINT monthly_reports_child_profile_id_profiles_id_fk,
  ADD CONSTRAINT monthly_reports_child_profile_id_person_id_fk
    FOREIGN KEY (child_profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE monthly_reports
  DROP CONSTRAINT monthly_reports_profile_id_profiles_id_fk,
  ADD CONSTRAINT monthly_reports_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE needs_deepening_topics
  DROP CONSTRAINT needs_deepening_topics_profile_id_profiles_id_fk,
  ADD CONSTRAINT needs_deepening_topics_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE notification_log
  DROP CONSTRAINT notification_log_profile_id_profiles_id_fk,
  ADD CONSTRAINT notification_log_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE notification_preferences
  DROP CONSTRAINT notification_preferences_profile_id_profiles_id_fk,
  ADD CONSTRAINT notification_preferences_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE nudges
  DROP CONSTRAINT nudges_from_profile_id_profiles_id_fk,
  ADD CONSTRAINT nudges_from_profile_id_person_id_fk
    FOREIGN KEY (from_profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE nudges
  DROP CONSTRAINT nudges_to_profile_id_profiles_id_fk,
  ADD CONSTRAINT nudges_to_profile_id_person_id_fk
    FOREIGN KEY (to_profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE onboarding_drafts
  DROP CONSTRAINT onboarding_drafts_profile_id_profiles_id_fk,
  ADD CONSTRAINT onboarding_drafts_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE parking_lot_items
  DROP CONSTRAINT parking_lot_items_profile_id_profiles_id_fk,
  ADD CONSTRAINT parking_lot_items_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE pending_notices
  DROP CONSTRAINT pending_notices_owner_profile_id_profiles_id_fk,
  ADD CONSTRAINT pending_notices_owner_profile_id_person_id_fk
    FOREIGN KEY (owner_profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE practice_activity_events
  DROP CONSTRAINT practice_activity_events_profile_id_profiles_id_fk,
  ADD CONSTRAINT practice_activity_events_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE profile_quota_usage
  DROP CONSTRAINT profile_quota_usage_profile_id_profiles_id_fk,
  ADD CONSTRAINT profile_quota_usage_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE profile_quota_usage
  DROP CONSTRAINT profile_quota_usage_subscription_id_subscriptions_id_fk,
  ADD CONSTRAINT profile_quota_usage_subscription_id_subscription_id_fk
    FOREIGN KEY (subscription_id) REFERENCES subscription(id) ON DELETE CASCADE;

ALTER TABLE progress_snapshots
  DROP CONSTRAINT progress_snapshots_profile_id_profiles_id_fk,
  ADD CONSTRAINT progress_snapshots_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE progress_summaries
  DROP CONSTRAINT progress_summaries_profile_id_profiles_id_fk,
  ADD CONSTRAINT progress_summaries_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE quiz_mastery_items
  DROP CONSTRAINT quiz_mastery_items_profile_id_profiles_id_fk,
  ADD CONSTRAINT quiz_mastery_items_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE quiz_missed_items
  DROP CONSTRAINT quiz_missed_items_profile_id_profiles_id_fk,
  ADD CONSTRAINT quiz_missed_items_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE quiz_rounds
  DROP CONSTRAINT quiz_rounds_profile_id_profiles_id_fk,
  ADD CONSTRAINT quiz_rounds_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE quota_pools
  DROP CONSTRAINT quota_pools_subscription_id_subscriptions_id_fk,
  ADD CONSTRAINT quota_pools_subscription_id_subscription_id_fk
    FOREIGN KEY (subscription_id) REFERENCES subscription(id) ON DELETE CASCADE;

ALTER TABLE retention_cards
  DROP CONSTRAINT retention_cards_profile_id_profiles_id_fk,
  ADD CONSTRAINT retention_cards_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE session_embeddings
  DROP CONSTRAINT session_embeddings_profile_id_profiles_id_fk,
  ADD CONSTRAINT session_embeddings_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE session_events
  DROP CONSTRAINT session_events_profile_id_profiles_id_fk,
  ADD CONSTRAINT session_events_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE session_summaries
  DROP CONSTRAINT session_summaries_profile_id_profiles_id_fk,
  ADD CONSTRAINT session_summaries_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE streaks
  DROP CONSTRAINT streaks_profile_id_profiles_id_fk,
  ADD CONSTRAINT streaks_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE subjects
  DROP CONSTRAINT subjects_profile_id_profiles_id_fk,
  ADD CONSTRAINT subjects_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE support_messages
  DROP CONSTRAINT support_messages_profile_id_profiles_id_fk,
  ADD CONSTRAINT support_messages_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE teaching_preferences
  DROP CONSTRAINT teaching_preferences_profile_id_profiles_id_fk,
  ADD CONSTRAINT teaching_preferences_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE top_up_credits
  DROP CONSTRAINT top_up_credits_profile_id_profiles_id_fk,
  ADD CONSTRAINT top_up_credits_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE top_up_credits
  DROP CONSTRAINT top_up_credits_subscription_id_subscriptions_id_fk,
  ADD CONSTRAINT top_up_credits_subscription_id_subscription_id_fk
    FOREIGN KEY (subscription_id) REFERENCES subscription(id) ON DELETE CASCADE;

ALTER TABLE topic_notes
  DROP CONSTRAINT topic_notes_profile_id_profiles_id_fk,
  ADD CONSTRAINT topic_notes_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE usage_events
  DROP CONSTRAINT usage_events_profile_id_profiles_id_fk,
  ADD CONSTRAINT usage_events_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE usage_events
  DROP CONSTRAINT usage_events_subscription_id_subscriptions_id_fk,
  ADD CONSTRAINT usage_events_subscription_id_subscription_id_fk
    FOREIGN KEY (subscription_id) REFERENCES subscription(id) ON DELETE CASCADE;

ALTER TABLE vocabulary
  DROP CONSTRAINT vocabulary_profile_id_profiles_id_fk,
  ADD CONSTRAINT vocabulary_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE vocabulary_retention_cards
  DROP CONSTRAINT vocabulary_retention_cards_profile_id_profiles_id_fk,
  ADD CONSTRAINT vocabulary_retention_cards_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE weekly_reports
  DROP CONSTRAINT weekly_reports_child_profile_id_profiles_id_fk,
  ADD CONSTRAINT weekly_reports_child_profile_id_person_id_fk
    FOREIGN KEY (child_profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE weekly_reports
  DROP CONSTRAINT weekly_reports_profile_id_profiles_id_fk,
  ADD CONSTRAINT weekly_reports_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE withdrawal_archive_preferences
  DROP CONSTRAINT withdrawal_archive_preferences_owner_profile_id_profiles_id_fk,
  ADD CONSTRAINT withdrawal_archive_preferences_owner_profile_id_person_id_fk
    FOREIGN KEY (owner_profile_id) REFERENCES person(id) ON DELETE CASCADE;

ALTER TABLE xp_ledger
  DROP CONSTRAINT xp_ledger_profile_id_profiles_id_fk,
  ADD CONSTRAINT xp_ledger_profile_id_person_id_fk
    FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE;

