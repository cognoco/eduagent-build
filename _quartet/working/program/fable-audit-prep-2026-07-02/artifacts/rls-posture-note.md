# RLS posture on identity-v2 tables — verified + calibrated

**Date:** 2026-07-02. **Method:** `pg_class.relrowsecurity/relforcerowsecurity` + `pg_policies`
count, live catalogs. Raw: `rls-identity-v2-{stg,prd}.txt`, `rls-control-stg.txt`, `rls-legacy-dev.txt`.

## Observation (schema file → looked critical)
`identity.ts` declares `.enableRLS()` on ONLY `consent_request` (agent map). 17 other identity-v2
tables have no `.enableRLS()`.

## Verified in live DB (stg + prd, identical)
**17 of 18 identity-v2 tables: RLS disabled, 0 policies.** The 13 operational tables — `person,
login, organization, membership, subscription, guardianship, supportership, consent_grant,
consent_receipt, deletion_audit, financial_record, subscription_payers` — plus the 5
policy-engine tables `regimes, policy_cells, policy_rules, knowledge_assertions, allowed_models`
(checked at audit close, all RLS-off, 0 policies). Only `consent_request`: RLS on, 1 policy.
(Policy tables are also inert — zero service consumers — so their RLS state is low-consequence.)

## Controls that de-escalate it to NOT-a-regression
- **Scoped leaf tables DO use RLS** (stg): `subjects`(t,1), `learning_sessions`(t,1),
  `concepts`(t), `concept_mastery`(t), `quota_pools`(t), `profile_quota_usage`(t,1),
  `usage_events`(t). RLS is the norm for scoped child tables. (`curriculum_topics`=f — scoped via
  parent chain.)
- **Legacy identity tables never had RLS either** (dev baseline): `profiles, accounts,
  family_links, consent_states, subscriptions` all RLS=f, 0 policies.

## Calibrated conclusion (for Fable to verify, not accept)
Identity/account **top-of-ownership-chain** tables (legacy AND v2) are guarded at the **app
layer** (ownership checks), not by DB RLS; scoped **leaf** tables get RLS. So v2 identity tables
lacking RLS **matches prior art — NOT a cutover-introduced regression.** `consent_request` is the
lone RLS'd identity table because it's reachable by public-token lookup (WI-780).

**Residual risk (real):** identity-v2 has **no DB-level backstop**, so app-layer ownership guards
on `person`/`subscription`/`guardianship`/`financial_record` are fully load-bearing. The seam map
found `isOwner` is now DERIVED from `membership.roles` and **fails OPEN into `child-study-only`**
on empty/malformed roles. A single missing/incorrect app-layer ownership check on a v2 identity
query is directly exploitable with no RLS safety net.

**Fable prompts:**
- Enumerate the app-layer ownership guards on `person`/`subscription`/`financial_record` reads
  and writes. Is every path guarded? (No DB backstop.)
- `financial_record` + `deletion_audit` hold sensitive/audit data with no RLS — is app-layer
  scoping proven by tests?
- Is the `isOwner` fail-open-to-child-study-only behavior safe, or does any owner-only data leak
  through a shape that a malformed-roles person can reach?
