---
title: Identity Redesign — T1 Data Model — Implementation Plan
date: 2026-05-31
profile: change
spec: docs/plans/2026-05-31-identity-org-membership-redesign.md
status: draft
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
  check('memberships_roles_non_empty', sql`array_length(${t.roles}, 1) >= 1`),
]);
```

```ts
// schema/profiles.ts — add to profiles table definition
clerkUserId: text('clerk_user_id').unique(),   // nullable; null = managed person
```

```ts
// schema/billing.ts — add to subscriptions table definition
organizationId: uuid('organization_id')        // nullable in T1; made the key in T4
  .references(() => organizations.id, { onDelete: 'cascade' }),
```

## Backfill (in the same migration, after DDL)

For each `accounts` row A:
1. INSERT one `organizations` row O — `name` = display name of A's owner
   profile (the `isOwner=true` profile under A), `timezone` = A.timezone,
   deletion fields copied from A.
2. For each non-archived `profiles` row P with `P.account_id = A.id`:
   - INSERT a `memberships` row: `person_id = P.id`, `organization_id = O.id`,
     `roles` = derived set:
     - `owner` if `P.is_owner`;
     - `mentor` if P appears as `parent_profile_id` in any `family_links` row;
     - `student` always (every person learns).
   - Guarantee non-empty: a non-owner, non-parent profile gets `{student}`.
3. Copy the Clerk credential down: set `profiles.clerk_user_id = A.clerk_user_id`
   for A's owner profile only (the only profile that has a login today).
4. Set `subscriptions.organization_id = O.id` where
   `subscriptions.account_id = A.id`.

## Tasks
- [ ] **T1.1: Add the `membership_role` enum + `organizations` and
  `memberships` tables and the `profiles.clerk_user_id` column to the schema.**
  *Done when:* test `organizations and memberships schema shape`
  (`schema/profiles.test.ts`) asserts the tables exist with the columns above,
  `roles` is a non-empty `membership_role[]`, and `(person_id, organization_id)`
  is unique; `pnpm --filter @eduagent/database typecheck` passes.

- [ ] **T1.2: Add nullable `subscriptions.organizationId` FK and export all new
  tables from the schema barrel.**
  *Done when:* test `subscriptions has nullable organizationId`
  (`schema/billing.test.ts`) asserts the column + FK and that it is nullable;
  the new tables are importable from `@eduagent/database`.

- [ ] **T1.3: Generate the additive migration (DDL only) and verify it applies
  cleanly to a fresh dev DB.**
  *Done when:* `pnpm run db:generate:dev` produces one migration containing only
  `CREATE TABLE`/`ALTER TABLE ADD`/`CREATE TYPE` (no `DROP`); `pnpm run
  db:migrate:dev` applies it; `drizzle-meta-coverage.test.ts` passes.

- [ ] **T1.4: Add the backfill SQL to the migration and prove the mapping.**
  *Done when:* integration test `backfill maps accounts→orgs and
  profiles→memberships` (`packages/database/src/identity-backfill.integration.test.ts`)
  seeds: one account with an owner+child (linked) and one solo account; runs the
  migration; asserts (a) one organization per account, (b) one membership per
  profile, (c) owner profile's membership roles == `{owner, mentor, student}`,
  child's == `{student}`, solo's == `{owner, student}`, (d) owner profile's
  `clerk_user_id` copied, child's still null, (e) each subscription's
  `organization_id` set to its account's org.

- [ ] **T1.5: Add a forward invariant test that every membership has a non-empty
  role set and every person has ≥1 membership after backfill.**
  *Done when:* test `every person has at least one membership with a non-empty
  role set` passes against seeded data; it fails (red) if the backfill skips a
  profile — verify by temporarily commenting the child-membership insert.

## Verification (whole phase)
- `pnpm --filter @eduagent/database test` green (new schema + backfill tests).
- `pnpm --filter @eduagent/database typecheck` green.
- `pnpm run db:migrate:dev` applies the migration to a fresh dev DB with no error.
- No existing test regresses: `pnpm exec nx run api:test` green (T1 is additive;
  nothing should change behavior yet).

## Rollback
Additive-only. Rollback = drop `memberships`, `organizations`, the
`membership_role` type, `profiles.clerk_user_id`, and
`subscriptions.organization_id`. **No data is lost** — every new row is derived
from still-present `accounts`/`profiles`/`family_links`/`subscriptions` data, and
no legacy column is modified or dropped in T1. Rollback is therefore fully
reversible with zero data impact.
