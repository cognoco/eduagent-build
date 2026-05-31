---
title: Identity Redesign — T2 Identity / Auth — Implementation Plan
date: 2026-05-31
profile: change
spec: docs/plans/2026-05-31-identity-org-membership-redesign.md
status: draft
revision: v2 — hardened against adversarial review (chain-interaction findings CRITICAL-1, HIGH-1/2, MEDIUM-1/2/3, LOW-1)
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
   is used flag-on **only** to provision the *account* (billing) for a genuinely
   new credentialed sub. The owner **profile**, its `clerk_user_id`, and its
   membership are created later by onboarding's `POST /profiles` first-profile
   path (T2.7), **not** in middleware — eagerly creating the owner profile in
   `accountMiddleware` would race that path and corrupt its `isFirstProfile`
   count. So flag-on, a brand-new sub gets an account on first request and
   `personId` stays `undefined` until onboarding writes the credential onto the
   owner profile (mirrors today's flag-off "account exists, no profile yet"
   pre-onboarding window).

3. **Email is not an identity key in V1.** "Two providers / two emails, same
   identity" is satisfied because resolution keys on `sub` (one Clerk user = one
   `sub` regardless of how many emails/OAuth connections it holds). The
   `findOrCreateAccount` email-reclaim block (`account.ts:165-224`) only fires on
   *new-account creation* when a *different* `sub` reuses an email — that is two
   distinct Clerk users (two persons), correctly still blocked.

4. **Home org reuses `account.id`.** Per the T1 backfill, `organizations.id ===
   accounts.id`. T2's `organizationId` context value = `account.id`. This keeps
   "same account" ≡ "same home org" so the profile-scope authority check for the
   **explicit-header path** (`getProfile(db, profileId, account.id)`) is correct
   in T2 without a membership-join rewrite (that rewrite is T3). Note this only
   validates the *explicit header* case; the headerless default is decision #8.

5. **Proxy-guard fix for `learn-1` (D6).** Flag-on, `assertNotProxyMode`
   authorizes the active profile's **self-write to its own learning data** when
   its membership in the home org includes the `student` role — regardless of
   `isOwner`. This is the product's core loop (a managed child studies on a shared
   device; a credentialed child studies on their own login). Genuine proxy
   (mentor acting *as* a mentee — `learn-2`) stays a T3 concern; the client
   `X-Proxy-Mode: true` read-only switch still tightens. Owner-only routes are
   **independently** gated by `assertOwnerProfile`/`assertOwnerAndParentAccess`
   (not by `assertNotProxyMode`) — T2.6 verifies this across all **89 route call
   sites (23 files) + the global call in `metering.ts:549`** so loosening the
   guard cannot open billing. The fail-closed branch (403 when `activeRoles` is
   empty) is reachable from `metering.ts:549` on a metered route where a profile
   resolved but had no membership row (e.g. created during flag-off); to avoid a
   spurious 403 on a previously-working route, `resolveActiveMembershipRoles`
   **self-heals** a missing membership (decision in T2.3/§Code) so `activeRoles`
   is non-empty whenever a real profile resolves — fail-closed then fires only
   when there is genuinely no profile.

6. **One table for both flows.** `organization_invitations` carries
   `kind ∈ {'invite','claim'}`:
   - `invite` (flow #1): attach an *existing or newly-provisioned credentialed*
     person to the org with `invited_roles` via a new membership. Never creates a
     parallel managed duplicate (design rule that keeps D5 out of scope).
   - `claim` (flow #2): graduate a specific *managed* person — set its
     `clerk_user_id` to the redeemer's `sub`, preserving all history (same
     `profiles.id`). `target_profile_id` is set only for `kind='claim'`.

7. **Provision-exemption — consumed by BOTH account middlewares.** The
   graduation redeem endpoint must NOT trigger account/person provisioning (that
   would create the duplicate it exists to avoid), and it runs for a sub with no
   account yet. The global chain is `accountMiddleware → requireAccountMiddleware
   → profileScopeMiddleware` (all `api.use('*')`, index.ts:225-233).
   **`requireAccountMiddleware` (account.ts:110-133) returns 401 whenever `user`
   is set but `account` is not** — so exempting only `accountMiddleware` leaves
   the redeem path 401'd before the route. Therefore a single exported
   `ACCOUNT_PROVISION_EXEMPT_PATHS = new Set(['/invitations/claims/redeem'])` is
   consulted by **both**: `accountMiddleware` skips provisioning, and
   `requireAccountMiddleware` skips its 401, on these paths. `profileScopeMiddleware`
   already no-ops cleanly with no account (headerless path guards on `db &&
   account`, profile-scope.ts:116) and `meteringMiddleware` early-returns for the
   non-LLM redeem route (metering.ts:515), so the redeem handler operates on the
   verified `sub` (`user.userId`) alone. Invite-accept is **not** exempt — the
   accepter is provisioned their own home org-of-one, then the accept endpoint
   adds a *second* membership into the inviting org.

8. **Headerless active profile = the logged-in person, not the account owner
   (`HIGH-1` fix).** Flag-on, the headerless auto-resolve in `profileScopeMiddleware`
   must set `profileId = c.get('personId')` (the profile whose `clerk_user_id`
   matched the sub) — **not** `findOwnerProfile(account.id)`. For a graduated
   child, `account_id` points at the parent, so `findOwnerProfile(account.id)`
   returns the *parent's* owner profile; with the legacy logic the child's
   headerless writes would resolve and authorize against the **parent's** learning
   data. Keying the default on `personId` makes a logged-in person's own profile
   the default scope. For an account owner, `personId` === the owner profile, so
   behavior is unchanged. When `personId` is `undefined` (brand-new sub
   mid-onboarding, decision #2), fall through with no profile — identical to
   today's flag-off pre-onboarding window. The explicit-header path is unchanged
   (decision #4) and still rejects a parent header-proxying into a credentialed
   teen whose profile lives in a different account (correct — cross-org
   *visibility* is T3 read-scoping, never header proxy).

## Surface map (file → responsibility)

| File | New/Changed | Responsibility |
|---|---|---|
| `config.ts` | changed | flag + `isIdentityV1Enabled` |
| `services/identity.ts` | new | `resolvePersonByClerkId`, `ensureIdentityV1`, `resolveActiveMembershipRoles` |
| `services/invitation.ts` | new | `createInvitation`, `acceptInvitation`, `createClaim`, `redeemClaim` |
| `routes/invitations.ts` | new | 4 routes (create invite, accept, create claim, redeem) |
| `middleware/account.ts` | changed | flag-on person-first resolution + `ACCOUNT_PROVISION_EXEMPT_PATHS` (exported); `findAccountById` helper; **`requireAccountMiddleware` consults the same exempt set** (CRITICAL-1); sets `account`, `personId`, `organizationId` |
| `middleware/profile-scope.ts` | changed | flag-on: headerless `profileId = personId` (HIGH-1); set `activeRoles` for the active profile |
| `middleware/proxy-guard.ts` | changed | flag-on: student-role self-write authorization |
| `services/profile.ts` | changed | `createProfileWithLimitCheck` (flag-on): sets `clerk_user_id` on the first/owner profile, inserts the new profile's membership inside the txn |
| `schema/profiles.ts` | changed | export `type MembershipRole` (MEDIUM-1) |
| `index.ts` | changed | register invitations route; extend `Variables` type (`personId`, `organizationId`, `activeRoles`) |
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

- [ ] **T2.2 — `organization_invitations` schema + migration + `MembershipRole`
  type.** (a) **Export the role union type** (MEDIUM-1): no `MembershipRole` TS
  type exists today (only the runtime `membershipRoleEnum` pgEnum). Add
  `export type MembershipRole = (typeof membershipRoleEnum.enumValues)[number];`
  to `packages/database/src/schema/profiles.ts` (the project idiom — see
  `dictationModeEnum` usage at `repository.ts:849`) and re-export it from the
  barrel `packages/database/src/index.ts`. Every §Code import of
  `type MembershipRole from '@eduagent/database'` depends on this. (b) Add the
  table in a new `packages/database/src/schema/invitations.ts` (exact shape in
  §Schema below — note the `'../utils/uuid'` import path), export it from
  `packages/database/src/schema/index.ts`, run `pnpm run db:generate:dev` to
  produce `0107_identity_t2_invitations.sql` (CREATE TABLE only — no DROP), and
  apply with `pnpm run db:migrate:dev`.
  *Done when:* `pnpm exec tsc --noEmit` inside `packages/database` resolves
  `MembershipRole`; a co-located `schema/invitations.test.ts` asserts the columns,
  the `kind`/`status` CHECKs, the `invited_roles` non-empty CHECK, the unique
  `token_hash`, and the two FKs (`organization_id`, `target_profile_id`); the
  generated migration contains only additive DDL; `db:migrate:dev` applies clean
  on a fresh dev DB; `drizzle-meta-coverage.test.ts` passes.

- [ ] **T2.3 — Identity service.** Create `services/identity.ts` with the three
  functions in §Code (`resolvePersonByClerkId`, `ensureIdentityV1`,
  `resolveActiveMembershipRoles`). `ensureIdentityV1` is idempotent and
  short-circuits when `organizations WHERE id = account.id` already exists (it
  is the *org-creation* heal, used at provisioning). **`resolveActiveMembershipRoles`
  self-heals per-profile** (MEDIUM-3): if no membership row exists for
  `(profileId, organizationId)`, it inserts a default membership derived from the
  profile's `is_owner` (`{owner, student}` if owner else `{student}`; `+ mentor`
  if the profile is a `parent_profile_id` in `family_links`), `logger.warn`s
  `membership.self_heal` (queryable, per the no-silent-recovery ethos), then
  returns those roles. This guarantees `activeRoles` is non-empty for any real
  profile — including profiles created during flag-off that `ensureIdentityV1`'s
  org-existence short-circuit would otherwise skip — so the proxy-guard
  fail-closed (T2.6) fires only when there is genuinely no profile.
  *Done when:* `services/identity.integration.test.ts` (DB-backed, `describeIfDb`)
  proves: (a) `resolvePersonByClerkId` returns the profile whose
  `clerk_user_id` matches and `null` otherwise; (b) `ensureIdentityV1` on a fresh
  account creates exactly one org (`id = account.id`), copies `clerk_user_id` to
  the owner profile, and creates one `{owner,student}` (+`mentor` if the owner is
  a parent in `family_links`) membership, and is a **no-op on second call**;
  (c) `resolveActiveMembershipRoles` returns the existing role array when a
  membership exists; (d) **self-heal:** for a profile with *no* membership row it
  inserts and returns `{student}` (non-owner) / `{owner,student}` (owner) and a
  second call is a no-op (idempotent).

- [ ] **T2.4 — Account middleware V1 branch + provision-exempt chain
  (CRITICAL-1).** In `account.ts`, when `isIdentityV1Enabled`, replace the
  `findOrCreateAccount(sub)` path with person-first resolution (§Code): resolve
  `person` by `sub`; **if found** → set `account` via a new thin
  `findAccountById(db, person.accountId)` helper, set `personId` + `organizationId`
  (`= account.id`), call `ensureIdentityV1(db, account)` (cheap org-exists
  short-circuit); **if not found and the path is provision-exempt** → set nothing
  and `next()`; **if not found and not exempt** → `findOrCreateAccount(sub,email)`
  for the *account only* (billing + trial, exactly as flag-off), set `account` +
  `organizationId`, leave `personId` undefined (the owner profile + its
  `clerk_user_id` + membership are written later by onboarding T2.7 — decision
  #2; do **not** create a profile here, it would race `POST /profiles`). Add and
  **export** `ACCOUNT_PROVISION_EXEMPT_PATHS = new Set(['/invitations/claims/redeem'])`.
  **`requireAccountMiddleware` must consult the same set** (CRITICAL-1): flag-on,
  when `user` is set but `account` is not, skip the 401 if the request path is in
  `ACCOUNT_PROVISION_EXEMPT_PATHS` (else its existing 401 makes the redeem route
  unreachable). Flag-off path of both middlewares is untouched. Extend
  `AccountEnv.Variables` and `index.ts` `Variables` with `personId: string |
  undefined` and `organizationId: string | undefined`.
  *Done when:* `account.test.ts` adds flag-on cases proving: (a) a `sub` already
  on a `profiles.clerk_user_id` resolves `account = profile.account_id` **without
  calling `findOrCreateAccount`** (graduated-kid fixture whose `account.clerk_user_id
  !== sub`); (b) a brand-new `sub` on a non-exempt path creates the account +
  trial and leaves `personId` undefined (no profile created); (c) **the full
  chain test**: a brand-new `sub` `POST /invitations/claims/redeem` passes
  **both** `accountMiddleware` and `requireAccountMiddleware` with `account`
  unset and reaches the handler (this is the regression for CRITICAL-1 and is the
  same assertion T2.9 references); (d) the flag-off path is byte-identical
  (existing `account.test.ts` cases stay green unchanged).

- [ ] **T2.5 — Profile-scope V1 branch (incl. HIGH-1 headerless fix).** In
  `profile-scope.ts`, flag-on:
  - **Headerless path (HIGH-1):** set `profileId = c.get('personId')` — the
    logged-in person's own profile — **not** `findOwnerProfile(account.id)`
    (which returns the *parent* for a graduated child, mis-scoping the child's
    writes onto parent data; see decision #8). Load that profile row for
    `profileMeta`. If `personId` is undefined (brand-new sub mid-onboarding), fall
    through with no profile (same as flag-off no-owner). Do **not** call
    `findOwnerProfile` flag-on.
  - **Explicit-header path:** unchanged ownership check `getProfile(db,
    profileIdHeader, account.id)` (correct because home `organization_id ===
    account.id` — decision #4).
  - Both paths, after a profile is resolved: set `c.set('activeRoles',
    roles)` via `resolveActiveMembershipRoles(db, resolvedProfileId,
    c.get('organizationId'))` (self-healing — T2.3).
  Add `activeRoles: MembershipRole[] | undefined` to `ProfileScopeEnv.Variables`
  and the `index.ts` `Variables` type.
  *Done when:* `profile-scope.test.ts` adds flag-on cases: (a) auto-resolved
  **owner** (no header) → `profileId === personId` (the owner) with `activeRoles`
  ⊇ `{owner, student}`; (b) **graduated credentialed child, no header** (the
  HIGH-1 regression — `account_id` points at the parent) → `profileId ===
  personId` (the *child's* own profile, **not** the parent owner) with
  `activeRoles` ⊇ `{student}`, and a write resolves to the child's own rows; (c)
  explicit `X-Profile-Id` for a managed child (parent session) → `activeRoles` ⊇
  `{student}`; (d) flag-off leaves `activeRoles` undefined and all existing cases
  stay green.

- [ ] **T2.6 — Proxy-guard self-write fix (`learn-1`).** In `proxy-guard.ts`,
  branch `assertNotProxyMode` on the flag (§Code): flag-on, allow the write when
  `c.get('activeRoles')` includes `'student'` (still rejecting an explicit
  `X-Proxy-Mode: true`), and fail closed (403) when `activeRoles` is
  absent/empty; flag-off keeps the exact `isOwner === false` logic.
  **Before loosening, audit owner-only mutations across the *real* call-site set
  (HIGH-2):** the guard is invoked **89 times across 23 route files** plus the
  global call in `metering.ts:549` — **not 34**. Enumerate, per file, the calls
  that guard an **owner-only mutation** (the dense files are `sessions.ts` ×17,
  `settings.ts` ×8, `billing.ts` ×7, `subjects.ts` ×6, `curriculum.ts`/`quiz.ts`/
  `retention.ts` ×5 each, `learner-profile.ts`/`notes.ts` ×4) and confirm each
  such site **also** calls `assertOwnerProfile` / `assertOwnerAndParentAccess`.
  Spot-check flagged by review: `billing.ts:198` calls `assertNotProxyMode` while
  the next `assertOwnerProfile` is not until `:296` — confirm they are the **same
  handler** (and add the owner guard if not). If any owner-only site relies on
  `assertNotProxyMode` alone, add the owner guard in this task.
  *Done when:* the `learn-1` regression test in `proxy-guard.test.ts`
  (`child runs own session — write authorized under V1`) seeds a non-owner
  student-role active profile and asserts a write **passes** flag-on but is
  **403** flag-off (red-green: this is the exact behavior change); a second test
  asserts `X-Proxy-Mode: true` still 403s flag-on; a third asserts absent
  `activeRoles` → 403 flag-on (fail-closed); and the owner-only-mutation audit is
  recorded in the commit message as a **per-site table** (file:line of each
  owner-only `assertNotProxyMode` call → its paired owner-guard file:line), not a
  raw count.

- [ ] **T2.7 — Owner credential + membership on creation (MEDIUM-2 txn
  ordering).** In `createProfileWithLimitCheck` (`profile.ts`), when
  `isIdentityV1Enabled` (pass the resolved boolean in `opts`, mirroring
  `adultOwnerGateEnabled`; plumb from `routes/profiles.ts` via
  `c.env?.MODE_IDENTITY_V1_ENABLED`):
  - **Owner credential:** when `isFirstProfile`, thread the caller's `sub`
    (`user.userId`, new optional `opts.clerkUserId`) into `createProfile` so the
    owner profile is created with `clerk_user_id = sub`. Non-first (managed child)
    profiles keep `clerk_user_id = null`.
  - **Membership — exact handle + ordering:** all new work uses **`txDb`** (the
    `tx as unknown as Database` cast at `profile.ts:447`), **never the outer
    `db`** (the outer handle would open a separate transaction outside the
    per-account `pg_advisory_xact_lock` at `:451` — a concurrency hole). The
    sequence runs **after** `createProfile` returns at `:526` (the owner profile
    must exist before its credential can be copied / its membership created):
    (1) `await ensureIdentityV1(txDb, account)` — guarantees the org row exists
    (for the first-profile case) and is a no-op short-circuit when it already
    does; (2) explicit `INSERT` of the **created profile's** membership into the
    home org (`organization_id === account.id`) with roles `{owner, student}` when
    `created.isOwner` else `{student}`, `ON CONFLICT (person_id, organization_id)
    DO NOTHING` (the non-first child is **not** covered by `ensureIdentityV1`'s
    org-existence short-circuit, so it must be inserted here explicitly). The
    membership therefore commits/rolls back atomically with the profile row.
  *Done when:* `profile.integration.test.ts` (DB-backed) proves flag-on: creating
  the first profile yields `clerk_user_id` set on the owner + an `{owner,student}`
  membership in the home org; creating a second profile yields `clerk_user_id ===
  null` + a `{student}` membership in the **same** org; a forced failure after the
  profile `INSERT` but before commit rolls back **both** the profile and its
  membership (atomicity); flag-off creates no membership and sets no
  `clerk_user_id` (existing cases stay green).

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
  chain. Confirm the redeem path string in `ACCOUNT_PROVISION_EXEMPT_PATHS`
  **exactly matches** what `new URL(c.req.url).pathname` yields for the mounted
  route (no `basePath` — the API is a flat Hono instance, index.ts:145 — so the
  pathname is `/invitations/claims/redeem`).
  *Done when:* `routes/invitations.test.ts` proves each route's authz (create
  endpoints 403 for non-owners) and the happy path for invite-accept and
  claim-redeem returns 200 with the expected membership/credential side effects
  asserted via DB read; **and a full-chain reachability test** drives a brand-new
  `sub` (no profile, no account) through the mounted middleware stack to
  `POST /invitations/claims/redeem` and asserts it reaches the handler (proves the
  request survives both `accountMiddleware` *and* `requireAccountMiddleware` with
  `account` unset — the CRITICAL-1 regression; shares the T2.4(c) assertion).

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
import { generateUUIDv7 } from '../utils/uuid'; // exact path used by schema/profiles.ts:16 (LOW-1)
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

/**
 * Self-healing (MEDIUM-3): if the active profile has no membership in this org
 * (e.g. it was created during flag-off, which ensureIdentityV1's org-existence
 * short-circuit would skip), insert a default membership derived from is_owner so
 * activeRoles is never spuriously empty → the proxy-guard fail-closed (T2.6) only
 * fires when there is genuinely no profile. Logged for queryability.
 */
export async function resolveActiveMembershipRoles(
  db: Database, profileId: string, organizationId: string,
): Promise<MembershipRole[]> {
  const row = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.personId, profileId),
      eq(memberships.organizationId, organizationId),
    ),
  });
  if (row) return row.roles;

  // No membership — self-heal. Derive roles from the profile's is_owner (+ mentor
  // if it is a parent in family_links). Insert ON CONFLICT DO NOTHING and re-read.
  const profile = await db.query.profiles.findFirst({ where: eq(profiles.id, profileId) });
  if (!profile) return []; // genuinely no profile → caller (proxy-guard) fails closed
  const roles: MembershipRole[] = profile.isOwner ? ['owner', 'student'] : ['student'];
  // (+ 'mentor' if profile.id appears as parent_profile_id in family_links)
  logger.warn('membership.self_heal', { profileId, organizationId, roles });
  await db.insert(memberships)
    .values({ personId: profileId, organizationId, roles })
    .onConflictDoNothing({ target: [memberships.personId, memberships.organizationId] });
  return roles;
}
```

```ts
// middleware/account.ts — flag-on branch (flag-off path unchanged).
// Exported so requireAccountMiddleware consults the SAME set (CRITICAL-1).
export const ACCOUNT_PROVISION_EXEMPT_PATHS = new Set(['/invitations/claims/redeem']);

if (isIdentityV1Enabled(c.env?.MODE_IDENTITY_V1_ENABLED)) {
  const person = await resolvePersonByClerkId(db, user.userId);
  if (person) {
    const acct = await findAccountById(db, person.accountId); // new thin helper in account.ts
    await ensureIdentityV1(db, acct);                         // cheap org-exists short-circuit
    c.set('account', acct);
    c.set('personId', person.id);
    c.set('organizationId', acct.id); // home org === account.id (decision #4)
    return next();
  }
  if (ACCOUNT_PROVISION_EXEMPT_PATHS.has(new URL(c.req.url).pathname)) {
    return next(); // redeem operates on user.userId alone; no provisioning, no account
  }
  // Genuinely new credentialed sub: provision the ACCOUNT only (billing + trial),
  // exactly as flag-off. Do NOT create the owner profile here — that races the
  // POST /profiles first-profile path (decision #2). personId stays undefined
  // until onboarding (T2.7) writes clerk_user_id onto the owner profile.
  const acct = await findOrCreateAccount(db, user.userId, verifiedEmail.email);
  c.set('account', acct);
  c.set('organizationId', acct.id);
  // personId intentionally left unset (no profile yet)
  return next();
}
// ...existing flag-off findOrCreateAccount path below, untouched...
```

```ts
// middleware/account.ts — requireAccountMiddleware must skip its 401 on exempt
// paths flag-on, else the redeem route is unreachable (CRITICAL-1).
// Inside requireAccountMiddleware, replacing the bare `if (!account)` 401:
if (!account) {
  if (
    isIdentityV1Enabled(c.env?.MODE_IDENTITY_V1_ENABLED) &&
    ACCOUNT_PROVISION_EXEMPT_PATHS.has(new URL(c.req.url).pathname)
  ) {
    return next(); // graduating sub: no account yet, by design
  }
  return c.json({ code: ERROR_CODES.UNAUTHORIZED, message: /* unchanged */ '' }, 401);
}
```

```ts
// middleware/profile-scope.ts — flag-on headerless branch (HIGH-1)
// Replaces the findOwnerProfile(account.id) auto-resolve when flag-on:
if (!profileIdHeader && isIdentityV1Enabled(c.env?.MODE_IDENTITY_V1_ENABLED)) {
  const personId = c.get('personId');
  if (personId) {
    const self = await getProfile(db, personId, c.get('account').id); // own profile
    if (self) {
      c.set('profileId', self.id);
      c.set('profileMeta', { /* birthYear, location, consentStatus, hasPremiumLlm, conversationLanguage, isOwner */ });
      c.set('activeRoles', await resolveActiveMembershipRoles(db, self.id, c.get('organizationId')));
    }
  }
  await next();
  return; // never calls findOwnerProfile flag-on
}
// ...flag-off headerless path (findOwnerProfile) + explicit-header path below, the
// latter additionally sets activeRoles after the unchanged getProfile ownership check...
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
  owner-only route relied on the guard alone. T2.6 audits the **real** call-site
  set — **89 invocations across 23 route files + the global call at
  `metering.ts:549`** (not 34) — and confirms `assertOwnerProfile` /
  `assertOwnerAndParentAccess` independently gates every owner-only mutation,
  recorded as a per-site table, before the loosening ships. The flag (default
  off) contains any miss to dev/staging.
- **Headerless mis-scoping (HIGH-1).** Keying the headerless default on
  `findOwnerProfile(account.id)` instead of `personId` would route a graduated
  child's writes onto the parent's data. Mitigation: decision #8 + the T2.5(b)
  regression (graduated child, no header, write lands on own rows).
- **Unreachable redeem path (CRITICAL-1).** `requireAccountMiddleware` would 401
  the provision-exempt path. Mitigation: both account middlewares consult the
  exported `ACCOUNT_PROVISION_EXEMPT_PATHS`; the T2.4(c)/T2.9 full-chain test is
  the regression.
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
