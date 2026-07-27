# S-06 RLS — Phase 2-4: Enforcement (Post-Launch Sprint 2+)

> **⏸️ PARKED (2026-06-27) — do not resume Phase 3 until the `profiles`→`person` physical rename lands.**
>
> Phase 3 (the enforcement cutover) is deliberately parked, not abandoned. The reason it is parked rather than scheduled:
>
> **Premises this park stands on (all must still hold to keep it parked):**
> 1. **App-layer scoping is the live, sufficient control.** Row isolation is enforced today by `createScopedRepository(profileId)` + the parent-chain `WHERE profileId = …` pattern (the AGENTS.md data-access rules). RLS is *defense-in-depth* — a second wall behind that one — not the only wall. With the app-layer wall intact, the missing DB wall is a hardening gap, not a live leak.
> 2. **Pre-launch, no real users / no production learner data at risk.** There is no live cross-tenant data to leak while RLS sits inert (see memory `project_pre_launch_no_users`).
> 3. **The `profiles`→`person` rename (MMT-ADR-0012) would invalidate the Phase 3 work if done first.** Every RLS policy in migration `0085` keys on the `profile_id` column (`USING (profile_id = current_setting('app.current_profile_id')::uuid)`). The physical rename changes the very table/column these policies reference, so enforcing RLS *before* the rename means authoring policies against names that are about to change — wasted work and a guaranteed re-migration. **Phase 3 must be sequenced AFTER the rename**, against the final `person`/`person_id` names.
>
> **Revisit trigger:** when the `profiles`→`person` physical rename (MMT-ADR-0012) is in place. At that point, re-scope Phase 3 against the renamed schema before doing the role/middleware wiring below.
>
> **Privacy-spec reconciliation (WI-517, 2026-06-29):** the §5 `parent_read_via_family` parent-access policies originally specified in `docs/_archive/specs/Done/2026-04-18-parent-visibility-privacy-design.md` (additive SELECT on child-data tables for a linked parent) are the "parent-read policies via `family_links` missing from migration `0085`" noted in the status log below — **never migrated**, now **withdrawn from that spec** and tracked here as part of this parked Phase 2/3 work. (Migration `0085` already ships a combined `family_links_profile_isolation` policy, covering that spec's §4 `family_links` reads in one parent-OR-child policy.) App-layer `assertParentAccess` + `createScopedRepository` is the accepted live guard until this plan resumes.
>
> **What "inert" concretely means (verified 2026-06-27, two independent dead layers):** (a) the app connects as `neondb_owner`, which holds `BYPASSRLS`, so policies never apply (`packages/database/src/client.ts:103`, comment at `0085_bug216_rls_policies_sweep.sql:6-9`); no `app_user`/`DATABASE_URL_APP` role split exists. (b) `withProfileScope` (`packages/database/src/rls.ts:44`), which sets the `app.current_profile_id` session var the policies read, is called in exactly ONE place (`apps/api/src/services/quiz/queries.ts:170`) — middleware never wraps requests with it, so the session var is NULL and policies fail-closed everywhere else. Fixing one layer alone changes nothing.

> **STATUS (2026-06-27) [superseded by PARKED banner above]:** Phase 2 (RLS policies authored) + Phase 4.1 landed, but the policies are INERT — Phase 3 (the enforcement cutover wiring `withProfileScope`) never landed, so row-level security is NOT actually enforced at runtime. Do not assume RLS isolation from this doc.

> **Status (2026-05-25):** Unchanged since 2026-05-23 — Phase 2 policies shipped but **inert** (the API still connects as DB owner, which bypasses RLS). Phase 3 has not started: `withProfileScope` signature in `packages/database/src/rls.ts:46-66` lacks `accountId`, no `DATABASE_URL_APP` exists, no dual `ownerDb`/`appDb` connection in `client.ts`, no `app.current_account_id` setter. Parent-read policies via `family_links` also missing from migration `0085`. **Resume here:** Phase 3.1 — add `DATABASE_URL_APP` (non-owner role) + dual-connection in `client.ts`, then extend `withProfileScope` to accept `accountId`. Until that lands, the shipped policies provide no protection.

> **Status (2026-05-23):** Phase 2 ✅ — RLS policies shipped via migration `0085_bug216_rls_policies_sweep.sql` (37 tables, expanded from original 26-table scope). Phase 3 ❌ NOT STARTED — `withProfileScope` is implemented in `packages/database/src/rls.ts` but with signature `(db, profileId, fn)` (no `accountId`); no `DATABASE_URL_APP` dual-connection. Phase 4 ❌ NOT STARTED — no audit/refactor of `db.query.*` calls in billing/Inngest performed.

> **Parent finding:** `docs/_archive/plans/bug-fix-plan HR.md` → S-06
> **Prerequisite:** `docs/_archive/plans/done/2026-04-15-S06-rls-phase-0-1-preparatory.md` must be complete and deployed
> **Created:** 2026-04-15
> **Risk:** HIGH — Phase 3 enforces RLS. Incorrect policies = data invisible to users or background jobs failing.
> **Estimated effort:** 3 days
> **Branch:** create from `main` after Phase 0+1 is merged

---

## Goal

Enforce row-level security so that even if application-layer scoping has a bug, the database itself prevents cross-tenant data access. After this plan:
- All 26 tables have restrictive RLS policies
- The app connects as `app_user` (not owner) for request-scoped operations
- Inngest/cron jobs connect as owner (cross-profile access by design)
- Billing service is audited and either scoped or explicitly owner-roled
- `vocabulary` + `vocabularyRetentionCards` added to `createScopedRepository`

---

## Pre-Conditions (Verify Before Starting)

| Condition | How to verify |
|---|---|
| **Phase 0.0 complete — real transactions exist on the client used by `withProfileScope`** | `drizzle-orm` has been upgraded to a version that implements `neon-http` transactions, OR a `neon-serverless` (WS) client has been added (Option B/C). See preparatory plan Phase 0.0. Without this, `SET LOCAL` inside `withProfileScope` is a no-op and RLS is unreachable. |
| Phase 0 complete — transaction fallback removed | `client.ts` has no catch block swallowing transaction errors for the client used by `withProfileScope` |
| Phase 0 complete — `withProfileScope()` exists and tested | `packages/database/src/rls.ts` exists, integration test passes — including a test that proves `SET LOCAL` inside the transaction is visible to a subsequent `SELECT` in the same transaction |
| Phase 1 complete — RLS enabled on all 26 tables | `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` — all true |
| Phase 1 complete — `app_user` role exists | `SELECT rolname FROM pg_roles WHERE rolname = 'app_user'` |
| Full API test suite green | `pnpm exec nx run api:test` |

---

## Phase 2: Create Restrictive Policies

### Migration `0026`

**File:** `apps/api/drizzle/0026_rls_policies.sql`

#### Standard profile-scoped tables (17 tables)

Apply identical policy to: `assessments`, `retention_cards`, `needs_deepening_topics`, `teaching_preferences`, `subjects`, `curriculum_adaptations`, `learning_sessions`, `session_events`, `session_summaries`, `parking_lot_items`, `onboarding_drafts`, `streaks`, `xp_ledger`, `notification_preferences`, `notification_log`, `learning_modes`, `coaching_card_cache`, `vocabulary`, `vocabulary_retention_cards`, `session_embeddings`.

> Note: 20 tables, not 17 — `vocabulary`, `vocabulary_retention_cards`, `session_embeddings` were previously listed separately but take the same standard policy.

```sql
-- Template (repeat for each table):
CREATE POLICY profile_isolation ON assessments
  FOR ALL
  TO app_user
  USING (profile_id = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK (profile_id = current_setting('app.current_profile_id', true)::uuid);
```

#### Special-case tables

**`family_links`** — separate read policies for parent and child roles:
```sql
-- Parent reads their own family links
CREATE POLICY family_parent_access ON family_links
  FOR SELECT TO app_user
  USING (
    parent_profile_id = current_setting('app.current_profile_id', true)::uuid
  );

-- Child reads links where they are the child (consent UI)
CREATE POLICY family_child_access ON family_links
  FOR SELECT TO app_user
  USING (
    child_profile_id = current_setting('app.current_profile_id', true)::uuid
  );

-- No INSERT/UPDATE/DELETE via app_user — consent service uses ownerDb
```

**Parent read access via `family_links`** — additive policies (OR'd with `profile_isolation`).
Applied to all tables the parent dashboard reads through `getChildrenForParent`, `getChildSessions`,
`getChildSessionDetail`, `getChildInventory`, `getChildProgressHistory`, and `getChildSubjectTopics`:

| Table | Read via | Policy |
|---|---|---|
| `learning_sessions` | `getChildSessions`, `getChildSessionDetail` | `parent_read_via_family` |
| `session_summaries` | `getChildSessions` (joined after companion plan lands) | `parent_read_via_family` |
| `progress_snapshots` | `getChildProgressHistory` → `snapshot-aggregation.ts` | `parent_read_via_family` |
| `milestones` | `snapshot-aggregation.ts`, progress routes | `parent_read_via_family` |
| `streaks` | `getChildrenForParent` | `parent_read_via_family` |
| `xp_ledger` | `getChildrenForParent`, `progress.ts` | `parent_read_via_family` |
| `vocabulary` | `getChildInventory` → `snapshot-aggregation.ts` | `parent_read_via_family` |
| `vocabulary_retention_cards` | `getChildInventory` → `snapshot-aggregation.ts` | `parent_read_via_family` |
| `retention_cards` | `getChildInventory` → `snapshot-aggregation.ts` | `parent_read_via_family` |
| `assessments` | `getChildInventory` → `snapshot-aggregation.ts`, `progress.ts` | `parent_read_via_family` |
| `subjects` | `getChildSubjectTopics` + most inventory paths | `parent_read_via_family` |
| `curricula` | `getChildSubjectTopics` | `parent_read_via_family` |
| `curriculum_topics` | `getChildSubjectTopics` | `parent_read_via_family` |
| `profiles` | `getChildrenForParent` joins for `displayName` | covered by `profile_own_or_child` above |
| `needs_deepening_topics` | `progress.ts` | `parent_read_via_family` |

**Explicitly excluded (privacy boundary):**
- `session_events` — raw transcripts; parent endpoint removed in [PV-S1]
- `session_embeddings` — internal vector data
- `parking_lot_items` — child's private queue
- `coaching_card_cache` — child-facing display
- `notification_preferences`, `notification_log` — child's settings/history
- `learning_modes`, `teaching_preferences`, `curriculum_adaptations` — internal pedagogy

```sql
-- Template applied to each verified parent-read table:
CREATE POLICY parent_read_via_family ON <table_name>
  FOR SELECT TO app_user
  USING (
    profile_id IN (
      SELECT child_profile_id FROM family_links
      WHERE parent_profile_id = current_setting('app.current_profile_id', true)::uuid
    )
  );

-- Performance index for the subquery
CREATE INDEX IF NOT EXISTS family_links_parent_profile_id_idx
  ON family_links (parent_profile_id);
```

**`consent_states`** — parents access children's consent via family link:
```sql
CREATE POLICY consent_own_or_child ON consent_states
  FOR ALL TO app_user
  USING (
    profile_id = current_setting('app.current_profile_id', true)::uuid
    OR profile_id IN (
      SELECT child_profile_id FROM family_links
      WHERE parent_profile_id = current_setting('app.current_profile_id', true)::uuid
    )
  )
  WITH CHECK (
    profile_id = current_setting('app.current_profile_id', true)::uuid
    OR profile_id IN (
      SELECT child_profile_id FROM family_links
      WHERE parent_profile_id = current_setting('app.current_profile_id', true)::uuid
    )
  );
```

**`profiles`** — own profile + linked children:
```sql
CREATE POLICY profile_own_or_child ON profiles
  FOR SELECT TO app_user
  USING (
    id = current_setting('app.current_profile_id', true)::uuid
    OR id IN (
      SELECT child_profile_id FROM family_links
      WHERE parent_profile_id = current_setting('app.current_profile_id', true)::uuid
    )
  );

-- Writes: own profile only
CREATE POLICY profile_write_own ON profiles
  FOR INSERT TO app_user
  WITH CHECK (id = current_setting('app.current_profile_id', true)::uuid);

CREATE POLICY profile_update_own ON profiles
  FOR UPDATE TO app_user
  USING (id = current_setting('app.current_profile_id', true)::uuid)
  WITH CHECK (id = current_setting('app.current_profile_id', true)::uuid);
```

**Account-scoped tables** (`subscriptions`, `quota_pools`, `top_up_credits`):
```sql
-- These use a separate session variable: app.current_account_id
CREATE POLICY account_isolation ON subscriptions
  FOR ALL TO app_user
  USING (account_id = current_setting('app.current_account_id', true)::uuid)
  WITH CHECK (account_id = current_setting('app.current_account_id', true)::uuid);

-- quota_pools and top_up_credits are keyed by subscription_id
-- Option A: join through subscriptions
-- Option B: set app.current_subscription_id in middleware
-- Decision needed at implementation time — depends on billing service audit (Phase 4)
```

#### Fail-closed behavior

`current_setting('app.current_profile_id', true)` returns `NULL` when the setting is unset. `NULL::uuid` compared with `=` always yields `false`. Result: **unset context → zero rows returned** (fail-closed, not fail-open). This is the correct default.

### Validation

| Check | Method |
|---|---|
| Policies created | `SELECT policyname, tablename FROM pg_policies WHERE roles @> ARRAY['app_user']` |
| No behavior change yet | Full API test suite passes (still connecting as owner) |

---

## Phase 3: Switch Connection Role ⚠️ HIGH RISK

This is the phase that actually enforces RLS. Everything before this is inert.

### 3.1 — Create `app_user` login role in Neon

In the Neon console (or via SQL as superuser):
```sql
CREATE ROLE app_user_login LOGIN PASSWORD '...' IN ROLE app_user;
```

Store the credentials in **Doppler** as `DATABASE_URL_APP`.

### 3.2 — Update `withProfileScope()` to also set account context

```typescript
export async function withProfileScope<T>(
  db: Database,
  profileId: string,
  accountId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SET LOCAL app.current_profile_id = ${profileId};
      SET LOCAL app.current_account_id = ${accountId};
    `);
    return fn(tx as unknown as Database);
  });
}
```

### 3.3 — Dual database connections in `client.ts`

```typescript
// packages/database/src/client.ts
const ownerDb = drizzle(neon(config.DATABASE_URL));      // migrations, cron, admin
const appDb = drizzle(neon(config.DATABASE_URL_APP));     // request-scoped
```

Export both. The Hono app uses `appDb` for request handlers.

### 3.4 — Integrate into Hono middleware

After JWT auth extracts `profileId` and `accountId`, wrap the request context:

```typescript
// In auth middleware, after token verification:
const scopedDb = await withProfileScope(appDb, profileId, accountId, async (tx) => tx);
c.set('db', scopedDb);
```

> **Design decision needed:** Should every request be wrapped in a single transaction for the entire handler? Or should `withProfileScope` be called per-service-call? The single-transaction approach is simpler but holds the transaction longer. Per-service-call is more granular but requires threading the scoped DB through. Decide at implementation time after benchmarking.

### 3.5 — Update Inngest functions to use `ownerDb`

Cross-profile Inngest functions must use the owner connection:

| Function | File | Cross-profile? | Connection |
|---|---|---|---|
| `sessionStaleCleanup` | `inngest/functions/session-stale-cleanup.ts` | Yes — scans all active sessions | `ownerDb` |
| `consentReminder` | `inngest/functions/consent-reminders.ts` | No — event-driven per profileId | `appDb` with `withProfileScope` |
| `session-completed` | `inngest/functions/session-completed.ts` | No — single profile | `appDb` with `withProfileScope` |
| All other Inngest functions | Various | Audit at implementation time | Decide per function |

> **Correction from original plan:** `consentReminder` is NOT cross-profile. It receives a `profileId` from the event payload and queries only that profile. It can use `appDb` with `withProfileScope`.

### 3.6 — Deploy sequence

1. **Add `DATABASE_URL_APP` to Doppler** for staging
2. Deploy to staging
3. Run full integration test suite against staging
4. Smoke test: verify a real request returns data for the authed user
5. Smoke test: verify cross-profile access returns empty (not error)
6. Monitor for 24h
7. Repeat for production

### Rollback

**Immediate (< 1 minute):** Change `DATABASE_URL_APP` in Doppler to use the owner credentials. RLS policies are instantly bypassed. No code deploy needed.

---

## Phase 4: Audit & Harden

### 4.1 — Add `vocabulary` + `vocabularyRetentionCards` to `createScopedRepository`

**File:** `packages/database/src/repository.ts`

These two entities were confirmed missing. Add them to the scoped repository so application-layer AND database-layer scoping are aligned.

### 4.2 — Audit billing service (BD-10)

**30 `db.query.*` calls across 8 files** (verified 2026-04-15):

| File | Count | Scope |
|---|---|---|
| `billing/family.ts` | 13 | Mixed — some profile, some account |
| `billing/subscription-core.ts` | 5 | Account-scoped |
| `billing/top-up.ts` | 3 | Account-scoped |
| `billing/trial.ts` | 3 | Account-scoped |
| `billing/metering.ts` | 2 | Account-scoped |
| `billing/tier.ts` | 2 | Account-scoped |
| `billing/revenuecat.ts` | 2 | Webhook-initiated (no user context) |

**Decision needed:** Billing is account-scoped, not profile-scoped. Options:
1. Billing uses `app.current_account_id` context (requires `withAccountScope` wrapper)
2. Billing webhook handler uses `ownerDb` (webhooks have no user session)
3. All billing uses `ownerDb` (simplest, but loses defense-in-depth)

Recommend option 1 for user-initiated billing (subscription page) and option 2 for webhook-initiated billing (RevenueCat).

### 4.3 — Integration tests

For each of the 26 protected tables, write or extend integration tests verifying:

| Scenario | Expected |
|---|---|
| Correct `profileId` set | Data returned |
| Wrong `profileId` set | Empty result (not error) |
| No `profileId` set (NULL context) | Empty result (fail-closed) |
| Owner role connection | All data accessible |

### 4.4 — Latency benchmark

Measure the overhead of transaction-wrapped queries vs. direct queries:
- Expected: +5-15ms per request (neon-http batch mode)
- If > 20ms: consider connection pooling or caching strategies
- Run under realistic load (not just unit tests)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Transaction overhead | +5-15ms latency per request | Benchmark in Phase 0 (preparatory plan); neon-http batching is efficient |
| Inngest jobs break | Background jobs return empty data | `sessionStaleCleanup` uses `ownerDb`; audit all others |
| `SET LOCAL` not persisted | RLS silently bypassed | Integration test validates context propagation (Phase 0) |
| Billing breaks under `app_user` | Subscription/quota queries fail | Audit in Phase 4; webhook handler uses `ownerDb` |
| `consent_states` subquery perf | Parent consent lookups slow | Index on `family_links(parent_profile_id)` — likely already exists |
| `current_setting` returns NULL | Fail-closed (empty results) | Correct behavior — defense-in-depth |

---

## Checklist

- [ ] 2.1 — Write migration `0026_rls_policies.sql` (standard + special-case policies)
- [ ] 2.2 — Verify policies exist in Postgres
- [ ] 2.3 — Confirm no behavior change while connecting as owner
- [ ] 3.1 — Create `app_user_login` role in Neon + add to Doppler
- [ ] 3.2 — Update `withProfileScope` to set both profile + account context
- [ ] 3.3 — Dual DB connections in `client.ts`
- [ ] 3.4 — Integrate into Hono middleware
- [ ] 3.5 — Audit + update all Inngest functions
- [ ] 3.6 — Staged deploy: staging → 24h soak → production
- [ ] 4.1 — Add `vocabulary` + `vocabularyRetentionCards` to `createScopedRepository`
- [ ] 4.2 — Audit billing service; decide owner vs. scoped per caller
- [ ] 4.3 — Integration tests for all 26 tables (4 scenarios each)
- [ ] 4.4 — Latency benchmark under load
