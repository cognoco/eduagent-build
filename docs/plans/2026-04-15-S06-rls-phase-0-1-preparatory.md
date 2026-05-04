# S-06 RLS — Phase 0 + Phase 1: Preparatory (Post-Launch Sprint 1)

> **Parent finding:** `docs/_archive/plans/bug-fix-plan HR.md` → S-06
> **Created:** 2026-04-15
> **Last updated:** 2026-04-27 — re-verification + 14-site audit; risk reassessed High; recommendation revised from Option C to Option B.
> **Risk:** ~~Low~~ **High** — RLS scaffolding shipped without Phase 0 prerequisites. Multiple live production races currently hidden by the silent fallback (see Audit Results below). Switching the connection role to `app_user` will silently return zero rows for every scoped query until Phase 0.0 + 0.1 + 0.3 ship.
> **Estimated effort:** 2 days for Phase 0 if Option B is taken; longer if Option C dual-client is preferred.
> **Branch:** create from `main` after stabilization merges

---

## Status Update (2026-05-01) — PR #126 landed the driver swap

**Phase 0.0 is DONE.** Commit `c80bb903` (2026-04-28, PR #126 — "RLS-driver-swap") landed the dual-driver `looksLikeNeon()` selector in `packages/database/src/client.ts`. The "ticking-bomb" framing in the 2026-04-27 update below is therefore **stale** — the most acute risk (no real driver to fall back to when removing the fallback) is resolved.

**Re-verify before resuming work on this plan:** Phases 0.1 (remove fallback), 0.3 (integration test for context propagation), and 1.3 (deploy + verify) were all blocked on Phase 0.0 and may have moved partway. Read `packages/database/src/client.ts` and `packages/database/src/rls.ts` against the current `main`, and re-grep for any remaining `db.transaction()` callers, before treating the 2026-04-27 status table or "ticking-bomb" Implication paragraph as accurate.

The 2026-04-27 update below is preserved for context but should not be acted on without first re-verifying against PR #126's changes.

---

## Status Update (2026-04-27)

12 days after this plan was written, parts of it shipped out of order, and a fresh audit found two factual errors in the original Context table. The current ground truth:

| Item | Plan said | Reality (verified 2026-04-27) |
|---|---|---|
| Phase 0.0 — driver decision | Blocking prerequisite | **NOT DONE.** `drizzle-orm@0.39.3` and `@neondatabase/serverless@0.10.4` unchanged. Silent fallback in `packages/database/src/client.ts:21-37` still active. |
| Phase 0.1 — remove fallback | After 0.0 | **NOT DONE.** Fallback unchanged. Today's commit `d6454975` (BUG-626) acknowledges the silent degrade and works around it by reordering UPDATEs/INSERTs rather than fixing the driver. |
| Phase 0.2 — `withProfileScope` | Build new utility | **DONE** (`packages/database/src/rls.ts`) — but currently a **silent no-op**: `db.transaction(...)` hits the fallback, so `SET LOCAL` runs outside any real transaction. Not called from any application code yet. |
| Phase 0.3 — integration test for context propagation | Required test | **NOT DONE.** `packages/database/src/rls.test.ts:1-10` explicitly defers it pending Phase 0.0. Existing tests mock `db.transaction` itself, so they cannot catch the silent no-op. Violates project rule "No Internal Mocks in Integration Tests." |
| Phase 0.4 — audit `db.transaction()` callers | 5 known callers listed | **DONE 2026-04-27** — see "Audit Results" section below. Refreshed grep found **14 sites**; 12 require WebSocket driver, 2 are batch-safe, 0 can be deleted. |
| Phase 1.1 — migration `0025_enable_rls.sql` | New migration to write | **DONE under different numbers.** RLS enabled across migrations `0027_enable_rls.sql`, `0029_rls_sweep_gaps.sql`, `0032_rls_quiz_mastery_items.sql`, `0037_rls_weekly_reports.sql`. |
| Phase 1.3 — deploy + verify | Required deploy step | Migrations are committed and presumed deployed. Verification query (`pg_tables.rowsecurity`) has not been re-run against staging/prod since plan was written. |

### Implication

The system is in a "ticking-bomb" state: RLS is enabled on tables, `withProfileScope` exists in the codebase but is a silent no-op, and at least 6 sites have **live production races** that the silent fallback is hiding (see Audit Results). Today the only thing keeping production working is that (a) `withProfileScope` is unused and (b) the connection still uses `neondb_owner` (which bypasses RLS).

---

## Goal

Lay the groundwork for Row-Level Security without changing any runtime behavior. After this plan:
- Transactions work correctly (no silent atomicity drops)
- A `withProfileScope()` utility exists and is tested
- RLS is enabled on all 21 profile-scoped tables (but not enforced — owner role bypasses)
- An `app_user` Postgres role exists with appropriate grants

**Nothing changes for production traffic.** The app still connects as `neondb_owner`, which bypasses all RLS policies.

---

## Context & Constraints (Verified 2026-04-15, revised 2026-04-16)

| Assumption | Status |
|---|---|
| Driver is `neon-http` (stateless HTTP) | ✅ Confirmed — `packages/database/src/client.ts` |
| Transaction fallback silently drops atomicity | ✅ Confirmed — catch block re-invokes callback on base `db`, no rollback |
| `vocabulary` + `vocabularyRetentionCards` missing from `createScopedRepository` | ✅ Confirmed — `packages/database/src/repository.ts` |
| All tables have `isRLSEnabled: false` | ✅ Confirmed — all drizzle meta snapshots |
| ~~Next available migration number~~ | **STALE — superseded 2026-04-27.** Migrations go through `0038`. RLS migrations already applied: `0027_enable_rls.sql`, `0029_rls_sweep_gaps.sql`, `0032_rls_quiz_mastery_items.sql`, `0037_rls_weekly_reports.sql`. |
| ~~Transaction fallback is a relic of an older driver~~ | ❌ **WRONG** — re-verified 2026-04-27 against `0.39.3` (installed), `0.45.2` (latest stable), `1.0.0-beta.9` (latest beta). `NeonHttpSession.transaction` and `NeonTransaction.transaction` throw `"No transactions support in neon-http driver"` unconditionally in all three. **Option A (drizzle upgrade) is permanently dead — do not re-verify.** |
| ~~`db.batch()` is equivalent to a transaction~~ | ✅ **YES — original 2026-04-15 claim was WRONG.** Re-verified 2026-04-27 against `@neondatabase/serverless@0.10.4` `index.d.ts` JSDoc and Neon's official docs. JSDoc verbatim: *"The `transaction()` function allows multiple queries to be submitted (over HTTP) as a single, non-interactive Postgres transaction."* Supports `isolationMode` (ReadCommitted, RepeatableRead, Serializable), `readOnly`, `deferrable`. **`db.batch([...])` IS ACID** — single Postgres `BEGIN/COMMIT` at the server. The remaining limitation is *interactivity*: queries must be declared up-front (no read-then-decide-then-write inside one batch). |
| `@neondatabase/serverless` HTTP client has ACID transactions | ✅ **YES (non-interactive only)** — `client.transaction([queries])` is a real Postgres transaction. ⚠ **Interactive** transactions (callback-style, where one query's result decides the next) still require the WebSocket driver (`neon-serverless`). |

### Implication

**Phase 0 cannot simply remove the fallback.** Doing so on the current stack crashes every `db.transaction()` caller. A driver/library decision must precede task 0.1. See Phase 0.0 below.

---

## Audit Results (2026-04-27) — 14 `db.transaction()` sites classified

Three parallel agents audited every `db.transaction(...)` call site in the codebase. Each site was classified as:
- **(I) Interactive** — callback reads a value, branches on it, writes based on the branch. Cannot be expressed as a fixed query array. Needs `neon-serverless` WebSocket driver.
- **(B) Batch-safe** — fixed array of writes/reads with no inter-dependency. Replace with `db.batch([...])` for true ACID atomicity.
- **(S) Sequential is fine** — wrapper provides no value; delete it.

| Site | Decision | Justification | Refactor |
|---|---|---|---|
| `packages/database/src/rls.ts:20` (`withProfileScope`) | **I** | `SET LOCAL` is a connection-state side-effect; cannot be expressed as a fixed query array | High |
| `apps/api/src/services/consent.ts:199` | **B** | Two writes (consents upsert + familyLinks insert); neither depends on the other's result | Low |
| `apps/api/src/services/profile.ts:227` | **I** | Read profile count → branch → conditional helpers → insert chain; uses `pg_advisory_xact_lock` | High |
| `apps/api/src/services/curriculum.ts:780` | **I** | INSERT topics → SELECT them back to get UUIDs → INSERT topicConnections using those UUIDs | High |
| `apps/api/src/services/curriculum.ts:1180` | **I** | `ensureDefaultBook` is read-then-conditional-write; book ID feeds downstream inserts | High |
| `apps/api/src/services/curriculum.ts:1340` | **B** | Three independent statements (two-phase swap + adaptation insert); no inter-dependency | Med |
| `apps/api/src/routes/assessments.ts:121` | **I** | Helpers `updateRetentionFromSession` and `insertSessionXpEntry` both do read-compute-write chains | High |
| `apps/api/src/services/quiz/complete-round.ts:230` | **I** | Per-question read → branch → write loop; calls `reviewVocabulary` which opens **nested** `db.transaction` | High |
| `apps/api/src/services/filing.ts:371` | **I** | 5 read-then-write chains; uses `SELECT FOR UPDATE` row locks (silent no-op today) | High |
| `apps/api/src/services/home-surface-cache.ts:186` | **I** | INSERT-on-conflict → `SELECT FOR UPDATE` → UPDATE using locked row content; documented "Bug #25" race | Med |
| `apps/api/src/services/parking-lot-data.ts:72` | **I** | TOCTOU: SELECT count, branch on `>= MAX_ITEMS_PER_TOPIC`, conditional INSERT | Low |
| `apps/api/src/services/settings.ts:564` | **I** | TOCTOU: SELECT notification log count, branch on rate limit, conditional INSERT | Low |
| `apps/api/src/services/vocabulary.ts:261` | **I** | `ensureVocabularyRetentionCard` is read-then-write; SM-2 arithmetic feeds UPDATE; **scope leak via `tx as Database` cast** | Med |

**Totals:** I = 12, B = 2, S = 0

### Live production races uncovered (NOT theoretical)

These races are currently hidden by the silent fallback. Each warrants its own Notion bug ticket independent of the broader Phase 0 work:

| Site | Race | User-visible impact |
|---|---|---|
| `filing.ts:371` | `SELECT FOR UPDATE` is a no-op | Orphaned shelf/book/topic records on concurrent POST |
| `home-surface-cache.ts:186` | Documented "Bug #25" lost-update | Race on home cache writes |
| `parking-lot-data.ts:72` | TOCTOU count guard | Can exceed `MAX_ITEMS_PER_TOPIC` under concurrency |
| `settings.ts:564` | TOCTOU rate-limit guard | Can exceed notification rate-limit |
| `profile.ts:227` | `pg_advisory_xact_lock` is a no-op | Profile-creation limit guards inactive |
| `consent.ts:199` | Atomicity gap on consent + family link | Consent recorded without parent link possible |

### Other findings worth knowing

1. **Nested transaction trap.** `complete-round.ts:230` calls `reviewVocabulary` which opens its own `db.transaction` (`vocabulary.ts:261`). Today both flatten to no-ops. Once WS is wired, this becomes a savepoint scenario — verify `drizzle-orm/neon-serverless` supports nested transactions, or flatten one of them before migration.
2. **`vocabulary.ts:261` scope leak.** `ensureVocabularyRetentionCard(txDb, ...)` accepts a `Database` not a `tx` handle. Cast (`tx as unknown as Database`) works today only because nothing is atomic. After WS wiring, the helper's queries will run *outside* the outer transaction unless the helper signature is updated to accept and forward `tx`.
3. **BD-08 "atomic sortOrder" was misread.** Original plan implied curriculum sites use SELECT MAX + INSERT for sortOrder allocation. They don't — sortOrder is passed in pre-computed by the caller (LLM-generated index or pre-computed `reordered` array). Only `curriculum.ts:1340` is structurally batch-convertible.
4. **`SET LOCAL` cross-request leak claim** — under investigation. Worst-case interpretation is a P0 cross-tenant data exposure; best-case interpretation is that Postgres no-ops `SET LOCAL` outside a transaction so there's nothing to leak. **Verification in progress** — see "Verification Required" section.

### Driver-decision implication of audit

Originally Option D ("`db.batch()` for most sites + WS only for `withProfileScope`") looked attractive. The audit shows only 2 of 14 sites are batch-safe — Option D saves ≈15% of the work. **Revised recommendation:** Option B (full WebSocket switch) becomes more attractive than Option C (dual-client) because the dual-client juggle no longer "isolates" much. See revised Phase 0.0 below.

### Verification — `SET LOCAL` cross-request leak (REFUTED 2026-04-27)

The hypothesis that `withProfileScope` running under the silent fallback could leak `app.current_profile_id` across HTTP requests was **investigated and refuted**. Citations:

1. **Postgres `SET LOCAL` semantics** ([SQL `SET` reference](https://www.postgresql.org/docs/current/sql-set.html)): *"Issuing this outside of a transaction block emits a warning and otherwise has no effect."* The fallback path runs `SET LOCAL` outside any `BEGIN/COMMIT`, so the GUC is never written at any scope.

2. **Neon connection model** ([Neon docs — connection pooling](https://neon.com/docs/connect/connection-pooling)): Neon runs PgBouncer in **transaction mode** (`pool_mode=transaction`). Connections return to the pool after each transaction. Session-level GUCs (plain `SET`) are explicitly listed as unsupported because the underlying connection is recycled. Even a plain `SET` written via HTTP would not survive to a future request.

**Verdict — current code:** REFUTED. `SET LOCAL` outside a transaction is a Postgres no-op; nothing is written to session state. The behavior is a **correctness bug** (the RLS GUC is never set, so policies that read `current_setting('app.current_profile_id')` get NULL), not a security leak.

**Verdict — future regression risk:** PARTIAL. If someone later changes the fallback to use plain `SET` (perhaps mistakenly thinking it's needed to work outside a transaction), the immediate Postgres semantics would write to session state. Today this is *masked* by Neon's PgBouncer-transaction-mode pooler — a defense-in-depth that is an infra implementation detail, not a Postgres guarantee. **The protection would fail entirely if the codebase migrated to the WebSocket driver** (`neon-serverless`'s `Pool`/`Client`), where sessions are persistent and a plain `SET` in one request could survive to the next request on the same Worker instance.

**Implication for the work below:** No P0 reordering required. The original Phase 0 sequence stands. Path A (loud warning) does NOT need to ship ahead of Phase 0.0. However, the regression risk is concrete enough to warrant:

- A regression test in Phase 0.3 that asserts `withProfileScope` MUST never use plain `SET` (lint-style check or runtime assertion).
- The replacement for the `console.warn` in Phase 0.1 should be a structured metric/event (per project rule "Silent Recovery Without Escalation is Banned"), so any future regression that *does* introduce a leak is observable from day one.

---

## Phase 0: Fix Transaction Support

### Why This Matters

`packages/database/src/client.ts` has a `catch` block that intercepts the `"No transactions support in neon-http driver"` error and re-runs the callback directly on `db` — **without atomicity or rollback**. Every `db.transaction()` call in the codebase silently runs as individual statements. This must be fixed before RLS can work (RLS requires `SET LOCAL` inside a real transaction that subsequent statements also run inside).

**The fallback is protective, not vestigial.** See Context & Constraints above. Removing it without first providing a real transaction mechanism crashes every current caller.

### Tasks

#### 0.0 — Driver / library decision (NEW PREREQUISITE — blocks 0.1+)

Before touching `client.ts`, we must give the codebase a real transaction primitive. **REVISED 2026-04-27** — Option A is permanently dead, the audit shifted the recommendation, and Option D was added to the table:

| Option | What changes | Pros | Cons |
|---|---|---|---|
| ~~**A. Upgrade `drizzle-orm`** to a version where `neon-http` implements real transactions~~ | — | — | ❌ **DEAD.** Re-verified 2026-04-27: `neon-http` throws unconditionally in `0.39.3`, `0.45.2` (latest stable), and `1.0.0-beta.9` (latest beta). No released version supports interactive transactions. |
| **B. Switch to `drizzle-orm/neon-serverless` (WebSocket) — RECOMMENDED 2026-04-27** | Import path + driver construction in `client.ts`; Doppler needs pooled/unpooled URL discipline; worker runtime must support WS | Real ACID interactive transactions; no upstream dependency; single connection model (no two-client juggling); fixes ALL 14 sites at once including the 6 live races | Changes connection lifecycle for every query; WebSockets behave differently under Cloudflare Workers/edge; connection-pool tuning required; latency profile changes |
| **C. Dual-client** — keep `neon-http` for single-statement queries; add `neon-serverless` WS client used only for transactional sites | Smaller initial blast radius for non-transactional traffic | Two connection strings, two Doppler vars, two code paths; **audit shows 12/14 sites need WS, so the "narrow" scope is no longer narrow**; complicates Inngest/owner connection story in Phase 3 |
| **D. `db.batch()` for non-interactive sites + WS for interactive only** | Replace 2 batch-safe sites with `db.batch([...])`; everything else needs WS anyway | Eliminates the wrapper for the 2 batch-safe cases without driver work | Saves only ~15% of sites (2/14); still requires WS infrastructure for the other 12; not a meaningful simplification |

**Revised recommendation (2026-04-27, post-audit):** Option **B** — full WebSocket switch. The original "Option C isolates blast radius" reasoning assumed a small WS scope; the 14-site audit (12 interactive) eliminates that assumption. Option D is technically possible for the 2 batch-safe sites (`consent.ts:199`, `curriculum.ts:1340`) but doesn't justify maintaining two clients in `client.ts`. After Option B is in place, the 2 batch-safe sites can still optionally use `db.batch([...])` for slightly cheaper round-trips, but they aren't blockers.

**Original recommendation (2026-04-15) is superseded.** That recommendation said "try A → fall back to C." A doesn't exist; C costs roughly the same as B but adds dual-client complexity for marginal benefit.

**Action items (revised):**
- Construct a `neon-serverless` WS client in `client.ts`. Use Cloudflare Workers' `WebSocketPair` polyfill or Neon's recommended setup for Workers (see [neon.com/docs/serverless/serverless-driver](https://neon.com/docs/serverless/serverless-driver)).
- Provision a pooled and an unpooled connection URL in Doppler (Neon distinguishes these).
- Wire the WS client into a single `db.transaction()` call as a smoke test.
- Confirm `SET LOCAL` propagates to a subsequent `SELECT` inside the same transaction (this is the Phase 0.3 integration test).
- Document the decision inline in `client.ts` with a comment referencing this plan.

**Exit criteria for 0.0:** there is a working code path where `db.transaction(async (tx) => { await tx.execute(sql\`SET LOCAL app.x = '1'\`); return tx.execute(sql\`SELECT current_setting('app.x', true)\`); })` returns `'1'` without hitting the fallback. Run this test from a Cloudflare Worker dev environment, not just Node, to catch WS-incompatibility issues early.

#### 0.1 — Remove the fallback (depends on 0.0)

Once 0.0 is proven, remove the try/catch fallback in `client.ts`. Under Option B (recommended), there is no longer a separate HTTP client to "leave behind" — the WS client handles `db.transaction()` directly. The `console.warn` is replaced with a structured Inngest event/metric (`db.transaction.fallback.unsupported`) that fires if anyone ever wraps the client back in a fallback shim — this satisfies the project rule "Silent Recovery Without Escalation is Banned" against future regressions.

If the driver throws after 0.0 is done, we want to know — silent non-atomicity is worse than a crash.

**File:** `packages/database/src/client.ts`

**Regression guard:** add a lint rule or unit test that fails if the strings `console.warn` appears anywhere in `client.ts`'s `transaction` method override, so the fallback cannot be silently re-added.

#### 0.2 — Create `withProfileScope()` utility — ✅ DONE 2026-04-?? (file exists at `packages/database/src/rls.ts`, but currently a silent no-op until 0.0/0.1 land — see Audit Results above)

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

#### 0.3 — Integration test for context propagation — **PRIORITY: would have caught the no-op shipped in 0.2**

Write a test that:
- Connects to a real Postgres via the `neon-serverless` WS client (per Phase 0.0).
- Calls `withProfileScope(db, testProfileId, async (tx) => { ... })`.
- Inside the callback: `SELECT current_setting('app.current_profile_id', true)` — assert it equals `testProfileId`.
- Outside the callback: same query — assert it returns `NULL`.
- Verify rollback: throw inside the callback, confirm no side effects persist (insert a row inside, throw, confirm the row is absent after).
- Verify isolation: run two `withProfileScope` calls concurrently with different profile IDs — assert each callback sees only its own profile id.
- **Verify regression guard:** add a test that fails if `withProfileScope`'s implementation ever changes from `SET LOCAL` to plain `SET` (string-match or AST check on `rls.ts`).

**Location:** alongside `packages/database/src/rls.ts` as `rls.integration.test.ts`, OR under `apps/api/tests/integration/rls/` — pick whichever matches established project test conventions.

**Mocking rule (project standard):** must NOT mock `db.transaction`, the database driver, or the schema. May only mock external services (Stripe, Clerk JWKS, etc.) — none should appear in this test. The current `packages/database/src/rls.test.ts` mocks `db.transaction` itself and proves nothing about real behavior; treat that file as the unit-test layer (call ordering only) and keep it, but it does not satisfy 0.3.

#### 0.4 — Audit existing `db.transaction()` callers — ✅ DONE 2026-04-27

See "Audit Results" section above for the full I/B/S classification of all 14 sites. Summary:

- **12 sites need WS driver (I)** — these will work as-is once Option B (Phase 0.0) lands. Each needs a verification test confirming the previously-no-op atomicity now actually holds (the 6 live races listed in Audit Results are the priority).
- **2 sites are batch-safe (B)** — `consent.ts:199` and `curriculum.ts:1340`. Optionally convert to `db.batch([...])` after Option B lands; not blockers.
- **0 sites can be deleted (S)** — all 14 sites need atomicity for correctness.

**Implementation order after Phase 0.0/0.1 land (recommended priority):**
1. **`consent.ts:199`** — privacy/legal-grade. Convert to `db.batch([...])` immediately (no driver dependency). Add a break test asserting that a forced familyLinks insert failure rolls back the consent insert.
2. **`filing.ts:371`** — currently most exposed live race (orphaned shelf/book/topic on concurrent POST). After Option B, the existing `SELECT FOR UPDATE` calls become real row locks.
3. **`home-surface-cache.ts:186`** — closes "Bug #25" lost-update race.
4. **`profile.ts:227`** — restores `pg_advisory_xact_lock`.
5. **`parking-lot-data.ts:72` + `settings.ts:564`** — TOCTOU guards become real.
6. **`vocabulary.ts:261` + `complete-round.ts:230`** — fix the helper-scope leak in `ensureVocabularyRetentionCard` and resolve the nested transaction in `reviewVocabulary` (flatten or savepoint, depending on `drizzle-orm/neon-serverless` capability).
7. **Remaining curriculum + assessments sites** — straightforward once WS is in place.

**Each migrated site needs a regression test** that exercises the atomicity it now provides (the previous fix-by-reordering, e.g. BUG-626, is no longer needed but the test should still pass without it).

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

#### 1.1 — Write migration `0025` — ✅ DONE under different numbers (`0027`, `0029`, `0032`, `0037`)

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

#### 1.2 — Generate Drizzle migration metadata — ✅ DONE (verify `apps/api/drizzle/meta/*.json` snapshots show `isRLSEnabled: true` for all 26 tables)

Run `pnpm run db:generate:dev` to produce the corresponding snapshot JSON. Verify the snapshots now show `isRLSEnabled: true` for all 26 tables.

#### 1.3 — Deploy to dev, then staging — ✅ DONE (presumed; **action item:** re-run `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` against staging + prod and paste the result here)

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

**Phase 0.0:** If Option B/C is taken and the WS driver misbehaves under load, revert the new client (or flip a feature flag) so the HTTP client is used for all traffic. `withProfileScope` becomes a no-op transaction → RLS is unreachable, but the app runs. No data migration involved; this is a code-only revert.

**Phase 0.1:** Revert the `client.ts` change to restore the transaction fallback. All callers fall back to non-atomic behavior (the prior status quo). Note: only safe while RLS is *not* enforced (i.e. Phase 3 has not shipped) — silent non-atomicity under RLS would corrupt scoped-write semantics.

**Phase 1:** Run `ALTER TABLE <table> DISABLE ROW LEVEL SECURITY` for each table and `DROP ROLE app_user`. Or simply revert the migration. Since owner bypasses RLS, even leaving it enabled is harmless.

---

## Pre-Phase-3 Gate (NEW 2026-04-27)

**Phase 3 of the enforcement plan (`2026-04-15-S06-rls-phase-2-4-enforcement.md`) MUST NOT ship until ALL of the following are green:**

1. ✅ Phase 0.0 — Option B implemented; `neon-serverless` WS client functional in `client.ts` and proven from a Cloudflare Worker dev environment.
2. ✅ Phase 0.1 — silent fallback removed from `client.ts`; structured Inngest event/metric in place; lint guard against re-introduction.
3. ✅ Phase 0.3 — integration test against a real Postgres connection passes in CI; covers context propagation, rollback, concurrent isolation, and the `SET LOCAL`-not-plain-`SET` regression guard.
4. ✅ Phase 0.4 — at minimum, the 6 live-race sites (consent, filing, home-surface-cache, profile, parking-lot-data, settings) have been migrated and have regression tests asserting the previously-no-op atomicity now actually holds.

If any of these is incomplete, switching the connection role to `app_user` will silently break every scoped read in production (reads return zero rows because `current_setting('app.current_profile_id')` is NULL).

---

## What This Unlocks

After Phase 0+1, the system is ready for Phase 2 (write policies) and Phase 3 (switch connection role). Those phases are in the enforcement plan: `2026-04-15-S06-rls-phase-2-4-enforcement.md`.

---

## Checklist (refreshed 2026-04-27)

**Remaining work (in dependency order):**

- [x] **0.0 — Driver decision: implement Option B (full `neon-serverless` WS switch). DONE 2026-04-27.** `packages/database/src/client.ts` switched to `drizzle-orm/neon-serverless` + `Pool`. Silent fallback removed entirely. `nodejs_compat` confirmed in `wrangler.toml`. `neonConfig.webSocketConstructor` injected for Node.js; Workers use global `WebSocket`.
- [x] **0.1 — Silent fallback removed. DONE 2026-04-27** (part of 0.0). `onTransactionFallback` option deleted; callers in `middleware/database.ts` and `inngest/helpers.ts` updated.
- [x] **0.3 — Integration test. DONE 2026-04-27.** `packages/database/src/rls.integration.test.ts` covers: SET LOCAL propagation, GUC cleared after commit, rollback on throw, SET LOCAL source-level regression guard.
- [ ] 0.4a — Migrate the 6 live-race sites in priority order: `consent.ts:199` (B), `filing.ts:371` (I), `home-surface-cache.ts:186` (I), `profile.ts:227` (I), `parking-lot-data.ts:72` (I), `settings.ts:564` (I). Each site gets a regression test.
- [ ] 0.4b — Migrate the remaining 7 sites: `vocabulary.ts:261` + helper-scope fix, `complete-round.ts:230` + nested-tx resolution, `curriculum.ts:780/1180/1340`, `assessments.ts:121`, `rls.ts:20` (`withProfileScope` becomes functional).

**Done already (verify, do not re-run):**

- [x] 0.2 — `withProfileScope()` exists at `packages/database/src/rls.ts`. **Caveat:** runtime no-op until 0.0/0.1 land.
- [x] 1.1 — RLS migrations applied: `0027_enable_rls.sql`, `0029_rls_sweep_gaps.sql`, `0032_rls_quiz_mastery_items.sql`, `0037_rls_weekly_reports.sql`. Verify all 26 profile-scoped tables are covered.
- [x] 1.2 — Drizzle snapshots regenerated (presumed; verify via `apps/api/drizzle/meta/*.json`).
- [x] 1.3 — Deployed to dev + staging (presumed). **Action item:** re-run `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` against staging and prod.
- [x] 0.4 audit — DONE 2026-04-27 by parallel agent dispatch; results in "Audit Results" section above.
- [x] `SET LOCAL` cross-request leak verification — REFUTED 2026-04-27 (Postgres no-ops; Neon PgBouncer transaction-mode prevents session leaks). See "Verification" section above.

**Pre-Phase-3 Gate (must be green before any work in `2026-04-15-S06-rls-phase-2-4-enforcement.md` Phase 3):**

- [x] 0.0 done (2026-04-27)
- [x] 0.1 done (2026-04-27)
- [x] 0.3 integration test passing in CI (2026-04-27)
- [ ] 0.4a (6 live-race sites) migrated and break-tested

**Out-of-band tickets to open (independent of Phase 0):**

- [ ] Notion bug for `filing.ts:371` orphaned-records race
- [ ] Notion bug for `home-surface-cache.ts:186` Bug-#25 lost-update race
- [ ] Notion bug for `parking-lot-data.ts:72` TOCTOU exceeding `MAX_ITEMS_PER_TOPIC`
- [ ] Notion bug for `settings.ts:564` TOCTOU exceeding notification rate-limit
- [ ] Notion bug for `profile.ts:227` `pg_advisory_xact_lock` no-op (profile-creation limit guards inactive)
- [ ] Notion bug for `consent.ts:199` consent + family-link atomicity gap (privacy/legal grade)
