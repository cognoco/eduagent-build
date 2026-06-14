-- =============================================================================
-- M-DROP — drop the 5 legacy identity tables + their 5 orphaned enum types.
-- WI-586 convergence runbook §4 step 8 (AFTER the flip + 24h soak; the final,
-- irreversible step). Pairs with m-repoint.sql (§4 step 6).
--
-- STATUS: INERT DRAFT. Lives under _wip/ deliberately — NOT in apps/api/drizzle/,
-- so it cannot auto-apply on a deploy. At the freeze it is promoted to the next
-- free migration number (e.g. 0118_m_drop.sql) per cutover-plan §1, AFTER
-- m-repoint has landed and the flip has soaked, then reviewed + applied.
--
-- PRECONDITION (enforced by Postgres, not by this file): M-REPOINT must have run
-- first. Every live (non-legacy) FK must already point at person/subscription —
-- otherwise the plain DROP TABLE below fails loud on the dangling dependency
-- (this is intentional: no CASCADE, so an un-repointed FK BLOCKS the drop rather
-- than being silently dropped). The single multi-table DROP TABLE statement
-- resolves the intra-legacy FKs among the 5 tables as a set.
--
-- The 5 tables (cutover-plan §4 step 8, verbatim):
--   consent_states, family_links, profiles, subscriptions, accounts
-- The 5 orphaned enum types (legacy-only; unused once the tables are gone):
--   consent_status, consent_type, location_type, subscription_status, subscription_tier
--
-- ## Rollback
-- IMPOSSIBLE in place. Once these tables drop, the legacy system-of-record rows
-- are gone. Recovery is ONLY a Neon PITR rewind of the whole branch to the
-- pre-cutover marker created at §4 step 2 (§4.2 "impossible post-drop"). This is
-- why M-DROP runs only after the flip has soaked 24h with the new model live and
-- verified. Do NOT promote/apply M-DROP until the §4 step-8 STOP gate is cleared
-- by the operator. IF EXISTS is present only so a rehearsal re-run is a clean
-- no-op — it is NOT a substitute for the PITR marker.
-- =============================================================================

DROP TABLE IF EXISTS consent_states, family_links, profiles, subscriptions, accounts;

DROP TYPE IF EXISTS consent_status, consent_type, location_type, subscription_status, subscription_tier;
