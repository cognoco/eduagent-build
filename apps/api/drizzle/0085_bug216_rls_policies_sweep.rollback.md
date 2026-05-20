# Rollback — 0085 RLS Policies Sweep (BUG-216)

## Rollback

> **WARNING: Rolling back this migration causes a data outage for any deployment that has already switched its connection role to `app_user`.** Without these policies, `app_user` sees zero rows on all 38 covered tables, making every authenticated API request behave as if the database is empty. Roll back only if `app_user` is NOT the active connection role in the target environment. Verify with: `SELECT current_role;`

### (a) Is rollback possible?

Yes, **if and only if the `app_user` role is not yet the active connection role**. Until Phase 2-4 of S-06 lands (which switches the worker connection from `neondb_owner` to `app_user`), `neondb_owner` bypasses RLS entirely and policy presence or absence is invisible to the application. Rolling back before the role switch is non-impactful.

After the role switch, rolling back this migration would drop all 38 policies and make every profile-scoped table return zero rows to `app_user` — a full application outage.

### (b) Data lost?

None. This migration only creates policies (metadata). No rows are modified, inserted, or deleted.

### (c) Recovery procedure

Drop all policies created in the forward migration (idempotent `IF EXISTS`):

```sql
DROP POLICY IF EXISTS "assessments_profile_isolation" ON "assessments";
DROP POLICY IF EXISTS "retention_cards_profile_isolation" ON "retention_cards";
DROP POLICY IF EXISTS "needs_deepening_topics_profile_isolation" ON "needs_deepening_topics";
DROP POLICY IF EXISTS "teaching_preferences_profile_isolation" ON "teaching_preferences";
DROP POLICY IF EXISTS "consent_states_profile_isolation" ON "consent_states";
DROP POLICY IF EXISTS "subjects_profile_isolation" ON "subjects";
DROP POLICY IF EXISTS "curriculum_adaptations_profile_isolation" ON "curriculum_adaptations";
DROP POLICY IF EXISTS "learning_sessions_profile_isolation" ON "learning_sessions";
DROP POLICY IF EXISTS "session_events_profile_isolation" ON "session_events";
DROP POLICY IF EXISTS "session_summaries_profile_isolation" ON "session_summaries";
DROP POLICY IF EXISTS "parking_lot_items_profile_isolation" ON "parking_lot_items";
DROP POLICY IF EXISTS "streaks_profile_isolation" ON "streaks";
DROP POLICY IF EXISTS "xp_ledger_profile_isolation" ON "xp_ledger";
DROP POLICY IF EXISTS "notification_log_profile_isolation" ON "notification_log";
DROP POLICY IF EXISTS "learning_modes_profile_isolation" ON "learning_modes";
DROP POLICY IF EXISTS "coaching_card_cache_profile_isolation" ON "coaching_card_cache";
DROP POLICY IF EXISTS "vocabulary_profile_isolation" ON "vocabulary";
DROP POLICY IF EXISTS "vocabulary_retention_cards_profile_isolation" ON "vocabulary_retention_cards";
DROP POLICY IF EXISTS "session_embeddings_profile_isolation" ON "session_embeddings";
DROP POLICY IF EXISTS "dictation_results_profile_isolation" ON "dictation_results";
DROP POLICY IF EXISTS "learning_profiles_profile_isolation" ON "learning_profiles";
DROP POLICY IF EXISTS "progress_snapshots_profile_isolation" ON "progress_snapshots";
DROP POLICY IF EXISTS "milestones_profile_isolation" ON "milestones";
DROP POLICY IF EXISTS "monthly_reports_profile_isolation" ON "monthly_reports";
DROP POLICY IF EXISTS "topic_notes_profile_isolation" ON "topic_notes";
DROP POLICY IF EXISTS "memory_facts_profile_isolation" ON "memory_facts";
DROP POLICY IF EXISTS "memory_dedup_decisions_profile_isolation" ON "memory_dedup_decisions";
DROP POLICY IF EXISTS "nudges_profile_isolation" ON "nudges";
DROP POLICY IF EXISTS "withdrawal_archive_preferences_profile_isolation" ON "withdrawal_archive_preferences";
DROP POLICY IF EXISTS "pending_notices_profile_isolation" ON "pending_notices";
DROP POLICY IF EXISTS "family_links_profile_isolation" ON "family_links";
DROP POLICY IF EXISTS "quiz_rounds_profile_isolation" ON "quiz_rounds";
DROP POLICY IF EXISTS "quiz_missed_items_profile_isolation" ON "quiz_missed_items";
DROP POLICY IF EXISTS "quiz_mastery_items_profile_isolation" ON "quiz_mastery_items";
DROP POLICY IF EXISTS "bookmarks_profile_isolation" ON "bookmarks";
DROP POLICY IF EXISTS "progress_summaries_profile_isolation" ON "progress_summaries";
DROP POLICY IF EXISTS "support_messages_profile_isolation" ON "support_messages";
DROP POLICY IF EXISTS "weekly_reports_profile_isolation" ON "weekly_reports";
```

Then remove this migration entry from `__drizzle_migrations` and redeploy the worker.
