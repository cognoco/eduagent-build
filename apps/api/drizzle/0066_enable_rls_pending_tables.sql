-- 0066_enable_rls_pending_tables.sql
-- Enables Row Level Security on profile-scoped tables created in
-- migrations 0063, 0064, 0065 that were missing the ENABLE flag. Same
-- pattern as 0058_memory_facts_enable_rls.sql: this is a no-op at runtime
-- (no policies attached yet, and neon-serverless does not enforce RLS
-- without per-request session context — see project_neon_transaction_facts.md)
-- but satisfies the [ASSUMP-F14] static-analysis invariant in
-- packages/database/src/rls-coverage.test.ts so a follow-up policy
-- migration applies uniformly across all profile-scoped tables.

ALTER TABLE "memory_dedup_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "withdrawal_archive_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pending_notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_preferences" ENABLE ROW LEVEL SECURITY;
