---
title: Identity Redesign — T2 Identity / Auth — Implementation Plan
date: 2026-05-31
profile: change
spec: docs/plans/2026-05-31-identity-org-membership-redesign.md
status: draft
---

# Identity Redesign — T2 Identity / Auth

**Goal:** Resolve a Clerk session to a **person + organization + membership-role
set** (not an account), support managed (no-login) vs credentialed (own-login)
persons with multiple emails/OAuth on one identity, and ship the first two
lifecycle flows — **#1 cross-account invite/claim** and **#2 managed→credentialed
graduation** — all gated behind a development flag so the production
account-based path is unchanged.

**Approach:** Layer V1 identity resolution *alongside* the existing
account-based chain behind a new `MODE_IDENTITY_V1_ENABLED` dev flag (mirrors the
nav-contract V0/V1 pattern). Flag-off = today's behavior, byte-for-byte. Flag-on
= person-first resolution keyed on `profiles.clerk_user_id`, an org/membership
context stamp, a membership-role-based proxy-guard that authorizes a learner's
self-writes (closes `learn-1`), and new invite/claim + graduation services and
routes. The legacy `accounts` row is retained for billing continuity (T4 moves
billing to `organizationId`; T7 drops `accounts` and the flag). No data-layer
scoping (`createScopedRepository` / RLS) is rewired here — that is T3.

## Prerequisite (hard gate)

T1's schema is currently **uncommitted on branch `T1-refactor`** (working-tree
only: `organizations`, `memberships`, `membership_role` enum,
`profiles.clerk_user_id`, `subscriptions.organization_id`, migration
`0106_identity_t1_org_membership.sql` + backfill). **T2 must branch from a state
where T1 is committed and migration 0106 is applied to the target dev DB.** Every
task below assumes those objects exist. If T1 is not yet landed, land it first
(`git` commit on `T1-refactor` → merge) before starting T2.

> T2 does **not** depend on the 0106 *backfill* having run for any given account:
> `ensureIdentityV1` (T2.3) is the idempotent live equivalent and self-heals an
> account on first flag-on request. T2 depends only on the 0106 *DDL* (tables +
> columns) existing.

## Scope

In scope:
- `apps/api/src/config.ts` — `MODE_IDENTITY_V1_ENABLED` flag + `isIdentityV1Enabled` helper.
- `apps/api/src/middleware/{account,profile-scope,proxy-guard}.ts` — flag-gated V1 resolution branches.
- `apps/api/src/services/identity.ts` (new) — person/org/membership resolution + idempotent provisioning.
- `apps/api/src/services/invitation.ts` (new) — flows #1 (invite/accept) and #2 (claim/redeem-graduation).
- `apps/api/src/services/profile.ts` — `createProfileWithLimitCheck` creates a membership for new managed profiles (flag-on).
- `apps/api/src/routes/invitations.ts` (new) + registration in `apps/api/src/index.ts`.
- `apps/api/src/index.ts` — `Variables` type gains `personId`, `organizationId`, `activeRoles`; CORS `allowHeaders` unchanged (no new request header introduced in T2).
- `packages/database/src/schema/invitations.ts` (new) — `organization_invitations` table + barrel export.
- New Drizzle migration `0107_identity_t2_invitations.sql` (additive: one table).
- Co-located unit/integration tests for each of the above.

Out of scope (later phases):
- **Data-layer scoping flip** — `createScopedRepository`, RLS policies, the
  ~150 WHERE-clause files, mentor-writes-to-mentee (`learn-2`), and the D3
  `organization_id` learning-record stamp are all **T3**.
- **Billing rewire** — `subscriptions.accountId` → `organizationId`, quota pools,
  webhooks, KV keys are **T4**. T2 keeps `accounts` + `findOrCreateAccount` alive
  for billing; the kid's billing context stays the parent's org until T4/T5.
- **Flows #3–#7** (leave-org, per-person export, consent revoke, ownership
  transfer, per-member progress) — **T5**.
- **Mobile surface** (profile-switch, onboarding, invite/claim/consent UI) — **T6**.
- **Multi-org *active* selection** — a person may hold ≥2 memberships after an
  invite, but T2 always treats the **home org** (`organization_id === account.id`)
  as the active org. A header-driven active-org switch is T3/T6.
- **Dropping any legacy column / `accounts.clerkUserId` / `family_links` / the
  flag itself** — **T7**.
- **Merging two pre-existing persons** — out of scope program-wide (D5).

## Architecture decisions (made — not deferred)

1. **Flag name + read pattern.** `MODE_IDENTITY_V1_ENABLED` (Doppler-controlled,
   default `'false'`). Read in API code only through the typed config / `c.env`
   (eslint G4 forbids raw `process.env`). Helper in `config.ts`:
   `isIdentityV1Enabled(value) => value === 'true'`. Middleware reads
   `isIdentityV1Enabled(c.env?.MODE_IDENTITY_V1_ENABLED)`.

2. **Identity key = Clerk `sub`, resolved against `profiles.clerk_user_id` (V1),
   not `accounts.clerk_user_id`.** This is the load-bearing change. A graduated
   managed child holds their own `sub` on `profiles.clerk_user_id` while their
   `profiles.account_id` still points at the parent's account; resolving account
   via `findOrCreateAccount(sub)` would wrongly mint a new empty account. So
   flag-on resolution is **person-first**: `person = profiles WHERE clerk_user_id
   = sub`; `account = accounts WHERE id = person.account_id`. `findOrCreateAccount`
   is used flag-on **only** to provision a genuinely new credentialed person.

3. **Email is not an identity key in V1.** "Two providers / two emails, same
   identity" is satisfied because resolution keys on `sub` (one Clerk user = one
   `sub` regardless of how many emails/OAuth connections it holds). The
   `findOrCreateAccount` email-reclaim block (`account.ts:165-224`) only fires on
   *new-account creation* when a *different* `sub` reuses an email — that is two
   distinct Clerk users (two persons), correctly still blocked.

4. **Home org reuses `account.id`.** Per the T1 backfill, `organizations.id ===
   accounts.id`. T2's `organizationId` context value = `account.id`. This keeps
   "same account" ≡ "same home org" so the profile-scope authority check
   (`getProfile(db, profileId, account.id)`) is correct in T2 without a
   membership-join rewrite (that rewrite is T3).

5. **Proxy-guard fix for `learn-1` (D6).** Flag-on, `assertNotProxyMode`
   authorizes the active profile's **self-write to its own learning data** when
   its membership in the home org includes the `student` role — regardless of
   `isOwner`. This is the product's core loop (a managed child studies on a shared
   device; a credentialed child studies on their own login). Genuine proxy
   (mentor acting *as* a mentee — `learn-2`) stays a T3 concern; the client
   `X-Proxy-Mode: true` read-only switch still tightens. Owner-only routes are
   **independently** gated by `assertOwnerProfile`/`assertOwnerAndParentAccess`
   (not by `assertNotProxyMode`) — T2.6 verifies this so loosening the guard
   cannot open billing.

6. **One table for both flows.** `organization_invitations` carries
   `kind ∈ {'invite','claim'}`:
   - `invite` (flow #1): attach an *existing or newly-provisioned credentialed*
     person to the org with `invited_roles` via a new membership. Never creates a
     parallel managed duplicate (design rule that keeps D5 out of scope).
   - `claim` (flow #2): graduate a specific *managed* person — set its
     `clerk_user_id` to the redeemer's `sub`, preserving all history (same
     `profiles.id`). `target_profile_id` is set only for `kind='claim'`.

7. **Provision-exemption.** The graduation redeem endpoint must NOT trigger
   account/person provisioning (that would create the duplicate it exists to
   avoid). `ACCOUNT_PROVISION_EXEMPT_PATHS = ['/invitations/claims/redeem']`;
   flag-on `accountMiddleware` skips provisioning on these paths and lets the
   route operate on the verified `sub` (`user.userId`) alone. Invite-accept is
   **not** exempt — the accepter is provisioned their own home org-of-one, then
   the accept endpoint adds a *second* membership into the inviting org.

## Surface map (file → responsibility)

| File | New/Changed | Responsibility |
|---|---|---|
| `config.ts` | changed | flag + `isIdentityV1Enabled` |
| `services/identity.ts` | new | `resolvePersonByClerkId`, `ensureIdentityV1`, `resolveActiveMembershipRoles` |
| `services/invitation.ts` | new | `createInvitation`, `acceptInvitation`, `createClaim`, `redeemClaim` |
| `routes/invitations.ts` | new | 4 routes (create invite, accept, create claim, redeem) |
| `middleware/account.ts` | changed | flag-on person-first resolution + provision-exempt paths; sets `account`, `personId`, `organizationId` |
| `middleware/profile-scope.ts` | changed | flag-on: set `activeRoles` (+ keep `organizationId`) for the active profile |
| `middleware/proxy-guard.ts` | changed | flag-on: student-role self-write authorization |
| `services/profile.ts` | changed | `createProfileWithLimitCheck` creates `{student}` membership for new managed profiles (flag-on) |
| `index.ts` | changed | register invitations route; extend `Variables` type |
| `packages/database/src/schema/invitations.ts` | new | `organization_invitations` table |
| `packages/database/src/schema/index.ts` | changed | export new table |
| `apps/api/drizzle/0107_*.sql` | new | additive migration (one table) |

## Tasks

- [ ] **T2.1 — Feature flag.** Add `MODE_IDENTITY_V1_ENABLED: z.enum(['true',
  'false']).default('false')` to `envSchema` in `config.ts` (next to
  `CHALLENGE_ROUND_RUNTIME_ENABLED`), with a comment documenting it as the T2–T7
  development flag (removed in T7). Add and export
  `export function isIdentityV1Enabled(value: string | undefined): boolean {
  return value === 'true'; }`.
  *Done when:* `config.test.ts` asserts the flag defaults to `'false'` and that
  `isIdentityV1Enabled('true') === true` / `isIdentityV1Enabled(undefined) ===
  false`; `pnpm exec nx run api:typecheck` passes.

- [ ] **T2.2 — `organization_invitations` schema + migration.** Add the table in
  a new `packages/database/src/schema/invitations.ts` (exact shape in
  §Schema below), export it from `packages/database/src/schema/index.ts`, run
  `pnpm run db:generate:dev` to produce `0107_identity_t2_invitations.sql`
  (CREATE TABLE only — no DROP), and apply with `pnpm run db:migrate:dev`.
  *Done when:* a co-located `schema/invitations.test.ts` asserts the columns,
  the `kind`/`status` CHECKs, the `invited_roles` non-empty CHECK, the unique
  `token_hash`, and the two FKs (`organization_id`, `target_profile_id`); the
  generated migration contains only additive DDL; `db:migrate:dev` applies clean
  on a fresh dev DB; `drizzle-meta-coverage.test.ts` passes.

- [ ] **T2.3 — Identity service.** Create `services/identity.ts` with the three
  functions in §Code (`resolvePersonByClerkId`, `ensureIdentityV1`,
  `resolveActiveMembershipRoles`). `ensureIdentityV1` is idempotent and
  short-circuits when `organizations WHERE id = account.id` already exists.
  *Done when:* `services/identity.integration.test.ts` (DB-backed, `describeIfDb`)
  proves: (a) `resolvePersonByClerkId` returns the profile whose
  `clerk_user_id` matches and `null` otherwise; (b) `ensureIdentityV1` on a fresh
  account creates exactly one org (`id = account.id`), copies `clerk_user_id` to
  the owner profile, and creates one `{owner,student}` (+`mentor` if the owner is
  a parent in `family_links`) membership, and is a **no-op on second call**;
  (c) `resolveActiveMembershipRoles(db, profileId, orgId)` returns the role array.

- [ ] **T2.4 — Account middleware V1 branch.** In `account.ts`, when
  `isIdentityV1Enabled`, replace the `findOrCreateAccount(sub)` path with
  person-first resolution (§Code): resolve `person` by `sub`; if found, set
  `account` from `person.accountId`, set `personId` + `organizationId`
  (`= account.id`); if not found and the path is **not** provision-exempt,
  provision a new credentialed person (`findOrCreateAccount` → `createProfile`
  owner → `ensureIdentityV1`); if not found and the path **is** provision-exempt,
  set nothing and continue. Flag-off path is untouched. Add
  `ACCOUNT_PROVISION_EXEMPT_PATHS = new Set(['/invitations/claims/redeem'])`.
  Extend `AccountEnv.Variables` and `index.ts` `Variables` with
  `personId: string | undefined` and `organizationId: string | undefined`.
  *Done when:* `account.test.ts` adds flag-on cases proving: a `sub` already on
  a `profiles.clerk_user_id` resolves `account = profile.account_id` **without
  calling `findOrCreateAccount`** (assert via a graduated-kid fixture whose
  `account.clerk_user_id !== sub`); a brand-new `sub` on a non-exempt path
  provisions account+owner+org+membership; a brand-new `sub` on
  `/invitations/claims/redeem` leaves `account`/`personId` unset and proceeds;
  the flag-off path is byte-identical (existing `account.test.ts` cases stay
  green unchanged).

- [ ] **T2.5 — Profile-scope V1 branch.** In `profile-scope.ts`, when
  `isIdentityV1Enabled` and a profile is resolved (both the auto-resolve and the
  explicit-header paths), additionally resolve and set
  `c.set('activeRoles', roles)` via `resolveActiveMembershipRoles(db,
  resolvedProfileId, c.get('organizationId'))`. The account-based ownership
  check (`getProfile(db, profileIdHeader, account.id)`) is **unchanged** in T2
  (correct because home `organization_id === account.id` — decision #4). Add
  `activeRoles: MembershipRole[] | undefined` to `ProfileScopeEnv.Variables` and
  the `index.ts` `Variables` type.
  *Done when:* `profile-scope.test.ts` adds flag-on cases: auto-resolved owner
  gets `activeRoles` containing `owner`+`student`; an explicit `X-Profile-Id`
  for a managed child gets `activeRoles` containing `student`; flag-off leaves
  `activeRoles` undefined and all existing cases stay green.

- [ ] **T2.6 — Proxy-guard self-write fix (`learn-1`).** In `proxy-guard.ts`,
  branch `assertNotProxyMode` on the flag (§Code): flag-on, allow the write when
  `c.get('activeRoles')` includes `'student'` (still rejecting an explicit
  `X-Proxy-Mode: true`), and fail closed (403) when `activeRoles` is
  absent/empty; flag-off keeps the exact `isOwner === false` logic. **Before
  loosening, verify owner-only routes are independently owner-gated:** grep every
  `assertNotProxyMode` call site that performs an owner-only mutation (billing,
  account settings) and confirm it also calls `assertOwnerProfile` /
  `assertOwnerAndParentAccess`; if any relies on `assertNotProxyMode` alone, add
  the owner guard in this task.
  *Done when:* the `learn-1` regression test in `proxy-guard.test.ts`
  (`child runs own session — write authorized under V1`) seeds a non-owner
  student-role active profile and asserts a write **passes** flag-on but is
  **403** flag-off (red-green: this is the exact behavior change); a second test
  asserts `X-Proxy-Mode: true` still 403s flag-on; a third asserts absent
  `activeRoles` → 403 flag-on (fail-closed); the owner-only-route audit is
  recorded in the task's commit message with the grep evidence.

- [ ] **T2.7 — Managed-person membership on creation.** In
  `createProfileWithLimitCheck` (`profile.ts`), when `isIdentityV1Enabled` (pass
  the resolved boolean in `opts`, mirroring `adultOwnerGateEnabled`), create the
  new profile's membership inside the existing transaction: `{owner}`+`{student}`
  for the first profile, `{student}` for a non-first (managed child), in the home
  org (`organization_id === account.id`, ensured via `ensureIdentityV1` first).
  The managed child's `profiles.clerk_user_id` stays `null` (no login). Plumb the
  flag from `routes/profiles.ts` the same way `ADULT_OWNER_GATE_ENABLED` is read
  (`c.env?.MODE_IDENTITY_V1_ENABLED`).
  *Done when:* `profile.test.ts` (or `profile.integration.test.ts`) proves
  flag-on: creating the first profile yields `clerk_user_id` set on the owner +
  an `{owner,student}` membership; creating a second profile yields
  `clerk_user_id === null` + a `{student}` membership in the same org; flag-off
  creates no membership (existing cases stay green).

- [ ] **T2.8 — Invitation service (flows #1 and #2).** Create
  `services/invitation.ts` with the four functions in §Code. Tokens are opaque
  random strings returned **once**; only the SHA-256 hash is stored (reuse the
  `createHash` pattern from `account.ts:69`). `acceptInvitation` merges roles
  into an existing membership via `ON CONFLICT (person_id, organization_id) DO
  UPDATE`, never creating a duplicate profile. `redeemClaim` sets
  `target_profile.clerk_user_id` only when it is currently `null` and the
  redeeming `sub` is not already attached to another profile.
  *Done when:* `services/invitation.integration.test.ts` proves —
  **happy paths:** (1) accept-invite creates a `{mentor}` (or invited-roles)
  membership linking the accepter's person to the inviting org with no new
  profile row; (2) redeem-claim sets the managed target's `clerk_user_id` and
  leaves its session/subject rows **count-unchanged** (history intact).
  **break/negative paths (required per Fix Development Rules):**
  (3) redeeming an already-redeemed/`accepted` token → rejected;
  (4) redeeming a claim whose `target_profile.clerk_user_id` is already set
  (already credentialed) → rejected;
  (5) redeeming with a `sub` already attached to a different profile → rejected
  (anti-duplicate guard);
  (6) accepting/redeeming an expired token → rejected.

- [ ] **T2.9 — Invitation routes + wiring.** Create `routes/invitations.ts` with
  `POST /invitations` (create invite — `assertOwnerProfile`), `POST
  /invitations/accept` (flow #1 — body `{token}`, reads `user.userId`), `POST
  /invitations/claims` (create claim for a managed member — `assertOwnerProfile`
  + assert `target` is managed and in the caller's org), `POST
  /invitations/claims/redeem` (flow #2 — body `{token}`, provision-exempt, reads
  `user.userId`). Register the route group in `index.ts` after the existing route
  chain. Confirm `/invitations/claims/redeem` is in
  `ACCOUNT_PROVISION_EXEMPT_PATHS`.
  *Done when:* `routes/invitations.test.ts` proves each route's authz (create
  endpoints 403 for non-owners; redeem reachable without a provisioned account)
  and the happy path for invite-accept and claim-redeem returns 200 with the
  expected membership/credential side effects asserted via DB read.

- [ ] **T2.10 — Phase verification (multi-email + no-regress).** Add the
  multi-email identity test and run the full flag-off regression sweep.
  *Done when:* (a) `services/identity.integration.test.ts` adds
  `same Clerk sub with a different email claim resolves the same person` —
  resolve a person by `sub`, then resolve again with a different `email` and
  assert the same `profiles.id` and **no** second person/account created;
  (b) `pnpm exec nx run api:test` green; (c) `pnpm exec nx run api:typecheck`
  green; (d) `pnpm exec nx run api:lint` green (no `eslint-disable`, G4 typed-env
  respected); (e) integration suite `pnpm exec nx test:integration api` green
  (per CLAUDE.md, hooks skip `.integration.test.`); (f) a documented manual
  check that with `MODE_IDENTITY_V1_ENABLED=false` the auth→account→profile chain
  is unchanged (the existing `account.test.ts` + `profile-scope.test.ts` +
  `proxy-guard.test.ts` suites all pass without modification to their flag-off
  assertions).

## Schema (T2.2 — exact shape)

```ts
// packages/database/src/schema/invitations.ts
import {
  pgTable, uuid, text, timestamp, check, unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUUIDv7 } from '../uuid'; // same source createId helper the other tables use
import { organizations, profiles, membershipRoleEnum } from './profiles';

export const organizationInvitations = pgTable(
  'organization_invitations',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
    organizationId: uuid('organization_id').notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // 'invite' = attach an existing/new credentialed person to the org;
    // 'claim'  = graduate a specific managed person (set its clerk_user_id).
    kind: text('kind').notNull(),
    invitedRoles: membershipRoleEnum('invited_roles').array().notNull(),
    // Set only for kind='claim' — the managed profile being graduated.
    targetProfileId: uuid('target_profile_id')
      .references(() => profiles.id, { onDelete: 'cascade' }),
    // SHA-256 of the opaque token; the raw token is returned to the caller once.
    tokenHash: text('token_hash').notNull(),
    emailHint: text('email_hint'),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByProfileId: uuid('accepted_by_profile_id')
      .references(() => profiles.id, { onDelete: 'set null' }),
  },
  (t) => [
    unique('organization_invitations_token_hash_unique').on(t.tokenHash),
    check('organization_invitations_kind_check',
      sql`${t.kind} IN ('invite', 'claim')`),
    check('organization_invitations_status_check',
      sql`${t.status} IN ('pending', 'accepted', 'revoked', 'expired')`),
    // Same cardinality() rationale as memberships_roles_non_empty (T1).
    check('organization_invitations_roles_non_empty',
      sql`cardinality(${t.invitedRoles}) >= 1`),
  ],
);

export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type NewOrganizationInvitation = typeof organizationInvitations.$inferInsert;
```

> Migration note: hand-written DML is **not** added to `0107` — it is DDL-only,
> so `drizzle-kit generate` will reproduce it faithfully (unlike 0106, which is
> frozen because it carries backfill DML — see the T1 plan's
> migration-regeneration guard).

## Code (decision-critical signatures)

```ts
// services/identity.ts
import { and, eq, isNull } from 'drizzle-orm';
import {
  accounts, profiles, organizations, memberships, familyLinks,
  type Database, type MembershipRole,
} from '@eduagent/database';

export async function resolvePersonByClerkId(
  db: Database, clerkUserId: string,
): Promise<typeof profiles.$inferSelect | null> {
  const row = await db.query.profiles.findFirst({
    where: eq(profiles.clerkUserId, clerkUserId),
  });
  return row ?? null;
}

/**
 * Idempotent live equivalent of the 0106 backfill, for ONE account. Short-
 * circuits when the home org already exists. Safe to call every flag-on request.
 */
export async function ensureIdentityV1(
  db: Database,
  account: { id: string; clerkUserId: string; email: string; timezone: string | null },
): Promise<void> {
  const existingOrg = await db.query.organizations.findFirst({
    where: eq(organizations.id, account.id),
  });
  if (existingOrg) return; // already provisioned (backfill or a prior request)

  // 1. org (id reuses account.id). name from owner displayName, else email local-part.
  // 2. copy clerk_user_id onto the owner profile (WHERE is_owner AND clerk_user_id IS NULL).
  // 3. membership per profile: owner→{owner,(mentor if parent in family_links),student}; else {student}.
  //    INSERT ... ON CONFLICT (person_id, organization_id) DO NOTHING.
  // (Full INSERT…SELECT bodies mirror 0106 steps 1-3; one txn.)
}

export async function resolveActiveMembershipRoles(
  db: Database, profileId: string, organizationId: string,
): Promise<MembershipRole[]> {
  const row = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.personId, profileId),
      eq(memberships.organizationId, organizationId),
    ),
  });
  return row?.roles ?? [];
}
```

```ts
// middleware/account.ts — flag-on branch (flag-off path unchanged)
const ACCOUNT_PROVISION_EXEMPT_PATHS = new Set(['/invitations/claims/redeem']);

if (isIdentityV1Enabled(c.env?.MODE_IDENTITY_V1_ENABLED)) {
  const person = await resolvePersonByClerkId(db, user.userId);
  if (person) {
    const acct = await findAccountById(db, person.accountId); // new thin helper in account.ts
    c.set('account', acct);
    c.set('personId', person.id);
    c.set('organizationId', acct.id); // home org === account.id (decision #4)
    return next();
  }
  if (ACCOUNT_PROVISION_EXEMPT_PATHS.has(new URL(c.req.url).pathname)) {
    return next(); // redeem operates on user.userId alone; no provisioning
  }
  // genuinely new credentialed person: account+trial, owner profile, org, membership
  const acct = await findOrCreateAccount(db, user.userId, verifiedEmail.email);
  await ensureNewCredentialedPerson(db, acct, user.userId, verifiedEmail.email); // wraps createProfile(owner) + ensureIdentityV1
  c.set('account', acct);
  c.set('personId', /* owner profile id */);
  c.set('organizationId', acct.id);
  return next();
}
// ...existing flag-off findOrCreateAccount path below, untouched...
```

```ts
// middleware/proxy-guard.ts — flag-on branch (flag-off isOwner path unchanged)
export function assertNotProxyMode(c: Context<ProfileScopeEnv> | Context): void {
  if (isIdentityV1Enabled((c as Context).env?.MODE_IDENTITY_V1_ENABLED)) {
    const roles = (c as Context<{ Variables: { activeRoles?: MembershipRole[] } }>)
      .get('activeRoles');
    // Fail closed when membership roles are unresolved.
    if (!roles || roles.length === 0) {
      throw new HTTPException(403, { message: PROXY_MODE_MESSAGE, res: c.json(proxyModeBody, 403) });
    }
    // D6 / learn-1: a student-role member's self-write to its own data is authorized,
    // regardless of isOwner. Owner-only routes are gated separately by assertOwnerProfile.
    if (roles.includes('student')) {
      if (c.req.header('X-Proxy-Mode') === 'true') {
        throw new HTTPException(403, { message: PROXY_MODE_MESSAGE, res: c.json(proxyModeBody, 403) });
      }
      return;
    }
    throw new HTTPException(403, { message: PROXY_MODE_MESSAGE, res: c.json(proxyModeBody, 403) });
  }
  // ...existing flag-off profileMeta.isOwner logic (proxy-guard.ts:50-73), untouched...
}
```

```ts
// services/invitation.ts — signatures (bodies per §Done-when in T2.8)
export async function createInvitation(
  db: Database, organizationId: string,
  invitedRoles: MembershipRole[], opts?: { email?: string; ttlHours?: number },
): Promise<{ invitation: OrganizationInvitation; rawToken: string }>;

export async function acceptInvitation(            // flow #1
  db: Database, rawToken: string, accepterClerkUserId: string, accepterEmail?: string,
): Promise<{ membershipId: string; organizationId: string }>;

export async function createClaim(                 // flow #2 — issue
  db: Database, organizationId: string, targetProfileId: string,
  opts?: { email?: string; ttlHours?: number },
): Promise<{ invitation: OrganizationInvitation; rawToken: string }>;

export async function redeemClaim(                 // flow #2 — graduate
  db: Database, rawToken: string, redeemerClerkUserId: string,
): Promise<{ graduatedProfileId: string }>;
```

## Risks & rollback

- **Loosening `assertNotProxyMode` could open owner-only mutations** if any
  owner-only route relied on the guard alone. T2.6 audits all 34 call sites and
  confirms `assertOwnerProfile`/`assertOwnerAndParentAccess` independently gates
  every owner-only mutation before the loosening ships. The flag (default off)
  contains any miss to dev/staging.
- **Person-first account resolution is the highest-risk change.** A bug that
  mis-resolves `account` flag-on would mis-scope every downstream query. Mitigation:
  the graduated-kid fixture (`account.clerk_user_id !== sub`) in T2.4 is the
  explicit regression for the exact failure mode; flag-off path is provably
  byte-identical (no edits to its lines).
- **Duplicate-person creation during graduation** is prevented by provision-
  exemption (decision #7) + the T2.8 break tests (5) and (6). The mobile flow
  (T6) additionally routes graduation straight to redeem as the first
  authenticated action.
- **Rollback:** pre-launch, zero users. Rollback of T2 = revert the branch +
  re-seed dev/staging; set `MODE_IDENTITY_V1_ENABLED=false` in Doppler. The
  `0107` migration is additive (one table, no drops) and harmless when the flag
  is off. No destructive production migration is performed.
```
