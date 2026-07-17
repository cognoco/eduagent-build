# Risk-Acceptance Memo — Database-Layer Row-Level Security (RLS)

**Checklist item:** DPIA Condition 6 / security-of-processing (Art 32) · **Law:** GDPR Art 32 (security of processing), Art 24 (accountability). **Status:** SIGNED.
**Ruling:** OPQ-30 (DB-layer RLS posture), ruled 2026-07-14 — **Branch B: formal risk acceptance**. Companion Work Item: `WI-1196`.
**Companion documents:** [`dpia.md`](dpia.md) (risk 6.7, security-of-processing table), [`edpb_dpia_filled_2026_v1.md`](edpb_dpia_filled_2026_v1.md) (§2.3.e, §4, Condition 6).

## 1. Decision

**Branch B is adopted for launch: app-layer tenant isolation is accepted as the sole active isolation control.** This memo does **not** activate Postgres Row-Level Security (RLS) enforcement, does **not** change any database role's privileges, and does **not** widen `withProfileScope` wiring beyond its current single production call site. Nothing in this decision, or in this Work Item, changes running behaviour — it is a documentation-only risk acceptance.

## 2. Current enforcing controls

Tenant (family/person) isolation across the ~49 profile/owner/charge-scoped tables in this system is enforced today by a single active layer: the application.

| Control | Mechanism | Source |
|---|---|---|
| **Scoped-repository reads** | `createScopedRepository(db, profileId)` closes over `profileId` and ANDs an `eq(table.profileId, profileId)` predicate into every read the repository exposes; construction throws on an empty `profileId`. | `packages/database/src/repository.ts:26-49` |
| **Explicit ownership predicate on writes** | Direct `db.update(...)` calls outside the scoped repository (e.g. session mutation) pin `profileId` explicitly in the `WHERE` clause alongside the row id, so a write can only touch a row owned by the caller. | `apps/api/src/services/session/session-crud.ts:677-685` (`and(eq(learningSessions.id, sessionId), eq(learningSessions.profileId, profileId))`) |
| **Parent-chain ownership for joined reads/writes** | Where a query joins through a parent table (e.g. `learning_sessions → curriculum_topics → curriculum_books → subjects`), the scoped repository cannot express the join, so the sanctioned pattern is a direct `db.select()`/write with `profileId` enforced via the closest ancestor that owns the row. | `AGENTS.md` → "Non-Negotiable Engineering Rules"; example call sites `apps/api/src/services/session/session-topic.ts`, `session-book.ts`, `session-subject.ts` |
| **Route/service lint boundaries** | ESLint Governance Rule 1 (G1) bans `drizzle-orm` imports in `apps/api/src/routes/**`, so a route file cannot construct a query at all. Governance Rule 5 (G5) additionally bans calling `.select`/`.insert`/`.update`/`.delete` on the request-scoped `db` handle from a route file. Together they force all data access through `services/*`, which is where the ownership predicates above live. | `eslint.config.mjs:314-322` (G1 rule); `eslint.config.mjs:491-495` (G5 rule) |
| **RLS policy manifest** | 49 tables (44 profile-scoped, 4 owner-scoped, 1 charge-scoped) carry a written, deployed Postgres RLS policy keyed on `profile_id` (or `owner_profile_id` / `charge_person_id`), tracked in the canonical coverage manifest. | `apps/api/src/services/database-rls-coverage.ts:51-189` |
| **RLS GUC setter** | `withProfileScope(db, profileId, fn)` opens a transaction, sets `app.current_profile_id` via `SET LOCAL` / `set_config(...)`, and would let a Postgres RLS `USING` clause enforce the same predicate the application already applies. It has exactly one production call site. | `packages/database/src/rls.ts:44-65`; call site `apps/api/src/services/quiz/queries.ts:167-172` |

**The RLS policies and the GUC setter are wired but not enforcing at runtime.** The production database role, `neondb_owner`, carries `BYPASSRLS` — every RLS `USING`/`WITH CHECK` predicate is a no-op for that role regardless of whether `app.current_profile_id` is set, and this managed Neon instance does not permit `SET ROLE` to a non-bypass role from the application connection. This is documented and integration-tested directly against the Postgres catalog (RLS enabled + policy shape asserted; the policy cannot be exercised by an actual denied write because the connecting role bypasses it). This memo does not claim, and no code today supports the claim, that database-layer RLS is an active defence for any table.

- Runtime bypass evidence: `apps/api/src/services/activation-events.integration.test.ts:104-120` ("The production role (neondb_owner) has BYPASSRLS, so the policy cannot be exercised by an INSERT here... SET ROLE to the non-bypass app_user is denied on this managed instance.")

## 3. Residual risk

App-layer isolation is a **single active layer** — there is no database-level backstop today. A missed or incorrect `profileId` predicate in a new or edited query (a raw `db.select()`/`db.update()` written without the scoped repository, or without pinning the parent-chain ancestor) would not be caught by anything except code review and the lint boundaries above; it would not be caught by Postgres, because RLS is inert under `neondb_owner`. If such a bug shipped, its blast radius is a cross-family or cross-person data exposure — one learner's or guardian's data returned to, or overwritten by, an unrelated account. This is the GDPR Art 32 residual risk Branch B accepts for launch.

RLS Phase 3 (activating enforcement — switching the connection role off `BYPASSRLS`, or an equivalent GUC-enforcing role, plus rewriting the ~49-table policy manifest) is deliberately **deferred**, not abandoned, because the policy manifest and the GUC infrastructure are keyed on today's `profile_id` column and `profiles`-family table names. The identity-foundation build has already introduced the target `person`/`person_id` naming for new tables (`consent_request.charge_person_id`, etc.), and the physical rename of the remaining ~44 legacy `profile_id`-keyed tables to `person_id` is tracked as its own follow-on. Authoring or rewriting Phase 3 RLS policies against `profile_id` now, ahead of that rename, would be discarded work re-migrated against the renamed columns — the identical sequencing conclusion the project reached when RLS Phase 3 was last scoped (`docs/_archive/plans/2026-07-14-superseded/2026-04-15-S06-rls-phase-2-4-enforcement.md:10`).

## 4. Remediation trigger

**Primary trigger:** RLS Phase 3 activation is re-evaluated immediately after the profiles→person rename lands, inheriting that work package's ruled delivery date.

As of this memo's signing, the rename work package (`WI-1848`, "RLS policies for person-keyed supporter/visibility tables — WI-1002 split, pinned on OPQ-30") sits at **Stage=Backlog, Priority=P3, lane=Post-MVP pen** — it has **no ruled calendar date yet**. The primary trigger is therefore defined relatively (fires on that work package's completion), not against a fixed date; when that work package is scheduled, its ruled delivery date becomes this memo's effective primary-trigger date. This is a deliberate, disclosed gap in the primary trigger, which is why the hard backstop below is dated and does not depend on the rename being scheduled at all.

**Hard backstop (exact, non-negotiable):** re-evaluate RLS Phase 3 by **launch + 3 months OR 1,000 registered accounts, whichever occurs first** — regardless of whether the profiles→person rename has landed by then.

## 5. Scope confirmation

This Work Item and this memo:
- do **not** activate RLS enforcement (no role change, no `SET ROLE`, no policy rewrite);
- do **not** change any database role or its privileges;
- do **not** widen `withProfileScope` beyond its current single call site (`apps/api/src/services/quiz/queries.ts:170`);
- do **not** claim database-layer RLS is an active defence for any table today.

## 6. Sign-off

| Role | Name | Date |
|---|---|---|
| DPO (Acting) | Jørn Jørgensen | 2026-07-17 |

Jørn Jørgensen signs as **Acting DPO** — the outsourced DPO seat is not yet filled (DPIA Condition 1 / `dpia.md` §9 item 1), and an empty seat does not block this risk acceptance from being recorded. On DPO appointment, this memo should be reviewed and re-affirmed or superseded by the appointed DPO.
