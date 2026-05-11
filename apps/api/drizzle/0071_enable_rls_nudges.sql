-- 0071_enable_rls_nudges.sql
-- Enables Row Level Security on the nudges table created in 0070. Same
-- pattern as 0066_enable_rls_pending_tables.sql — the [ASSUMP-F14] invariant
-- requires every profile-scoped table to declare ENABLE ROW LEVEL SECURITY
-- in a migration as defense-in-depth, even when app-layer scoping handles
-- enforcement at runtime.

ALTER TABLE "nudges" ENABLE ROW LEVEL SECURITY;
