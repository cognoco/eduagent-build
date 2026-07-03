DOC: docs/plans/2026-04-15-S06-rls-phase-2-4-enforcement.md (2026-04-15, 20K)

CLAIMS:
- Phase 2 (RLS policies on 26+ tables) shipped via migration `0026`/`0085` (`0085_bug216_rls_policies_sweep.sql`).
- Phase 1 `app_user` role created (migration `0027_enable_rls.sql`), but as `NOLOGIN` — cannot connect, purely a policy-target role.
- Phase 3 (the actual enforcement cutover — dual `ownerDb`/`appDb` connections, `DATABASE_URL_APP`, `withProfileScope` wired into Hono middleware) never landed. App still connects as `neondb_owner`, which carries `BYPASSRLS` implicitly for Neon-managed roles, per the doc's own 2026-06-27 finding.
- `withProfileScope` (`packages/database/src/rls.ts:44`) sets `app.current_profile_id` via `SET LOCAL`/`set_config`, but is called from exactly one call site (`apps/api/src/services/quiz/queries.ts:170`) — everywhere else the session GUC is NULL, so RLS policies fail-closed (return zero rows) if they were ever reached, which they aren't since the connection role bypasses RLS entirely.
- Phase 4.1 claims `vocabulary` + `vocabularyRetentionCards` need to be added to `createScopedRepository`.
- Doc's own banner (2026-06-27) PARKS Phase 3 explicitly pending the `profiles`→`person` rename (MMT-ADR-0012), reasoning that authoring role/middleware wiring against soon-to-be-renamed columns is wasted work.

TECH VALIDITY:
- Phase 4.1 premise is FALSE / stale. `vocabulary` and `vocabularyRetentionCards` are already present in the scoped repository — `packages/database/src/repository.profile.ts:14-15,232-256`, spread into `createScopedRepository` at `packages/database/src/repository.ts:49` (`...createProfileRepository(db, profileId, scopedWhere)`). Git history (`git log -S"vocabulary:" -- repository.ts`) shows this landed in `f6631f4a0` ("feat: quiz activities, dictation, vision, animations, and stabilization (#120)") — predates this plan doc (2026-04-15). The repo was later decomposed god-file→7 sub-files in `6bdf664b3` (2026-06-30), a pure move, not an addition. WI-1495's Found-In note says "re-verify agai[nst current repo]" — re-verification here contradicts the candidate: the gap does not exist today.
- App-layer scoping IS live and enforced: `createScopedRepository(profileId)` (`packages/database/src/repository.ts:26`) + parent-chain WHERE-clause pattern is the canon rule in this repo's AGENTS.md, and is what every route/service actually uses.
- DB-layer RLS is confirmed inert, independently on two axes (doc's own 2026-06-27 note, spot-checked): (a) no `DATABASE_URL_APP`, no dual connection, no `BYPASSRLS`-avoiding role split in `packages/database/src/client.ts` (grepped clean — no `app_user`/`DATABASE_URL_APP`/dual-drizzle-instance references); (b) `withProfileScope` has one call site (confirmed via `rg withProfileScope apps/api/src`).

IMPLEMENTED:
- Phase 1 (RLS enabled + `app_user` role) — complete. `apps/api/drizzle/0027_enable_rls.sql:20` (`CREATE ROLE app_user NOLOGIN`), `0029_rls_sweep_gaps.sql` (gap sweep for 5 tables).
- Phase 2 (restrictive policies) — complete. `apps/api/drizzle/0085_bug216_rls_policies_sweep.sql` (37 tables, expanded scope vs. the 26 in this doc).
- Phase 3 (connection-role cutover) — not started. No `DATABASE_URL_APP`, no dual connection in `packages/database/src/client.ts`, `withProfileScope` not wired into Hono middleware.
- Phase 4.1 (vocabulary tables in scoped repo) — already complete, and was complete before this plan was written. `packages/database/src/repository.profile.ts:232-256`.
- Phase 4.2 (billing service audit) — not verified in this pass (out of scope for the two candidates); doc still lists it as open.
- Phase 4.3/4.4 (integration tests, latency benchmark) — not verified; contingent on Phase 3 landing, which hasn't.

CANDIDATE WIs:
- WI-1495 (vocabulary tables missing from createScopedRepository) — fate: **kill**. Premise is factually false against current `main`; the tables have been in the scoped repository since a 2026-04-era commit, well before this plan doc was even written, and survived the 2026-06-30 repository decomposition intact. Nothing to do here.
- WI-1494 (RLS activation umbrella: app_user role, dual connections, middleware scoping) — fate: **kill** as a schedulable WI in its current form; the doc's own PARKED banner (2026-06-27) already supersedes it with a more precise gate ("resume after `profiles`→`person` rename lands," MMT-ADR-0012) and an explicit rationale for why parking is currently correct (app-layer wall is the live control, pre-launch = no real cross-tenant data at risk). Re-opening WI-1494 as a generic umbrella duplicates work the doc already tracks more precisely; if the identity-foundation rename work needs a companion tracking item, it should be scoped fresh against the post-rename schema rather than resurrecting this one.

VERDICT: partially-implemented (Phase 1-2 done, Phase 4.1 done/stale-candidate, Phase 3 legitimately parked — not abandoned, not forgotten)

MVP RECOMMENDATION: Security-posture recommendation, not product: DB-layer RLS enforcement is a hardening layer, not a launch blocker. App-layer scoping (`createScopedRepository` + parent-chain WHERE, the canon data-access rule) is the live, exercised control on every request path today, and pre-launch there is no real cross-tenant learner data at risk (per the doc's own premise 2, which still holds — confirm with operator whether real user data now exists, since "pre-launch" may have shifted since 2026-06-27). The correct sequencing is: finish the `profiles`→`person` rename first (it's the actual blocker per the doc's own park rationale — authoring RLS policies against columns about to be renamed is wasted work), then resume Phase 3 as a dedicated post-rename hardening sprint. Treating this as launch-blocking now would burn effort on policies keyed to columns that are about to change names.

CONFIDENCE: high on the code-verification claims (vocabulary-in-scoped-repo, single withProfileScope call site, no dual connection); med on the "still no real users" premise since it's operator-owned and may be stale — these two questions are for the operator, not Zuzka:
1. Is premise 2 ("no real users / no production learner data at risk") still true as of now, or has MentoMate started onboarding real learners since 2026-06-27? This single fact flips the MVP recommendation from "defer" to "reconsider urgency."
2. Is the `profiles`→`person` rename (MMT-ADR-0012) still the acknowledged blocking prerequisite, or has that migration itself stalled/been re-scoped — in which case Phase 3 has no unblock date at all and WI-1494 should be reframed as "blocked, not parked."
