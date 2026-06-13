-- 0112_rls_mentor_activity_ledger.sql
-- WI-676: Enable RLS and add profile-isolation policy for mentor_activity_ledger.
--
-- mentor_activity_ledger (added in 0111_zippy_gateway.sql) is profile-scoped
-- (profile_id FK → profiles ON DELETE CASCADE) but 0111 shipped with no RLS
-- statement — a live data-isolation gap caught by [ASSUMP-F14].
--
-- Policy convention: matches the pattern established by 0085_bug216_rls_policies_sweep.sql
-- and 0110_feedback_retry_queue.sql — profile_id compared against
-- current_setting('app.current_profile_id', true) with ::uuid cast.
--
-- The DO $$ BEGIN ... IF NOT EXISTS ... END $$; guard makes this idempotent
-- (safe to re-run).
--
-- ## Rollback
-- ALTER TABLE "mentor_activity_ledger" DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "mentor_activity_ledger_profile_isolation" ON "mentor_activity_ledger";
-- No data is lost — RLS enablement and policies are metadata-only.

ALTER TABLE "mentor_activity_ledger" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mentor_activity_ledger' AND policyname='mentor_activity_ledger_profile_isolation') THEN
    CREATE POLICY "mentor_activity_ledger_profile_isolation" ON "mentor_activity_ledger"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;
