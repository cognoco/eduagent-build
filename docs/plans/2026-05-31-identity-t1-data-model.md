---
title: Identity Redesign — T1 Data Model — Implementation Plan
date: 2026-05-31
profile: change
spec: docs/plans/2026-05-31-identity-org-membership-redesign.md
status: implemented
---

# Identity Redesign — T1 Data Model

**Goal:** Introduce the `organizations`, `memberships`, and person-credential
schema *additively* (alongside the existing `accounts` / `profiles` /
`family_links` / `isOwner` model), with a backfill that maps current data into
the new shape. No legacy columns are dropped here — drops happen in T7.

**Approach:** This is phase T1 of the program plan. It changes only the schema
package and its migration; no service/route logic is rewired yet (that is
T2–T6). Because there are no production users, the backfill runs against
dev/staging seed data only; correctness is proven by re-deriving the new rows
from the old and asserting invariants.

## Scope
In scope:
- `packages/database/src/schema/profiles.ts` — add `organizations`,
  `memberships`, `clerkUserId` on `profiles`.
- `packages/database/src/schema/billing.ts` — add nullable
  `subscriptions.organizationId`.
- `packages/database/src/schema/index.ts` — export new tables.
- A new Drizzle migration (additive DDL + backfill).
- New schema unit tests co-located with the schema files.

Out of scope (later phases):
- Any change to `middleware/`, `services/`, `routes/`, RLS policies, or the
  `createScopedRepository` scoping column (T2–T6).
- Dropping `accounts.clerkUserId`/`email`, `profiles.accountId`, `family_links`,
  `isOwner`, or `subscriptions.accountId` (T7).
- **The D3 org-context stamp on learning records is deliberately NOT in T1.**
  Adding a nullable `organization_id` to learning roots now — four phases before
  any reader or writer exists — is dead schema. It lands in **T3**, which already
  enumerates every profile-owned learning root for the scoping rewrite, written
  on create from then on. Pre-launch dev data is re-seeded at T7, so the column
  still exists before any production write and D3's "no post-launch backfill"
  intent holds. See D3 in the program plan.

## Schema decisions (made — technical, not deferred)

- **`profiles` IS the person.** No table rename in T1; `profile.id` stays the
  scoping key so the ~150 data-layer files and all RLS policies are untouched.
- **Credential = nullable `clerk_user_id` on `profiles`**, `unique` when
  present. `null` ⇒ managed person; set ⇒ credentialed. Multiple emails / OAuth
  providers are handled *inside* one Clerk user, so a single id per person is
  sufficient.
- **Roles = a pgEnum array** `membership_role[]` (`{owner, mentor, student}`) on
  `memberships`, with a CHECK that the array is non-empty. A membership carries
  a *set* of roles (owner+mentor+student on one row), matching the model.
- **Org auto-exists.** Every person belongs to ≥1 org; backfill creates exactly
  one org per existing account and one membership per existing profile.
- **`organizations`** keeps the billing/group fields from `accounts`
  (`timezone`, deletion fields) but NOT `clerkUserId`/`email` (identity moved to
  the person). Adds `name` (defaults to the owner person's display name).

## New tables (exact shape)

```ts
// schema/profiles.ts
export const membershipRoleEnum = pgEnum('membership_role', [
  'owner', 'mentor', 'student',
]);

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
  name: text('name').notNull(),
  timezone: text('timezone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true }),
  deletionCancelledAt: timestamp('deletion_cancelled_at', { withTimezone: true }),
});

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
  personId: uuid('person_id').notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  roles: membershipRoleEnum('roles').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('memberships_person_org_unique').on(t.personId, t.organizationId),
  index('memberships_organization_id_idx').on(t.organizationId),
  // NOTE: must be cardinality(), NOT array_length(roles, 1). array_length on an
  // empty array returns NULL, so `NULL >= 1` is UNKNOWN and a CHECK passes on
  // anything but FALSE — an empty `'{}'` array would slip through. cardinality()
  // returns 0 for '{}', so `0 >= 1` is FALSE and the row is rejected.
  check('memberships_roles_non_empty', sql`cardinality(${t.roles}) >= 1`),
]);
```

> **[LOW] `memberships` is person-scoped but intentionally has no RLS in T1.**
> `rls-coverage.test.ts` only flags tables whose pgTable block literally contains
> `profile_id`; this table's column is `person_id`, so the coverage test stays
> green **by naming, not by a security decision**. `memberships` genuinely needs
> an RLS policy once it drives visibility — that is an explicit T3 obligation
> (the access-control/RLS phase), not something T1 gets "for free." Do not read
> the green coverage test as "RLS handled."

```ts
// schema/profiles.ts — add to profiles table definition
clerkUserId: text('clerk_user_id').unique(),   // nullable; null = managed person
```

```ts
// schema/billing.ts — add to subscriptions table definition
organizationId: uuid('organization_id')        // nullable in T1; made the key in T4
  .references(() => organizations.id, { onDelete: 'cascade' }),
```

## Backfill (single SQL source, embedded in the migration AND re-runnable by the test)

> **[HIGH-1] Row ids and the account→org mapping in raw SQL.** Drizzle's
> `$defaultFn(() => generateUUIDv7())` is a JS-side default applied by the query
> builder only — it emits **no** SQL `DEFAULT`, so the generated `CREATE TABLE`
> has `id uuid PRIMARY KEY NOT NULL` with no default (same as every existing
> table, e.g. `accounts` in `schema/profiles.ts:43-45`). A raw backfill `INSERT`
> that omits `id` therefore violates the PK. The backfill supplies ids
> explicitly: it **reuses `accounts.id` as `organizations.id`**, which makes the
> account→org mapping implicit (`organization_id = account_id` in steps 2–4 —
> no temp mapping column or `RETURNING` plumbing) and survives the T7 drop of
> `accounts` (there is no FK from `organizations` back to `accounts`). All other
> new ids (`memberships.id`) use `gen_random_uuid()` (core Postgres ≥13, no
> extension; Neon is PG14+).
>
> **[HIGH-2] One SQL source, executed by both the migration and the test.** The
> package integration harness (`rls.integration.test.ts:36-51`) connects to an
> **already-migrated** `DATABASE_URL` and never applies migrations itself — so a
> one-time `INSERT…SELECT` in the migration body has *already run* (against the
> empty/seed DB) before any test code executes, and can never see rows the test
> seeds afterward. The backfill DML therefore lives in a single source
> (`packages/database/src/migrations/identity-t1-backfill.sql`, also exported as
> a string const). The migration embeds it for the one-time apply; the
> integration test seeds precursor rows then executes the **same** SQL and
> asserts. Every statement is **idempotent** (`ON CONFLICT (…) DO NOTHING` on the
> unique keys, or `WHERE NOT EXISTS`) so a second execution against
> already-backfilled data is a no-op.
>
> **[HIGH-3] Guarded assumption: exactly one `is_owner=true` profile per
> account.** Nothing structurally enforces this (`profiles.isOwner` has no
> per-account unique — `schema/profiles.ts:77`), yet both the org-name lookup (a
> multi-row subquery would error) and step 3's `clerk_user_id` copy (two owners →
> duplicate-key on the new `profiles.clerk_user_id` unique) depend on it. The
> backfill SQL asserts it **first** and raises if violated:
> `DO $$ BEGIN IF EXISTS (SELECT 1 FROM profiles WHERE is_owner GROUP BY account_id HAVING count(*) > 1) THEN RAISE EXCEPTION 'identity-t1 backfill: account with >1 owner profile'; END IF; END $$;`

For each `accounts` row A (set-based, not a procedural loop):
1. INSERT one `organizations` row O **with `id = A.id`** (the reuse that makes
   the mapping in steps 2–4 implicit) — `name = COALESCE(owner.display_name,
   split_part(A.email,'@',1), 'My Organization')`, where `owner` is A's
   `is_owner=true` profile **including if archived** (the lookup must not inherit
   step 2's non-archived filter — an account mid-deletion can have an archived
   owner, and `organizations.name` is NOT NULL so a missing name would fail the
   INSERT). `timezone` = A.timezone; deletion fields copied from A.
2. For **every** `profiles` row P with `P.account_id = A.id` — **including
   archived profiles** (a seat-removed child is `archivedAt`-marked with its data
   preserved per billing-2/identity-6; excluding it would orphan that person from
   the only scoping model once T7 drops `accountId`):
   - INSERT a `memberships` row: `person_id = P.id`, `organization_id = O.id`,
     `roles` = derived set:
     - `owner` if `P.is_owner`;
     - `mentor` if P appears as `parent_profile_id` in any `family_links` row;
     - `student` always (every person learns).
   - Guarantee non-empty: a non-owner, non-parent profile gets `{student}`.
   - Archival state is NOT copied onto the membership — it stays on
     `profiles.archived_at` (unchanged in T1). The membership exists so the
     archived person has org linkage; restore/leave semantics are T5's job.
3. Copy the Clerk credential down: set `profiles.clerk_user_id = A.clerk_user_id`
   for A's owner profile only (the only profile that has a login today).
4. Set `subscriptions.organization_id = O.id` where
   `subscriptions.account_id = A.id`.

> **Migration-regeneration guard.** T1.3 generates the DDL via
> `db:generate:dev`; T1.4 then hand-appends the backfill `INSERT`/`UPDATE` SQL to
> that same migration file. `drizzle-kit` regenerates from the *schema diff* and
> will NOT reproduce hand-written DML — a later routine `db:generate:dev` would
> silently drop the backfill (this repo has prior push→migrate-skips-DML pain,
> `project_schema_drift_pattern`). Rule: once the backfill SQL is added, that
> migration file is frozen — never regenerate it; any further schema change is a
> new migration. The DDL and the backfill DML live in one file so they apply
> atomically in dependency order (tables before inserts). The backfill body is
> the single-source `identity-t1-backfill.sql` (see [HIGH-2]) inlined here, not
> re-authored — the migration and the T1.4 test execute byte-identical SQL.
>
> Note: this DML ships inside a migration that `drizzle-kit migrate` runs in
> **every** environment, not "dev/staging only" — it is simply a no-op where no
> `accounts` rows exist (empty production at launch). The "dev/staging only"
> framing in §Approach means *where the backfill does observable work*, not where
> the statement runs. (Staging currently carries journal drift — 114 applied vs
> 106 files per `project_staging_mastered_at_drift` — reconcile that before this
> migration lands on staging, or `drizzle-kit migrate` may error/skip.)

## Tasks
- [x] **T1.1: Add the `membership_role` enum + `organizations` and
  `memberships` tables and the `profiles.clerk_user_id` column to the schema.**
  *Done when:* test `organizations and memberships schema shape`
  (`schema/profiles.test.ts`) asserts the tables exist with the columns above,
  `roles` is a non-empty `membership_role[]`, and `(person_id, organization_id)`
  is unique; `pnpm --filter @eduagent/database typecheck` passes.

- [x] **T1.2: Add nullable `subscriptions.organizationId` FK and export all new
  tables from the schema barrel.**
  *Note [LOW]:* `billing.ts` currently imports only `accounts, profiles` from
  `./profiles` (`billing.ts:13`); the new FK requires adding `organizations` to
  that import.
  *Done when:* test `subscriptions has nullable organizationId`
  (`schema/billing.test.ts`) asserts the column + FK and that it is nullable;
  the new tables are importable from `@eduagent/database`.

- [x] **T1.3: Generate the additive migration (DDL only) and verify it applies
  cleanly to a fresh dev DB.**
  *Done when:* `pnpm run db:generate:dev` produces one migration containing only
  `CREATE TABLE`/`ALTER TABLE ADD`/`CREATE TYPE` (no `DROP`); `pnpm run
  db:migrate:dev` applies it; `drizzle-meta-coverage.test.ts` passes.

- [x] **T1.4: Add the backfill SQL to the migration and prove the mapping.**
  *How the test runs the backfill [HIGH-2]:* the package harness connects to an
  already-migrated DB (`rls.integration.test.ts:36-51`), so the test does NOT
  "run the migration." It seeds precursor rows, then `db.execute`s the
  single-source `identity-t1-backfill.sql` (the exact SQL the migration embeds),
  then asserts. The SQL is idempotent, so this is safe even though the migration
  already ran its copy at migrate time. Requires a real Postgres
  (`DATABASE_URL`); follows the `describeIfDb` skip pattern. Run against a
  freshly-migrated **dev** DB (`db:migrate:dev`), not the drifted staging Neon
  (`project_dev_schema_drift_trap`).
  *Done when:* integration test `backfill maps accounts→orgs and
  profiles→memberships` (`packages/database/src/identity-backfill.integration.test.ts`)
  seeds: one account with an owner **plus a linked child where the `family_links`
  row is `parent_profile_id = owner.id, child_profile_id = child.id`** (this
  direction is load-bearing — the `mentor` role derives from the owner appearing
  as `parent_profile_id`), one solo account, one account with an archived
  **child** (`archivedAt` set, e.g. a seat-removed child), **and one account
  with an archived OWNER** (mid-deletion — exercises step 1's "including if
  archived" name lookup [MEDIUM]); executes the backfill SQL; asserts (a) one
  organization per account, (b) one membership per profile **including the
  archived ones**, (c) owner profile's membership roles ==
  `{owner, mentor, student}`, child's == `{student}`, solo's ==
  `{owner, student}`, (d) owner profile's `clerk_user_id` copied, child's still
  null, (e) each subscription's `organization_id` set to its account's org
  (== that account's id, per the [HIGH-1] reuse), (f) the archived child has a
  `{student}` membership and its `archived_at` is untouched, (g) the
  archived-owner account still gets an `organizations.name` (not NULL) derived
  from the archived owner's `display_name`.

- [x] **T1.5: Add forward invariant + negative-path tests.**
  *Done when:* three tests pass:
  - `every person has at least one membership` — counts memberships per profile
    (archived included) after executing the backfill SQL; fails (red) if the
    backfill skips a profile — verify red by temporarily removing the membership
    INSERT branch from the single-source `identity-t1-backfill.sql` and re-running
    the test (not by editing the already-applied migration, which the harness
    never re-runs).
  - `every membership has a non-empty role set` — asserts `cardinality(roles) >=
    1` holds for all rows.
  - `empty roles array is rejected by the CHECK constraint` (the break test for
    CRITICAL-1) — attempts `INSERT … roles = '{}'::membership_role[]` and asserts
    it throws a check-constraint violation. This test fails (no error thrown) if
    the constraint is written with `array_length(roles, 1)` instead of
    `cardinality(roles)`, which is exactly the regression it guards.

## Verification (whole phase)
- `pnpm --filter @eduagent/database test` green (new schema + backfill tests).
  **[H1] The backfill/invariant suites are `describe.skip` without `DATABASE_URL`**
  (the established repo convention for `*.integration.test.ts`). They prove
  nothing when skipped — run them with the DB injected and a migrated dev schema:
  `C:/Tools/doppler/doppler.exe run -- pnpm --filter @eduagent/database exec jest --runInBand`.
  A green run that skipped them is NOT evidence the backfill works.
- `pnpm --filter @eduagent/database typecheck` green (package has no `typecheck`
  script — run `pnpm exec tsc --noEmit` inside `packages/database`).
- `pnpm run db:migrate:dev` applies the migration to a **fresh** dev DB with no
  error. NOTE: the shared dev DB carries push→migrate ledger drift
  (`project_schema_drift_pattern`) — an intermediate unapplied migration collides
  on `migrate`. On a drifted dev DB, apply the additive 0106 DDL directly (it is
  collision-free — none of its objects exist) and let the integration tests run
  the backfill; `migrate` is the correct path on a clean baseline (staging/prod).
- No existing test regresses: `pnpm exec nx run api:test` green (T1 is additive;
  nothing should change behavior yet). API `tsc --noEmit` confirmed clean.

## Rollback
Additive-only. Rollback = drop `memberships`, `organizations`, the
`membership_role` type, `profiles.clerk_user_id`, and
`subscriptions.organization_id`. **No data is lost** — every new row is derived
from still-present `accounts`/`profiles`/`family_links`/`subscriptions` data, and
no legacy column is modified or dropped in T1. Rollback is therefore fully
reversible with zero data impact. (Precise: steps 3–4 of the backfill *write*
into the **new** `profiles.clerk_user_id` / `subscriptions.organization_id`
columns — no legacy column is touched — and dropping those columns on rollback
discards only derived values, so "zero data loss" holds.)

> **[M3] New cascade edge for T2+ to respect.** `subscriptions.organization_id`
> and `memberships.{person_id,organization_id}` are all `onDelete: cascade`.
> Because `organizations.id` reuses `accounts.id` but lives in a separate table,
> deleting an `organizations` row *independently* of its account would
> cascade-delete that org's subscription and memberships — a "delete org, lose
> billing" path that did not exist pre-T1. In T1 nothing deletes orgs (no
> reader/writer is wired). T4 (billing) and T5 (leave-org/owner-deletion) must
> delete the account/org as a unit, or explicitly reassign the subscription
> first. Tracked here so the cascade is a conscious contract, not a surprise.
