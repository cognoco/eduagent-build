-- 0125_rls_concepts_concept_mastery_policy.sql
-- WI-1104: Add profile-isolation RLS USING + WITH CHECK policies for concepts
-- and concept_mastery. Both tables had RLS ENABLED in migrations 0107/0113 but
-- shipped with no USING policy, deferring isolation via EXPLICITLY_EXCLUDED_TABLES.
-- This migration closes that gap before CONCEPT_CAPTURE_ENABLED is flipped true.
--
-- Policy convention: matches 0085_bug216_rls_policies_sweep.sql and
-- 0112_rls_mentor_activity_ledger.sql — profile_id compared against
-- current_setting('app.current_profile_id', true) with ::uuid cast.
--
-- ## Rollback
-- DROP POLICY IF EXISTS "concepts_profile_isolation" ON "concepts";
-- DROP POLICY IF EXISTS "concept_mastery_profile_isolation" ON "concept_mastery";
-- No data is lost — policies are metadata-only. DISABLE ROW LEVEL SECURITY is
-- NOT included here; RLS was enabled by prior migrations and must remain enabled.

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'concepts' AND policyname = 'concepts_profile_isolation') THEN
    CREATE POLICY "concepts_profile_isolation" ON "concepts"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $;

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'concept_mastery' AND policyname = 'concept_mastery_profile_isolation') THEN
    CREATE POLICY "concept_mastery_profile_isolation" ON "concept_mastery"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $;
