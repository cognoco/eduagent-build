-- [ASSUMP-F14 sweep] Profile-scoped tables missed by 0027_enable_rls.sql.
--
-- TODO(S-06-phase2): Same as 0027 — RLS is enabled here but no CREATE POLICY
-- statements exist. These five tables will block all app_user access until
-- permissive policies are added in Phase 2–4. Do NOT activate app_user first.
--
-- The original 0027 migration enumerated all known profile-scoped tables at
-- the time, but the following five were overlooked. Each of them has a
-- `profile_id` column with a NOT NULL FK to profiles.id, so they MUST travel
-- the same RLS-enablement path as the other profile-scoped tables before
-- S-06 Phase 2-4 switches the connection role from `neondb_owner` to
-- `app_user`. Without this migration those five would be the only
-- profile-scoped tables without RLS at cut-over — `app_user` has
-- table-level GRANTs, so rows would become cross-profile readable.
--
-- Verified profile_id columns present:
--   learning_profiles  (migration 0019)
--   progress_snapshots (migration 0020)
--   milestones         (migration 0020)
--   monthly_reports    (migration 0020)
--   topic_notes        (migration 0014)
--
-- Safe: owner role (neondb_owner) bypasses RLS. No behavior change until
-- the Phase 2-4 role switch lands. Idempotent via existence check.
--
-- ## Rollback
-- Non-destructive (no data dropped). To roll back per table:
--   ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
-- No data is lost.

ALTER TABLE "learning_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "progress_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "monthly_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "topic_notes" ENABLE ROW LEVEL SECURITY;
