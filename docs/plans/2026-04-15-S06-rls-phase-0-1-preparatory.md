# S-06 RLS — Phase 0 + Phase 1: Preparatory (Post-Launch Sprint 1)

> **Parent finding:** `bug-fix-plan HR.md` → S-06
> **Created:** 2026-04-15
> **Risk:** Low — zero production behavior change. Owner role (`neondb_owner`) bypasses RLS.
> **Estimated effort:** 2 days
> **Branch:** create from `main` after stabilization merges

---

## Goal

Lay the groundwork for Row-Level Security without changing any runtime behavior. After this plan:
- Transactions work correctly (no silent atomicity drops)
- A `withProfileScope()` utility exists and is tested
- RLS is enabled on all 21 profile-scoped tables (but not enforced — owner role bypasses)
- An `app_user` Postgres role exists with appropriate grants

**Nothing changes for production traffic.** The app still connects as `neondb_owner`, which bypasses all RLS policies.

---

## Context & Constraints (Verified 2026-04-15)

| Assumption | Status |
|---|---|
| Driver is `neon-http` (stateless HTTP) | ✅ Confirmed — `packages/database/src/client.ts` |
| Transaction fallback silently drops atomicity | ✅ Confirmed — catch block re-invokes callback on base `db`, no rollback |
| `vocabulary` + `vocabularyRetentionCards` missing from `createScopedRepository` | ✅ Confirmed — `packages/database/src/repository.ts` |
| All tables have `isRLSEnabled: false` | ✅ Confirmed — all drizzle meta snapshots |
| Next available migration number | **Corrected:** `0025` (not `0012` as original plan stated; migrations go through `0024`) |

---

## Phase 0: Fix Transaction Support

### Why This Matters

`packages/database/src/client.ts` has a `catch` block that intercepts the `"No transactions support in neon-http driver"` error and re-runs the callback directly on `db` — **without atomicity or rollback**. Every `db.transaction()` call in the codebase silently runs as individual statements. This must be fixed before RLS can work (RLS requires `SET LOCAL` inside a real transaction).

### Tasks

#### 0.1 — Verify neon-http transaction support

The `@neondatabase/serverless` HTTP driver **does** support transactions via batch mode. Drizzle's neon-http adapter wraps this. The current fallback may be a relic from an older driver version.

**Action:** Remove the try/catch fallback in `client.ts`. If the driver throws, we want to know — silent non-atomicity is worse than a crash.

**File:** `packages/database/src/client.ts`

#### 0.2 — Create `withProfileScope()` utility

```typescript
// packages/database/src/rls.ts
import { sql } from 'drizzle-orm';
import type { Database } from './client';

export async function withProfileScope<T>(
  db: Database,
  profileId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SET LOCAL app.current_profile_id = ${profileId}`,
    );
    return fn(tx as unknown as Database);
  });
}
```

**Export from** `packages/database/src/index.ts` barrel.

#### 0.3 — Integration test for context propagation

Write a test in `apps/api/tests/integration/` that:
- Calls `withProfileScope(db, testProfileId, async (tx) => { ... })`
- Inside the callback: `SELECT current_setting('app.current_profile_id', true)` — assert it equals `testProfileId`
- Outside the callback: same query — assert it returns `NULL`
- Verify rollback: throw inside the callback, confirm no side effects persist

#### 0.4 — Audit existing `db.transaction()` callers

Search for all `db.transaction` calls. Each must now work with real transactions (no more silent fallback). Verify none depend on the non-atomic behavior.

**Known callers to check (from prior fixes):**
- `services/retention-data.ts` — atomic cooldown (D-02 fix)
- `services/session.ts` / `services/exchanges.ts` — atomic exchange limit (D-03 fix)
- `services/parking-lot-data.ts` — transactional count guard (D-04 fix)
- `inngest/functions/session-completed.ts` — atomic streak + XP
- `services/curriculum.ts` — atomic sortOrder allocation (BD-08 fix)

### Validation

| Check | Command |
|---|---|
| Integration test passes | `pnpm exec jest --testPathPattern="rls" --no-coverage` |
| Existing transaction callers still pass | `pnpm exec nx run api:test` |
| Type check | `pnpm exec nx run api:typecheck` |

---

## Phase 1: Create Postgres Role & Enable RLS

### Why This Is Safe

RLS policies only apply to non-owner roles. The app connects as `neondb_owner`. Enabling RLS and creating `app_user` has **zero production impact** until Phase 3 switches the connection role.

### Tasks

#### 1.1 — Write migration `0025`

**File:** `apps/api/drizzle/0025_enable_rls.sql`

```sql
-- S-06 Phase 1: Create app_user role and enable RLS on profile-scoped tables
-- SAFE: owner role (neondb_owner) bypasses RLS. No behavior change until Phase 3.

-- 1. Create app_user role (idempotent)
DO $$ BEGIN
  CREATE ROLE app_user NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Grant app_user schema access
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- 3. Enable RLS on all 21 profile-scoped tables
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE needs_deepening_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_adaptations ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_lot_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_card_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary_retention_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_embeddings ENABLE ROW LEVEL SECURITY;

-- 4. Enable RLS on account-scoped + special tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE top_up_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_links ENABLE ROW LEVEL SECURITY;
```

#### 1.2 — Generate Drizzle migration metadata

Run `pnpm run db:generate` to produce the corresponding snapshot JSON. Verify the snapshots now show `isRLSEnabled: true` for all 26 tables.

#### 1.3 — Deploy to dev, then staging

- `pnpm run db:push:dev` (dev iteration)
- Staging: commit migration SQL, run `pnpm run db:migrate:dev` equivalent against staging
- Verify: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` — all 26 tables should show `rowsecurity = true`

### Validation

| Check | Command / Query |
|---|---|
| Migration applies cleanly | `pnpm run db:push:dev` |
| RLS flags set | `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` |
| No behavior change | Full API test suite passes: `pnpm exec nx run api:test` |
| `app_user` role exists | `SELECT rolname FROM pg_roles WHERE rolname = 'app_user'` |

---

## Rollback

**Phase 0:** Revert the `client.ts` change to restore the transaction fallback. All callers fall back to non-atomic behavior (the prior status quo).

**Phase 1:** Run `ALTER TABLE <table> DISABLE ROW LEVEL SECURITY` for each table and `DROP ROLE app_user`. Or simply revert the migration. Since owner bypasses RLS, even leaving it enabled is harmless.

---

## What This Unlocks

After Phase 0+1, the system is ready for Phase 2 (write policies) and Phase 3 (switch connection role). Those phases are in the enforcement plan: `2026-04-15-S06-rls-phase-2-4-enforcement.md`.

---

## Checklist

- [ ] 0.1 — Remove transaction fallback in `client.ts`
- [ ] 0.2 — Create `withProfileScope()` in `packages/database/src/rls.ts`
- [ ] 0.3 — Integration test for context propagation
- [ ] 0.4 — Audit existing `db.transaction()` callers
- [ ] 1.1 — Write migration `0025_enable_rls.sql`
- [ ] 1.2 — Generate Drizzle snapshot
- [ ] 1.3 — Deploy to dev → staging → verify
