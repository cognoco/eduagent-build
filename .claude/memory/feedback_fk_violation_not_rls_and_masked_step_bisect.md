---
name: feedback_fk_violation_not_rls_and_masked_step_bisect
description: "Diagnosing CI integration FK failures — FK checks bypass RLS, and a masked/skipped CI step invalidates run-history bisect (use code-provenance instead)."
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-29
  last_confirmed: 2026-06-29
  status: active
  originSessionId: d89796da-bae9-4a6b-85d9-ec70f0bf35b0
---

Two banked lessons from the WI-1145 main-health P0 (2026-06-29, FK-parent-missing in 6 cross-package integration suites):

1. **`violates foreign key constraint` on INSERT ≠ an RLS/visibility problem.** PostgreSQL FK reference checks ALWAYS bypass row-level security; absent `FORCE ROW LEVEL SECURITY` (grep `apps/api/drizzle/*.sql` — currently none), a leaked role cannot hide an existing parent from an FK check. So an FK violation means the parent row is **genuinely absent** = a missing-seed-NODE bug, never a role-leak/pollution bug. Don't chase `SET LOCAL ROLE`/pooled-connection theories for FK errors. (`SET LOCAL ROLE` is txn-scoped → resets on rollback anyway.)

2. **A masked/skipped CI step invalidates run-history bisect.** The required `main` job rollup conflates ≥3 things; the `API integration tests` step was `skipped` (change-class router) then fail-fast-blocked behind an unrelated break (misnamed 0125 snapshot) the entire merge window, running for the first time only after [[project_ci_db_journaled_chain_divergence]]-style un-masking. "First red run" was an artifact. **Reliable signal = code provenance: git-blame the failing ARTIFACT** (here the `// [WI-1145]`-tagged consent_request/guardianship inserts), not the job rollup.

3. **"Passes local, red in CI" on an ephemeral-DB lane = missing-seed signature** (local DB carries accumulated rows; CI ephemeral is clean) — NOT order-dependent pollution. Don't misread it as a polluter.

**Why:** I bisected to the wrong commit (WI-1104) twice before the advisor + these facts corrected it to WI-1145. **How to apply:** for any integration FK/seed failure, check FORCE-RLS presence + git-blame the failing insert before theorizing about visibility/order. Test-seed fix pattern: call `ensureV2IdentityForLegacyProfileTest` for parent+child profiles BEFORE inserting v2 edges (passing suites already do). Related: [[feedback_subagent_stale_local_repro]], [[feedback_verify_directive_premise_before_build]].
