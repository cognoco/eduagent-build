-- 0066_enable_rls_pending_tables.sql
-- Enables Row Level Security on profile-scoped tables created in
-- migrations 0063, 0064, 0065 that were missing the ENABLE flag. Same
-- pattern as 0058_memory_facts_enable_rls.sql. family_preferences also gets
-- its owner-profile policy here because it is read directly by app features in
-- this branch.

ALTER TABLE "memory_dedup_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "withdrawal_archive_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pending_notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_preferences" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_preferences_profile_isolation" ON "family_preferences"
  USING (
    "owner_profile_id" = NULLIF(current_setting('app.profile_id', true), '')::uuid
  )
  WITH CHECK (
    "owner_profile_id" = NULLIF(current_setting('app.profile_id', true), '')::uuid
  );
