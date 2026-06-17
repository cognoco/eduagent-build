-- 0117_fix_family_preferences_rls_guc.sql
-- WI-794: Fix the family_preferences RLS GUC key.
--
-- The "family_preferences_profile_isolation" policy (added in
-- 0066_enable_rls_pending_tables.sql) reads current_setting('app.profile_id'),
-- but the app only ever sets app.current_profile_id -- the standard GUC every
-- other RLS policy isolates on. The mismatched key always resolves to NULL, so
-- `owner_profile_id = NULL` matches no row -> the policy is an effective
-- deny-all under RLS. Align it to app.current_profile_id (USING + WITH CHECK).
--
-- Reversible: ALTER POLICY back to app.profile_id restores the prior state; no
-- data is touched, so no Rollback section is required.

ALTER POLICY "family_preferences_profile_isolation" ON "family_preferences"
  USING (
    "owner_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid
  )
  WITH CHECK (
    "owner_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid
  );
