---
title: Identity / Organization / Membership Redesign — Program Plan
date: 2026-05-31
profile: change
spec: this document (self-contained; supersedes the ad-hoc account model)
status: superseded
superseded_on: 2026-06-01
superseded_by: pre-launch clean-cut decision — see _wip/identity-foundation/
---

> # ⛔ SUPERSEDED — DO NOT FOLLOW THIS PLAN
>
> **Decided 2026-06-01:** the incremental, dual-model, **flag-gated + backfill** migration approach
> in this program plan is **REJECTED**. The identity/tenancy/role foundation will be rebuilt as a
> **pre-launch clean cut** — disposable tables, re-seed dev/staging, **no `MODE_IDENTITY_V1` flag,
> no backfill, no dual model, no compatibility shims**.
>
> **Status of the work:** T1 was implemented and merged (PR #668) on this rejected approach and is
> slated for a forward-only revert; T2–T7 were never executed.
>
> **Why kept (not deleted):** decision record, and *discussion input only*. The target model shapes
> (orgs / memberships / roles), the 7 lifecycle flows, and decisions D1–D6 are **NOT approved
> design** — they must be re-derived from product intent, not carried forward as-is.
>
> **Live work:** `_wip/identity-foundation/`. Internal cross-references below are stale after the move.

# Identity / Organization / Membership Redesign — Program Plan

**Goal:** Replace the single fused `accounts` row (which today *is* identity +
tenancy + billing, with one Clerk login per account and credential-less child
profiles) with a three-part model — **person**, **organization**,
**membership(roles)** — so that people own their own identity and data, orgs own
the subscription, and roles are editable relationships rather than write-once
flags.

**Approach:** Build the new model alongside the old behind a development flag,
re-seed dev/staging (no production users exist — this is pre-launch), then
delete the legacy fused-account paths. Decompose into 7 dependency-ordered
phases; each phase below becomes its own detailed plan when started. This
document is the master spec every phase references.

**Why now:** Pre-launch, zero users (`project_pre_launch_no_users`). There is no
live migration and no dual-model production burden — the flag is a *development*
convenience, not a permanent V0/V1 split. This is the cheapest this change will
ever be; after launch every phase multiplies in cost.

---

## The target model

```
person        — one per human (children included). Owns identity (Clerk) + own
                learning data, permanently. MANAGED (no login) or CREDENTIALED
                (own login). A managed person can CLAIM a login later
                (graduation) with zero data migration.
organization  — always exists (min one per person — an "org of one"). Holds the
                subscription. Is the grouping; "a family" = an org with >1 member.
membership    — (person → org) carrying a SET of roles {owner, mentor, student}.
                Membership = visibility (a mentor sees members of their org).
                Roles are editable, not write-once. Mentor is org-wide.
subscription  — attaches to the organization. "Who pays" ≠ "who you are."
```

Decoupled axes (must not be re-fused):
- **Credential** (managed vs credentialed) — a setup choice, defaulted by age +
  device, never locked. Age suggests the default; it never dictates it.
- **Age / legal** — drives consent (GDPR/COPPA) and age-appropriate content
  only. Orthogonal to credential type and to role.

A Clerk identity may hold **multiple emails / OAuth login methods** (one person,
several logins). Merging two *already-separate* persons is explicitly **out of
scope** (see Non-goals).

## Root-cause diagnosis

Every confirmed dead-end below traces to one cause: `accounts` fuses identity,
tenancy, and billing, and identity is single-credential. Verified in code:
- Ownership is write-once — the only non-test write of `isOwner` is the create
  at `apps/api/src/services/profile.ts:369`; no code ever flips it.
- The only cross-account profile move is the cancellation cascade
  (`services/billing/family.ts` `downgradeAllFamilyProfiles`); there is no
  user-facing transfer/graduate/leave path.
- `family.ts` self-documents the gap: *"cross-account profile transfers are
  rejected … until an invite/claim flow exists"* and `ProfileRemovalNotImplementedError`.
- `accounts.clerkUserId` and `accounts.email` are both `notNull().unique()`
  (`packages/database/src/schema/profiles.ts:46-47`); `findOrCreateAccount`
  blocks email reuse.

## Scope

In scope:
- `packages/database/src/schema/**` — new person/organization/membership tables.
- `apps/api/src/middleware/{auth,account,profile-scope,metering}.ts` — identity
  resolution + scoping context.
- `apps/api/src/services/{account,profile,clerk-user,family-access,deletion,export}.ts`
  and `apps/api/src/services/billing/**` — identity, access, billing rewire.
- `packages/database/src/{repository.ts,rls.ts,account-repository.ts}` — scoped
  reads + RLS.
- `apps/mobile/src/lib/{profile,navigation-contract,app-context}.ts`,
  `apps/mobile/src/app/(auth)/**`, onboarding, profile-switch, invite/claim,
  consent, more/account + more/privacy gating.
- The **7 lifecycle flows** (see below) — the redesign is not done without them.

Out of scope (Non-goals):
- **Merging two pre-existing separate persons/accounts** into one (data
  reconciliation, "which subscription wins"). Multiple *logins on one person* is
  in scope; merging two *persons* is a separate project.
- The **17 independent audit gaps** (see "Independent backlog") — they survive
  the redesign unchanged and are tracked separately.
- Multiple roles *scoped to specific people* (person-specific mentor). v1 ships
  **org-wide mentor** only; per-person mentor scoping is a deliberate later
  addition the membership row can carry without reshaping.

## Acceptance criteria

Sourced from `docs/audits/2026-05-31-logical-gap-audit.md` (36 confirmed gaps —
2 HIGH + 28 MEDIUM + 6 LOW). The redesign closes **19 identity-model gaps**; the
remaining **17 are independent** and survive the redesign unchanged (see
"Independent backlog"). `19 + 17 = 36` — the full audit reconciles. Tracked per
gap ID:

- **Access-model-enabled (closed by the T2 auth + T3 access-control rewrite, no
  new lifecycle flow — 2):** `learn-1` (HIGH), `learn-2`. Both trace to the
  proxy guard equating `isOwner===false` with proxy mode
  (`proxy-guard.ts:57-63`); the membership model authorizes self-writes by the
  *student* role on the member's own person and mentee-writes by the *mentor*
  role, independent of ownership. `learn-1` additionally turns on the product
  call recorded as **D6** below.
- **Flow-enabled (closed by the 7 lifecycle flows — 17):** `consent-1` (HIGH),
  `consent-2`, `consent-3`, `consent-4`, `consent-7`, `auth-1`, `billing-2`,
  `family-2`, `family-3`, `family-4`, `family-5`, `identity-1`, `identity-3`,
  `identity-4`, `identity-5`, `identity-6`, `progress-1`.

> There is no "structural, closed by the model alone" bucket: every identity gap
> needs either the access-control rewrite (T2–T3) or a lifecycle flow (T5). The
> schema (T1) is necessary but closes no gap on its own.

### The 7 lifecycle flows (in scope — the redesign is incomplete without these)

1. **Cross-account invite / claim** — link a pre-existing person to an org
   (teen, tutor, co-parent). Closes `family-2`, `family-3`, `consent-2`,
   `identity-5`, `billing-2`. **Design rule:** must attach to an *existing*
   person when one exists — never create a parallel managed duplicate. This is
   what keeps the merge tool (D5) out of scope.
2. **Managed → credentialed graduation** — managed person claims own login,
   keeps history. Closes `family-4`, `identity-3`.
3. **Leave-org / remove-member with data preserved** — a membership is revoked
   (by the member themselves *or* by an owner removing a child) without data
   loss or nuking others; the person + their learning data persist. Closes
   `auth-1`, `consent-4`, `family-5`, `identity-1`, `identity-6`.
4. **Per-person data export** — export my data, not the whole account's. Closes
   `consent-3`.
5. **Self-service consent revoke** for the email-only consenting parent
   (GDPR Art. 7(3)). Closes `consent-1`.
6. **Ownership transfer / owner-deletion with member preservation.** Closes
   `consent-7`, `identity-4`.
7. **Per-member progress generation** decoupled from the owner's notification
   prefs. Closes `progress-1`.

Coverage check: flows close the 17 flow-enabled IDs exactly (no gap appears
twice, none is unmapped); `learn-1`/`learn-2` are closed by T2–T3, not a flow.

## Tasks (phases — each becomes its own detailed plan)

Surface sizes are from the 2026-05-31 four-agent surface map; treat them as
scoping estimates, not exhaustive file lists.

- [x] **T0 — Design spec sign-off.** Ratify this model + acceptance criteria as
  the source of truth; resolve the open decisions below.
  *Done when:* open-decisions table has no unresolved rows; this doc moves to
  `status: approved`. **DONE 2026-05-31 — all 6 decisions resolved (D6 added
  during T1 adversarial review).**

- [x] **T1 — Data model.** Add `persons`, `organizations`, `memberships`
  (role set), and a credential link to Clerk identities; move `subscriptions`
  to reference `organizationId`. New tables alongside old; no drops yet.
  *Files:* `packages/database/src/schema/{profiles,billing}.ts` + new schema
  files; migration SQL. *Done when:* schema compiles, `drizzle-kit generate`
  produces a clean migration, new tables seed in dev, and a unit test asserts a
  person can hold ≥2 memberships with different role sets.
  **DONE 2026-05-31** — `profiles` IS the person (no `persons` table; profile.id
  stays the scoping key). Migration `0106_identity_t1_org_membership` (additive,
  no drops) + canonical idempotent backfill. Verified: database `tsc` + full
  jest (26 suites / 285 tests) green against real dev Neon; api `tsc` clean;
  CHECK break test red-verified (array_length→cardinality); the ≥2-memberships
  capability test passes. See `docs/plans/2026-05-31-identity-t1-data-model.md`.

- [ ] **T2 — Identity / auth.** Clerk session → person+org resolution (not
  account); managed vs credentialed persons; multi-email/OAuth on one person;
  **flow #1 (invite/claim)** and **flow #2 (graduation)**.
  *Files (~23):* `middleware/{auth,account}.ts`, `services/{account,clerk-user,
  profile}.ts`, `routes/{profiles,onboarding}.ts`, new invite/claim service +
  routes. *Done when:* a person signs in via two providers as the same identity;
  a managed person is created without a login; a break test proves a managed
  person can be claimed into a credentialed one with history intact; `learn-1`
  regression test (child runs own session) passes.

- [ ] **T3 — Access control / RLS.** Flip scoping from "same account" to
  "membership grants visibility." Largest phase.
  *Files (~150 with scoping WHERE clauses; 62 use `createScopedRepository`;
  RLS in `packages/database/src/rls.ts` + 7 migrations + coverage tests; guards
  in `services/family-access.ts` used by ~19 routes).* This phase also lands the
  **D3 org-context stamp**: add a nullable `organization_id` to each
  profile-owned learning root this phase already enumerates, backfilled from the
  member's org, written on create going forward (whole-person visibility stays
  the read default; the column only enables per-org slicing later without a
  post-launch migration). *Done when:* RLS coverage test still passes against the
  membership-scoped policies; IDOR break tests (cross-org access denied) pass;
  `learn-2` (mentor writes to mentee learning via role) passes; new learning
  records carry a non-null `organization_id`.

- [ ] **T4 — Billing.** `accountId` → `organizationId` across subscriptions,
  quota pools, usage, webhooks, KV cache keys; drop `subscriptions.accountId`
  unique, add org FK; rework family cancellation cascade for the always-org
  model.
  *Files (~18):* `services/billing/**`, `middleware/metering.ts`, `routes/
  billing.ts`, webhook handlers, `schema/billing.ts`. *Done when:* a solo
  person's org-of-one provisions a free sub; a multi-member org shares one pool;
  Stripe + RevenueCat webhook idempotency tests pass against org keys.

- [ ] **T5 — Lifecycle flows (server + mobile).** Build flows #3–#7
  (leave-org, per-person export, self-service consent revoke, ownership
  transfer / owner-deletion-with-preservation, per-member progress).
  *Done when:* each flow has a passing happy-path test AND a negative/break test;
  the corresponding audit gap IDs (`auth-1`, `consent-1/3/4/7`, `identity-4/6`,
  `family-5`, `progress-1`) each have a regression test.

- [ ] **T6 — Mobile identity surface.** Profile-switch → login/membership;
  onboarding for managed vs credentialed; invite/claim + consent UI; nav/tab +
  `isOwner`-gating recomputed from membership roles.
  *Files (~25–30):* `lib/{profile,navigation-contract,app-context}.ts`,
  `app/(auth)/**`, `app/profiles.tsx`, `app/create-profile.tsx`,
  `more/{account,privacy,index}.tsx`, new `app/invite/**` + claim screens,
  consent screens. *Done when:* a credentialed teen logs in to their own space
  behind their own credential; managed kid still works via shared device;
  spec/test suites updated to the new model and green.

- [ ] **T7 — Cutover & cleanup.** Re-seed dev/staging on the new model; delete
  legacy fused-account paths, `familyLinks`-only assumptions, proxy guard, and
  the dev flag.
  *Done when:* no reference to the removed account-scoping helpers remains
  (grep clean); full `nx run-many -t test/lint/typecheck` green; integration
  tests (`nx test:integration api`) green.

## Open decisions (resolve in T0)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Org for a solo person — auto-created at signup? | Yes — always an org of one (decided). |
| D2 | Mentor scope — org-wide or per-person? | Org-wide for v1 (decided); per-person deferred. |
| D3 | Multi-org learning visibility — whole-person or per-org slice? | **DECIDED:** whole-person now. The org-context stamp lands in **T3** (the access-control phase that already enumerates every profile-owned learning root), **not T1** — adding a column with no reader/writer four phases early is dead schema. Because pre-launch dev data is re-seeded at T7, the stamp column exists before any production write, so the "no post-launch backfill" intent of D3 still holds. T1 deliberately omits learning-table changes (see T1 plan §Scope). |
| D4 | Credential default thresholds (age/device) | Under ~13 → managed default; 13+ → own-login default; own device leans credentialed; always overridable. |
| D5 | Merge two pre-existing persons | **DECIDED:** out of scope for v1. Only dev/test accounts exist today; the in-scope flows (multi-login, graduation-in-place, link-to-existing-person) are designed to prevent duplication so merge is not needed. |
| D6 | Does a *student*-role member write to their OWN learning data? | **DECIDED: yes.** A student role on a member's own person authorizes read+write to that person's own sessions/subjects/messages, regardless of `isOwner` — this is the product's core loop (a child on a parent's account must be able to study). `learn-1` exists because `proxy-guard.ts:57-63` wrongly treats `isOwner===false` as proxy mode; under the membership model self-writes are role-authorized, and genuine proxy (acting *as* another person) stays an explicit, separate switch. Consistent with the never-lock-topics / human-override-everywhere philosophy. |

## Risks & rollback

- **T3 is the blast radius.** ~150 files carry scoping WHERE clauses; RLS and
  the scoped-repository pattern must be rewired together or cross-org leaks
  appear. Mitigation: membership-scoped RLS lands with the read rewrite in one
  phase, gated by the coverage test + IDOR break tests.
- **Rollback:** pre-launch, no user data — rollback of any phase is "revert the
  branch + re-seed dev/staging." No destructive production migration is
  performed (the legacy tables are dropped only in T7, after the new model is
  proven, and there is no production data to lose).

## Migration & environment hygiene (established during T1, 2026-05-31)

The migration ledgers on the shared DBs had drifted badly. **All three were
rebuilt/aligned on 2026-05-31; all now carry a consistent 107-row ledger.**

**Root cause (verified): NOT the CI/deploy pipeline.** `ci.yml` and `deploy.yml`
already do the right things — ephemeral Postgres, `CREATE EXTENSION vector`, then
`drizzle-kit migrate` (CFG-12 replaced push with migrate), with separate
`DATABASE_URL_STAGING`/`PRODUCTION` secrets behind a hard-fail guard. The drift
came from **outside** the pipeline:
1. **Migration history was rewritten after deploy applied the originals** →
   "phantom" ledger rows (29 on staging, 8 on prod) whose hashes match no current
   file. (`0056_schema_drift_repair` shows this has happened before.)
2. **Manual `drizzle-kit push` / ad-hoc DDL against shared DBs**, advancing schema
   without recording it in the ledger.

Resolution + standing rules for T2–T7:

- **Extensions:** only `vector` needs external pre-creation (no migration creates
  it); `pg_trgm` is self-created in migration `0047`. CI/deploy already pre-create
  `vector`. Any from-scratch replay (T7 prod cutover, scratch validation) must run
  `CREATE EXTENSION IF NOT EXISTS vector;` first or it fails `type "vector" does
  not exist`. (Validated: 0000→0106 replays clean to a 107-row ledger.)
- **Dev:** managed via `db:push:dev` (ledger unrecoverably drifted — 22 rows,
  hashes don't reproduce; do NOT hand-reconcile). Per phase: edit schema →
  `db:generate:dev` (the committed migration is the deliverable) → `db:push:dev`
  (materialize on dev to test). The migration FILE is validated via migrate on a
  clean DB (CI), not on drifted dev.
- **Staging + Prod:** REBUILT CLEAN 2026-05-31 via drop-schema + `migrate`
  (staging ledger was 114 rows/29 phantom; prod 96/8). Data on both was disposable
  (staging = synthetic fixtures; prod = 0 real users, one owner test login).
  Both now consistent 107-row ledgers; `migrate` applies forward cleanly. `push`
  remains BANNED on staging/prod.
- **Prevention — the missing guard:** add a **migration-immutability CI check**
  (append-only enforcement): fail CI if any committed migration `.sql` content
  changes or a journal entry is removed/reordered. New migrations append freely.
  This closes hole #1 (history rewrites) — the actual cause, since the pipeline is
  otherwise sound. Hole #2 (manual push/DDL) is process: never use staging/prod
  URLs locally; all schema changes flow through generate→commit→deploy-migrate.

## Independent backlog (NOT closed by this redesign — separate track)

17 audit gaps survive the redesign and need their own fixes. They are grouped
into sibling plans by missing product primitive:

- [Account Security Self-Service](2026-05-31-account-security-self-service.md)
  covers `auth-2`, `auth-3`, `auth-4`.
- [Profile Setup, Personalization, and Corrections](2026-05-31-profile-setup-personalization-corrections.md)
  covers `onboard-1`, `onboard-2`, `onboard-3`, `onboard-4`.
- [Billing Recovery and Learner Capacity](2026-05-31-billing-recovery-learner-capacity.md)
  covers `billing-3`, `billing-4`, `notif-3`.
- [Notification Reachability and Nudges](2026-05-31-notification-reachability-nudges.md)
  covers `notif-1`, `notif-2`, `notif-4`.
- [Learning Library Cleanup](2026-05-31-learning-library-cleanup.md)
  covers `learn-3`.
- [Resumable Practice State](2026-05-31-resumable-practice-state.md)
  covers `practice-1`, `practice-2`, `practice-4`.

Track those on the pre-launch backlog, not inside this identity redesign.
