-- 0058_memory_facts_enable_rls.sql
-- Enables Row Level Security on memory_facts. Note: this is currently a
-- no-op at runtime because neon-http does not enforce RLS without per-
-- request session context (see project_neon_transaction_facts.md). The
-- ENABLE flag is set so that when RLS policies are introduced in a
-- follow-up they apply uniformly.

ALTER TABLE "memory_facts" ENABLE ROW LEVEL SECURITY;
