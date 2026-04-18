-- S-06 Phase 1: Create app_user role and enable RLS on profile-scoped tables
-- SAFE: owner role (neondb_owner) bypasses RLS. No behavior change until
-- a future phase switches the connection role to app_user.
--
-- TODO(S-06-phase2): No CREATE POLICY statements exist yet. Before activating
-- the app_user connection role (Phase 2–4), permissive RLS policies must be
-- added for every table below. Without policies, app_user sees zero rows and
-- all writes are blocked. Do NOT activate app_user before policies land.
--
-- ## Rollback
-- This migration is non-destructive (no data is dropped). To roll back:
--   ALTER TABLE <each table below> DISABLE ROW LEVEL SECURITY;
--   REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM app_user;
--   REVOKE USAGE ON SCHEMA public FROM app_user;
--   DROP ROLE IF EXISTS app_user;
-- No data is lost by rolling back — RLS enablement is metadata-only.

-- 1. Create app_user role (idempotent)
DO $$ BEGIN
  CREATE ROLE app_user NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Grant app_user schema access
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- 3. Enable RLS on all 22 profile-scoped tables
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE needs_deepening_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_adaptations ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_lot_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_card_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary_retention_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dictation_results ENABLE ROW LEVEL SECURITY;

-- 4. Enable RLS on account-scoped + special tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE top_up_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_links ENABLE ROW LEVEL SECURITY;
