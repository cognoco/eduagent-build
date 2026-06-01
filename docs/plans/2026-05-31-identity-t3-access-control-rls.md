---
title: Identity T3 — Access Control / RLS (membership-scoped visibility)
date: 2026-05-31
profile: change
spec: docs/plans/2026-05-31-identity-org-membership-redesign.md
status: draft
---

# Identity T3 — Access Control / RLS

**Goal:** Flip the access-control layer from "same family link / same account grants
visibility" to "membership in the same organization grants visibility," authorize
learning read/write by the membership **role set** ({owner, mentor, student})
instead of the write-once `isOwner` flag, and land the D3 org-context stamp
(nullable `organization_id` on every profile-owned learning table) — all inside the
already-wired `MODE_IDENTITY_V1_ENABLED` branches, with no production data to migrate.

**Approach:** The membership model is already half-built — T1/T2 added
`organizations`, `memberships` (role set), `profiles.clerkUserId`, and the request
path already resolves `personId`, `organizationId`, and `activeRoles` under the
identity flag. T3 makes membership the *authorization source of truth*: (1) RLS
policies become membership-aware via a `visible_profiles(actor)` SQL set (the
integration-test backstop); (2) `profile-scope.ts` validates the requested profile
against membership visibility instead of account ownership; (3) `proxy-guard.ts`'s
V1 branch is extended so a *mentor/owner* may proxy-write a mentee (closing
`learn-2`) while a *student* self-write stays allowed (`learn-1`); (4)
`family-access.ts` guards move from `family_links` to `memberships`; (5) the D3
stamp adds `organization_id` to learning tables, backfilled and written on create.
Whole-person visibility stays the **read default** — the `organization_id` column is
written but is **not** yet a read filter; it only enables per-org slicing later
without a post-launch migration. The legacy (flag-off) code paths and the dev flag
are **not** deleted here — that is T7.

## Context for the executor — read before touching code

1. **Master spec:** `docs/plans/2026-05-31-identity-org-membership-redesign.md` — the
   target model, role set, decisions D1–D6, and the exact T3 done-when.
2. **T1 plan:** `docs/plans/2026-05-31-identity-t1-data-model.md` — what exists:
   `organizations` + `memberships` (`roles membership_role[]`,
   `cardinality(roles) >= 1`), nullable `subscriptions.organizationId`,
   `profiles.clerkUserId`. `profiles` IS the person; `profile.id` is the scoping key
   everywhere. **`organizations.id` reuses `accounts.id`** (id-reuse backfill), so
   `organizationId === account.id` today.
3. **Migrations live in `apps/api/drizzle/`** (drizzle `out` dir — NOT
   `packages/database/migrations/`). T1 = `0106_identity_t1_org_membership.sql`,
   T2 = `0107_identity_t2_invitations.sql`. **Next free number is `0108`.**
4. **Migration workflow (immutability guard):** edit schema →
   `pnpm run db:generate:dev` → `pnpm migrations:manifest` (appends the sha256 to
   `packages/database/src/migration-immutability-manifest.json`; refuses to rewrite
   an existing hash) → commit. `migration-immutability.test.ts` fails CI if a
   committed `.sql` changes or a new one is unregistered. Once a migration carries
   hand-written backfill DML, **never** regenerate it — any further change is a new
   migration (this repo has prior push→migrate DML-loss pain).

### The state T3 inherits (verified in code — do not re-derive)

- **RLS is enforced only in integration tests, not in production.** The per-request
  DB connection runs as `neondb_owner`, which bypasses RLS
  (`apps/api/drizzle/0027_enable_rls.sql:2-3`), and `middleware/database.ts:96-116`
  never calls `withProfileScope` on the request DB. **Runtime enforcement is the
  application layer** — `createScopedRepository`'s `WHERE profile_id = …`
  (`packages/database/src/repository.ts:77-83`) and the `family-access.ts` guards.
  RLS policies are a defense-in-depth backstop exercised by
  `*.integration.test.ts` via `withProfileScope`. **T3 must harden BOTH layers**:
  the app-layer guards (the real gate) and the RLS policies (the tested backstop).
- **`withProfileScope(db, profileId, fn)`** (`packages/database/src/rls.ts:46-66`) is
  the only GUC helper; it `SET LOCAL app.current_profile_id`. **Keep this name and
  GUC.** In T3 `app.current_profile_id` means "the acting/authenticated profile";
  the policy predicate changes, the GUC does not.
- **`createScopedRepository(db, profileId)`** takes **two** args (137 prod
  occurrences across ~50 files; 41 non-test files by
  `grep -rl 'createScopedRepository(' apps/api/src --include='*.ts' | grep -v '\.test\.'`).
  It stays single-profile and self-scoped. **T3 does not rewrite these 137 call
  sites' scoping** — the only change to learning-write paths is stamping
  `organization_id` at INSERT (T3.6). Cross-member reads for mentors go through the
  authorization gate (T3.2/T3.4), not a widened scoped repo.
- **The request path already carries the membership fields** under the flag:
  `account.ts:105-140` sets `personId` + `organizationId`; `profile-scope.ts:154-271`
  sets `activeRoles = resolveActiveMembershipRoles(db, profileId, organizationId)`
  (`apps/api/src/services/identity.ts:114-149`). `proxy-guard.ts:39-56` already
  allows student self-write. **T3 extends these; it does not invent them.**
- **The RLS coverage manifest** is `apps/api/src/services/database-rls-coverage.ts`
  (`PROFILE_SCOPED_TABLES` ≈ 40, `OWNER_SCOPED_TABLES`, `OR_SCOPED_TABLES =
  {family_links}`, `EXPLICITLY_EXCLUDED_TABLES`). `memberships` has **no RLS** —
  T1 flagged this as the explicit T3 obligation
  (`packages/database/src/schema/profiles.ts:142-145`).

## The access model T3 establishes (canonical for T4–T7)

```
GUC (unchanged name)  app.current_profile_id  — the authenticated/acting profile id,
                      set by withProfileScope(db, actorProfileId, fn).

visibility set        visible_profiles(actor uuid) RETURNS SETOF uuid  — SQL function:
                      { actor } ∪ { P : ∃ org where actor holds mentor|owner AND P is a
                      member of that org }.  (D2: mentor is org-wide.)

RLS read (USING)        profile_id IN (SELECT visible_profiles(<actor>))
RLS write (WITH CHECK)  same set  (org-wide mentor may write mentee learning — learn-2;
                        student writes own — learn-1/D6; v1 read==write authorization)

app-layer gate        profile-scope.ts: a requested X-Profile-Id is accepted iff it is in
                      visible_profiles(personId). proxy-guard.ts: self-write (student)
                      needs no header; mentor/owner proxy-write to a mentee requires
                      X-Proxy-Mode: true AND mentor|owner over the target's org. NO
                      implicit proxy from isOwner === false.
```

## Decisions this phase ratifies (from the master spec — do not re-open)

- **D2:** mentor visibility is **org-wide** for v1 — `visible_profiles` and the
  app-layer guards grant a mentor visibility to *every* member of a shared org.
- **D3:** the `organization_id` stamp lands **here**, **nullable** (no NOT NULL — the
  re-seed at T7 plus stamp-on-create keep it populated without a creation-time race),
  on the profile-owned learning tables. Read default stays **whole-person** (the
  column is written, not yet read).
- **D6:** a *student* role writes its OWN learning data (the WITH CHECK in T3.1 and
  the V1 proxy-guard self-write path). `learn-1` is already green in the V1 branch
  (`proxy-guard.test.ts:144-202`); T3 keeps it and adds the mentor case (`learn-2`).

## Scope

In scope:
- `packages/database/src/rls.ts` — keep `withProfileScope`; no signature change.
- `apps/api/drizzle/0108_identity_t3_org_context_stamp.sql` — D3 columns + backfill.
- `apps/api/drizzle/0109_identity_t3_membership_rls.sql` — `visible_profiles` fn,
  membership-aware policy rewrite for every `PROFILE_SCOPED_TABLES` /
  `OWNER_SCOPED_TABLES` / `OR_SCOPED_TABLES` table, and RLS on `memberships` +
  `organizations`. Register both in the immutability manifest.
- `packages/database/src/schema/**` — add nullable `organizationId` to the learning
  tables enumerated in T3.5.
- `apps/api/src/services/database-rls-coverage.ts` — move `memberships`/
  `organizations` out of "no policy", reflect the new policy set.
- `apps/api/src/middleware/profile-scope.ts` — V1 branch: validate the requested
  profile via membership visibility (replaces "belongs to account").
- `apps/api/src/middleware/proxy-guard.ts` — V1 branch: add mentor/owner proxy-write
  authorization (learn-2); keep student self-write.
- `apps/api/src/services/family-access.ts` — `family_links` → `memberships`;
  signatures stable so the 19 importers do not change at the call site.
- `apps/api/src/services/identity.ts` — add the membership-authorization helpers the
  middleware/guards call (`canActOnProfile`, `resolveActorOrgId`).
- Learning-table INSERT paths — stamp `organization_id` on create (T3.6).
- Tests: RLS coverage + integration against membership policies, cross-org IDOR
  break tests, `learn-2` regression, family-access membership tests, org-stamp test.

Out of scope — do NOT touch (later phases own these):
- `apps/api/src/middleware/metering.ts` and `apps/api/src/services/billing/**`,
  including `account-repository.ts` and `downgradeAllFamilyProfiles` — all
  subscription/quota/account→org rewiring is **T4**. T3 must not break
  `c.get('account')`, `c.get('accountId')`, or the account/subscription quota keys
  (`metering.ts:565,634,747`).
- The 7 lifecycle flows' write endpoints + UI: invite/claim & graduation are **T2**;
  leave-org, per-person export, consent-revoke, ownership-transfer, per-member
  progress are **T5**. T3 only provides the read/write authorization substrate.
- The legacy flag-off code paths and the `MODE_IDENTITY_V1_ENABLED` flag itself, and
  any DROP of `family_links` / `accounts` columns — **T7**.
- Mobile (**T6**). `createScopedRepository`'s 137 call sites' scoping (unchanged).

## Tasks

- [ ] **T3.1 — `visible_profiles` SQL function + membership-aware RLS + `memberships`/
  `organizations` RLS.** Author migration `0109_identity_t3_membership_rls.sql`:
  (a) create `visible_profiles(actor uuid)` (definition below); (b) for EVERY table
  in `database-rls-coverage.ts` `PROFILE_SCOPED_TABLES`, DROP the existing
  `profile_id = current_setting('app.current_profile_id')…` policy and CREATE a
  policy whose `USING` and `WITH CHECK` are
  `profile_id IN (SELECT visible_profiles(current_setting('app.current_profile_id', true)::uuid))`;
  (c) `OWNER_SCOPED_TABLES` (`owner_profile_id`) use the same set on
  `owner_profile_id`; (d) the parent-join exceptions (`curriculum_topics`,
  `topic_connections`) keep their `EXISTS (… parent …)` shape but the inner
  `profile_id` comparison becomes the `IN (visible_profiles(…))` set; (e) the
  `OR_SCOPED` `family_links` policy is superseded by a membership policy; (f)
  `ALTER TABLE memberships ENABLE ROW LEVEL SECURITY` + a policy
  `USING (person_id IN (SELECT visible_profiles(current_setting('app.current_profile_id', true)::uuid)))`
  and a WITH CHECK restricted to the actor holding `owner` in that org; (g) the same
  pattern for `organizations` keyed on org membership. Update
  `database-rls-coverage.ts` so `memberships`/`organizations` are in a policy bucket,
  not `EXPLICITLY_EXCLUDED_TABLES`. Register `0109` in the manifest.
  *done when:* `rls-coverage.test.ts` and `database-rls-coverage.test.ts` pass
  against the new policy set (no profile-owned table unprotected; `memberships` now
  has a policy); `database-rls-coverage.integration.test.ts` (queries `pg_policies`)
  passes; `0109` replays clean on a from-scratch DB (run
  `CREATE EXTENSION IF NOT EXISTS vector;` first). The existing
  `rls.integration.test.ts` and `profile-isolation.integration.test.ts` are updated
  to the membership predicate (self-scope still isolates; see T3.7 for the mentor
  case) and pass.

- [ ] **T3.2 — Membership-visibility check in `profile-scope.ts` (V1 branch).** In the
  flag-on header-present branch (`profile-scope.ts:235-273`), replace the implicit
  "profile belongs to account" gate (the `getProfile(db, header, account.id)`
  account filter) with `await canActOnProfile(db, personId, profileIdHeader)`
  (helper in `identity.ts`, defined below): true iff `profileIdHeader ∈
  visible_profiles(personId)` — i.e. self, or an org-mate the person mentors/owns.
  On failure keep the audit log but rename the event
  `profile_scope.ownership_mismatch` → `profile_scope.visibility_denied` and add
  `organizationId` + `personId` to its payload; return `forbidden(...)` (403). Set
  `activeRoles` to the **authenticated person's** roles in the target's org (so the
  proxy guard sees mentor/owner), not the target profile's own roles — pass
  `personId` to `resolveActiveMembershipRoles`. Leave the flag-off branch untouched.
  *done when:* `profile-scope.test.ts` (update, do not weaken): same-org mentor
  setting `X-Profile-Id` to a mentee → 200 with `activeRoles` containing `mentor`;
  cross-org `X-Profile-Id` → 403 with `profile_scope.visibility_denied` logged;
  self → 200; `c.get('account')`/`accountId` still populated (metering unbroken).

- [ ] **T3.3 — Extend the V1 proxy guard for mentor/owner proxy (learn-2).** In
  `proxy-guard.ts:39-56` (flag-on branch), keep the student self-write allow, and
  add: if `c.req.header('X-Proxy-Mode') === 'true'` AND `activeRoles` includes
  `mentor` or `owner`, **allow** (this is a sanctioned proxy write — the target was
  already proven a mentee in T3.2 via `canActOnProfile`); empty roles still 403; a
  student with `X-Proxy-Mode: true` still 403. Do NOT touch the legacy branch
  (`:58-95`) — its `isOwner === false ⇒ 403` rule is deleted in T7.
  *done when:* `proxy-guard.test.ts` (update): `activeRoles:['student']` no header →
  200 (learn-1, unchanged); `activeRoles:['mentor']` + `X-Proxy-Mode:true` → 200
  (learn-2); `activeRoles:['student']` + `X-Proxy-Mode:true` → 403; `[]` → 403.
  Red/green verified by reverting the new mentor branch.

- [ ] **T3.4 — Rewire `family-access.ts` guards from `family_links` to `memberships`.**
  Reimplement `hasParentAccess(db, parentProfileId, childProfileId)` and
  `assertParentAccess` so access is granted iff the two profiles share an org and the
  caller holds `mentor` or `owner` there (org-wide — D2), reusing `visible_profiles`
  semantics (a `memberships`-join query, not the `family_links` lookup at
  `family-access.ts:32-35`). Keep `assertOwnerProfile` and the composite
  `assertOwnerAndParentAccess` and `assertCanManageOwnConsent` — but `assertOwnerProfile`
  now reads the membership `owner` role from `activeRoles` (fall back to
  `profileMeta.isOwner` only in the flag-off branch). **Keep every exported signature
  identical** so the 19 importers
  (`grep -rl "family-access" apps/api/src --include='*.ts' | grep -v '\.test\.'`)
  need no edit.
  *done when:* `family-access.test.ts` (update, no internal mocks beyond the DB
  boundary the file already uses): mentor in org sees mentee, cross-org denied,
  student sees only self, non-owner blocked by `assertOwnerProfile`; all 19 callers
  compile; `pnpm exec nx run api:typecheck` clean.

- [ ] **T3.5 — D3 org-context stamp: columns + backfill (`0108`).** Add a **nullable**
  `organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' })`
  to each profile-owned learning table. **The authoritative table set is
  `database-rls-coverage.ts` `PROFILE_SCOPED_TABLES`** reconciled against
  `grep -rln 'profileId' packages/database/src/schema --include='*.ts'` (the
  2026-05-31 surface map enumerated 35 direct-`profileId` tables:
  `subjects, learningSessions, assessments, topicNotes, quizRounds, quizMissedItems,
  memoryFacts, vocabulary, vocabularyRetentionCards, streaks, xpLedger,
  notificationLog, learningModes, notificationPreferences, coachingCardCache,
  learningProfiles, dictationResults, challengeRoundCooldowns, progressSnapshots,
  progressSummaries, milestones, weeklyReports, monthlyReports, quizMasteryItems,
  practiceActivityEvents, celebrationEvents, supportMessages, bookmarks,
  onboardingDrafts, sessionEvents, sessionSummaries, parkingLotItems,
  needsDeepeningTopics, retentionCards, teachingPreferences`). Stamp the **whole
  direct-`profileId` set** — partial stamping is the exact "fix one of N" drift the
  repo forbids. Generate `0108_identity_t3_org_context_stamp.sql` (`db:generate:dev`)
  with the `ADD COLUMN`s, then hand-append an **idempotent** backfill: for each table,
  `UPDATE … SET organization_id = m.organization_id FROM memberships m WHERE
  m.person_id = <table>.profile_id AND m.roles @> ARRAY['owner']::membership_role[]
  AND <table>.organization_id IS NULL` (the owner membership is the person's home
  org). Register `0108` in the manifest; freeze it after the backfill is appended.
  *done when:* `db:generate:dev` produces clean additive SQL; an integration test
  (`identity-org-stamp.integration.test.ts`, `describeIfDb`) seeds rows, runs the
  backfill SQL, asserts every learning row gets the correct `organization_id` and a
  second run changes 0 rows (idempotent); `migration-immutability.test.ts` green.

- [ ] **T3.6 — Stamp `organization_id` on create.** Add `resolveActorOrgId(db,
  actorProfileId)` to `identity.ts` (returns the actor's owner-membership org id; one
  query, memoizable per request). At every INSERT into a T3.5 learning table, set
  `organization_id` to the acting profile's org. Centralize: extend
  `createScopedRepository(db, profileId)` to accept an optional resolved
  `organizationId` and inject it into every `.insert(...).values({...})` it owns, and
  for the direct-`db.insert` create paths outside the scoped repo
  (`subject.ts:230-257`, `session/session-crud.ts:185-262`, `assessments.ts:791-839`,
  and the rest found via
  `grep -rln '\.insert(' apps/api/src/services --include='*.ts'` intersected with the
  T3.5 table set) add `organizationId` to `.values(...)`. The request supplies the org
  via context (`c.get('organizationId')`); off-request callers (Inngest/cron) resolve
  it via `resolveActorOrgId`.
  *done when:* `identity-org-stamp.integration.test.ts` also creates a subject, a
  session, and an assessment through the service layer and asserts each new row
  carries a non-null `organization_id` equal to the actor's org; full
  `pnpm exec nx run api:test` green.

- [ ] **T3.7 — Cross-org IDOR break tests (the merge gate).** Add negative-path
  integration tests proving cross-org access is denied at BOTH layers, and that the
  mentor case is allowed: (a) seed two orgs, each an owner + a learner, plus a mentor
  added to org-A; (b) **RLS layer** — under `withProfileScope(db, orgAOwner)`,
  reading/writing org-B `subjects`/`learning_sessions`/`assessments`/`topic_notes`
  returns nothing / is rejected, while org-A's mentor under
  `withProfileScope(db, mentor)` CAN read org-A's learner rows (org-wide mentor);
  (c) **route layer** — as org-A's owner, `X-Profile-Id` of an org-B profile → 403
  `profile_scope.visibility_denied`; an org-A mentor with `X-Profile-Id` = org-A
  mentee + `X-Proxy-Mode: true` → 200. Use real DB (no internal mocks). Verify
  red/green by reverting T3.1+T3.2.
  *done when:* `cross-org-idor.integration.test.ts` passes; `pnpm exec nx
  test:integration api` green.

- [ ] **T3.8 — `learn-2` regression: mentor writes mentee learning.** A mentor in an
  org writes a mentee's learning record (a session exchange / note / assessment
  answer) end-to-end through the route + service stack and it succeeds; the same write
  by a non-member is denied.
  *done when:* a named test `learn-2.integration.test.ts` passes the positive and
  negative paths and is annotated with the audit gap id `learn-2`.

- [ ] **T3.9 — Full-phase verification & no-out-of-scope-edit check.**
  *done when:* `pnpm exec nx run-many -t test lint typecheck` (api + database) green;
  `pnpm exec nx test:integration api` green; `git diff --stat` shows **no** change
  under `apps/api/src/middleware/metering.ts`, `apps/api/src/services/billing/**`, or
  `packages/database/src/account-repository.ts` (those are T4); the
  `profile_scope.visibility_denied` rename is reflected in any log-shape assertions.

## `visible_profiles` definition (the code that IS the decision)

```sql
-- emitted into 0109_identity_t3_membership_rls.sql
CREATE OR REPLACE FUNCTION visible_profiles(actor uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
  -- the actor always sees their own profile
  SELECT actor
  UNION
  -- plus every member of any org where the actor holds mentor or owner (D2: org-wide)
  SELECT m_other.person_id
  FROM memberships m_self
  JOIN memberships m_other
    ON m_other.organization_id = m_self.organization_id
  WHERE m_self.person_id = actor
    AND (m_self.roles @> ARRAY['mentor']::membership_role[]
      OR m_self.roles @> ARRAY['owner']::membership_role[]);
$$;
```

Binding notes (so the executor does not re-derive):
- `memberships` columns are `person_id` (FK → `profiles.id`) and `organization_id`;
  `roles` is `membership_role[]`. Use the `@>` array-contains operator with an
  explicit `::membership_role[]` cast (matches T1's enum-array style).
- A student-only member's `m_self` row holds neither mentor nor owner, so the UNION's
  second arm is empty → they see only themselves. This is `learn-1`/D6: own writes
  pass `profile_id = actor`, independent of any `isOwner` flag.
- `STABLE` (not `VOLATILE`) so the planner can inline it inside RLS predicates.
- Same set drives read (USING) and write (WITH CHECK) in v1.

## `identity.ts` helpers (signatures — these ARE the decisions)

```ts
// apps/api/src/services/identity.ts
// True iff `actorPersonId` may act on `targetProfileId`: self, or an org-mate the
// actor mentors/owns. Mirrors visible_profiles() at the app layer (the real runtime
// gate, since production bypasses RLS). One membership query, no N+1.
export async function canActOnProfile(
  db: Database,
  actorPersonId: string,
  targetProfileId: string,
): Promise<boolean>;

// The acting profile's home org (its `owner`-role membership). Used to stamp
// organization_id on create and to seed c.get('organizationId') off-request.
export async function resolveActorOrgId(
  db: Database,
  actorProfileId: string,
): Promise<string>;
```

## Why the layers move in one phase (blast radius)

The master spec flags T3 as the blast radius. The app-layer guards
(`profile-scope` + `family-access` + `proxy-guard`) are the **real** runtime
enforcement (production bypasses RLS); the RLS policies are the **tested backstop**.
If they diverge — app layer hands out org-wide profile ids while RLS still demands
`profile_id = current_profile_id()` — integration tests lock up, or worse, a future
flip of the RLS-bypass posture leaks. So T3.1 (RLS) + T3.2 (profile-scope) + T3.3
(proxy) + T3.4 (family-access) land together, gated by two adversarial suites that
must be green simultaneously: the **RLS coverage tests** (nothing unprotected) and
the **cross-org IDOR break tests** (nothing over-exposed). T3.7 is the merge gate.

## Rollback

Pre-launch, no production data (`project_pre_launch_no_users`). Rollback = revert the
branch + re-seed dev/staging. Both migrations are reversible: `0108` only adds
nullable columns + an idempotent backfill (revert drops columns; no source data
lost — every value is derived from `memberships`); `0109` only replaces RLS policy
definitions + adds policies on `memberships`/`organizations` (revert restores the
profile-scoped policies and disables the two new ones). No legacy column is dropped
(that is T7), so revert is non-destructive. `drizzle-kit push` stays banned on
staging/prod; the migration files are the deliverable, validated by `migrate` on a
clean DB in CI.
