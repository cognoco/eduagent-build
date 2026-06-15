# WI-780 — consent_request service-role RLS exceptions: branch decision (2026-06-15)

**Work item:** WI-780 (consent_request missing service-role RLS exceptions — public
token-lookup + reminder-sweep — claimed by MMT-ADR-0020 but not built).
**Workstream:** WS-18 / PRG-06 Identity Cutover. **Execution path:** Assisted. **Priority:** P1.
**Status:** investigated; **BRANCH 2 (doc-fix)** selected. Doc-correction routed to the
MMT-ADR-0020 re-vet under WI-752 (the ADR-governance-correction activity) — **not edited
from this lane** (the WI-780 AC forbids editing the ADR / canon here).

---

## The question WI-780 poses

MMT-ADR-0020 (Consequences) and its lockstep canon `docs/canon/identity/data-model.md`
§2B.1 both state the CUT-A `consent_request` table ships with **named service-role RLS
policy exceptions** for (a) the public/unauthenticated consent token-lookup path and
(b) the reminder-sweep Inngest job. Migration `0114_identity_cutover_homes.sql` created
**only** the single `charge_person_id`-anchored isolation policy
`consent_request_charge_isolation` and registered `consent_request` in
`database-rls-coverage.ts`. The two named service-role exceptions do not exist.

The AC branches on one fact: **does the DB connection used by those two service-role
consumers respect or bypass RLS at the Postgres role level?**

- Respects RLS → real latent bug → write a CUT migration adding the two named exceptions
  (BRANCH 1).
- Bypasses RLS at the role level → exceptions are unnecessary; the ADR + §2B over-claim
  them → route a doc-correction to WI-752 (BRANCH 2, doc-fix; no migration).

## The investigation (evidence)

**1. The app connects as the table owner (`neondb_owner`), and there is no role switch.**
- `apps/api/src/middleware/database.ts` builds the per-request client from a single
  `DATABASE_URL` via `createDatabase(url, …)` (`packages/database/src/client.ts:96`).
  There is exactly one DSN — no separate service-role / admin connection string
  (grep for `SERVICE_ROLE | adminDb | ADMIN_DATABASE | RLS_DATABASE_URL` → zero hits).
- The `app_user` RLS-bound role is **created but never activated**. Migration
  `0027_enable_rls.sql:1-8` creates `app_user NOLOGIN` and enables RLS, with the explicit
  note: *"SAFE: owner role (neondb_owner) bypasses RLS. No behavior change until a future
  phase switches the connection role to app_user."* No `SET ROLE app_user` exists in any
  production code path (`apps/api/src`, `packages/database/src`).

**2. No table is forced under RLS for its owner.**
- `FORCE ROW LEVEL SECURITY` appears **nowhere** in `apps/api/drizzle` or
  `packages/database` (zero matches). By Postgres semantics, a table **owner** is exempt
  from RLS unless `FORCE ROW LEVEL SECURITY` is set. So with the app connecting as
  `neondb_owner`, RLS policies on `consent_states` and `consent_request` are **armed but
  inert at runtime today** — insurance for the future `app_user` cut-over, not a live gate.
- `0085_bug216_rls_policies_sweep.sql:6-9` says it directly: *"Without policies,
  neondb_owner (current connection) bypasses RLS and everything works, BUT a future
  Phase 2-4 switch to an app_user role would produce zero visible rows."* The
  `database-rls-coverage.integration.test.ts` header likewise frames coverage as protection
  *"before it reaches the app_user role-switch cut-over."* The cut-over has not landed.

**3. Legacy `consent_states` — the posture canon says to "match" — ships ZERO named
service-role exceptions.**
- The only policy on `consent_states` is `consent_states_profile_isolation`
  (`0085_bug216_rls_policies_sweep.sql:65-72`) — a `profile_id` isolation policy. There is
  no `consent_states` service-role policy anywhere. The legacy public token-lookup and
  reminder-sweep work today purely because the owner connection bypasses RLS.

**4. Both legacy consumers use the shared owner connection, unscoped.**
- Public token-lookup (`apps/api/src/routes/consent-web.ts`): `const db = c.get('db')`
  (the shared request client) → `getChildNameByToken(db, token)`; **no `withProfileScope`**,
  no `current_profile_id` GUC. It works today by owner-bypass.
- Reminder-sweep (`apps/api/src/inngest/functions/consent-reminders.ts`): reads
  `consentStates` / `consentRequest` via `db.query.*.findFirst` on the same shared client;
  **no `withProfileScope`**. Same owner-bypass.
- The v2 equivalents (`services/identity-v2/consent-v2.ts`, `consent-status-v2.ts`) also do
  not wrap in `withProfileScope` — identical posture.

## Decision: BRANCH 2 (doc-fix)

The service-role consumers' DB connection **bypasses RLS at the Postgres role level** (owner
role, no `FORCE ROW LEVEL SECURITY`, no `app_user` switch). The named service-role exceptions
MMT-ADR-0020 + data-model §2B claim are therefore **unnecessary** — and, decisively, the
legacy `consent_states` posture they say to "match" has **no such exceptions**. The existing
`consent_request_charge_isolation` policy already mirrors `consent_states_profile_isolation`
exactly. `consent_request` is **not** missing anything relative to the legacy posture.

**No migration is warranted.** Adding two no-op "service-role exception" policies would
introduce objects with no live consumer and a misleading rationale, and would *not* match the
legacy posture canon points to.

### What the doc-correction must say (routed to WI-752 — NOT applied here)

In **MMT-ADR-0020 Consequences** and **`docs/canon/identity/data-model.md` §2B.1** (last
bullet, "Scope"):

- **Drop** the claim that `consent_request` ships named service-role RLS policy exceptions
  for the public token-lookup and reminder-sweep paths.
- **Replace** with a one-line statement of the actual service-role access model:
  *"Service-role consumers (public token-lookup, reminder-sweep) reach `consent_request` via
  the owner-role (`neondb_owner`) connection, which bypasses RLS — matching today's
  `consent_states` posture, which likewise carries no named service-role policy. No
  service-role policy exception is required unless/until the `app_user` role-switch cut-over
  (0027 Phase 2-4) lands, at which point `consent_request` is swept alongside every other
  RLS table."*

This keeps the lockstep ADR↔canon pair internally consistent and forward-correct for the
eventual `app_user` cut-over, without inventing inert policy objects.

## Why this does not gate WP-FLAG (WI-779) on a code change

WI-780's risk framing — "service-role consumers hit the RLS wall once `IDENTITY_V2_ENABLED`
is the only live path" — does **not** materialize: removing the feature flag does not change
the **Postgres connection role**. The v2 consumers use the same owner-role connection as the
legacy ones; the RLS wall is never reached at the current role level. WP-FLAG is unblocked on
the doc-correction (decision recorded), with no migration prerequisite.

## Out of scope (stays with WI-752, not this lane)

The MMT-ADR-0020 ADR-hygiene rider — Deciders "PM + Claude" (agent-as-decider) and the
feat-PR birth (never a `docs(adr)` change-set) — is pristine-cleanup for the ADR-cleanup
activity, not folded here and not into WI-772.
