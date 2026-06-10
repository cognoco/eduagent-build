# Database & migration safety — Bug Review

> **Pruned 2026-06-10** — findings verified FIXED against `new-llm` HEAD were removed in this pass; only still-live findings remain below. Full original review is in git history.

Lens: Database & migration safety. Owned area: `packages/database/**`, drizzle migrations (`apps/api/drizzle/**`), transaction usage, neon-serverless patterns, FK/index coverage, migration immutability.

Branch reviewed: `new-llm`. Migration set walked: 0000–0107 plus `meta/_journal.json`, `meta/*_snapshot.json`, the deploy pipeline (`.github/workflows/deploy.yml`), and the baseline/target-verification guard scripts.

Headline: two committed, journaled migrations (`0106`, `0107`) are marked "REFERENCE ONLY — DO NOT APPLY" by comment only, yet they sit in the drizzle journal with snapshots and will be executed verbatim by the next `drizzle-kit migrate` against staging/prod. Nothing machine-enforces the "do not apply" intent.

---

## Critical

_All previously-listed items verified fixed on 2026-06-10 and pruned._

---

## High

### [High] No committed migration-immutability guard; pipeline trusts journal hashes with no drift detection

- File: `.github/workflows/deploy.yml:251` (`pnpm exec drizzle-kit migrate`), `packages/database/scripts/baseline-migrations.mjs` (only seeds an empty journal, intentionally not run in the normal deploy per `deploy-baseline-guard.test.ts:30-41`).
- What: The repo memory (`project_staging_mastered_at_drift.md`) records a prior staging+prod ledger drift whose root cause was "migration-file rewrites + manual push," and names the prevention as a "migration-immutability CI guard." I found no such guard committed anywhere (`scripts/`, `.github/workflows/` — grep for immutability/hash-pinning returns nothing; the only migration script is `check-migration-rollback.sh`, which checks rollback docs + snapshot presence, not content immutability). `drizzle-kit migrate` records each migration by a content hash; if an already-applied `.sql` is edited, its hash changes and the file is silently skipped on environments that already ran the old content, producing exactly the drift the memory describes.
- Impact: A future edit to any already-applied migration file (a tempting "just fix the SQL" move) re-creates the drift class that previously desynchronised staging/prod ledgers — silently, with no CI signal. Combined with the 0106/0107 finding, the migration pipeline has no automated tripwire against either "applied file mutated" or "do-not-apply file in the journal."
- Fix direction: Add a CI job that pins each historical migration's content hash (e.g. a committed `migration-hashes.json` checked against `sha256` of each `.sql`, append-only) and fails on any change to a file at or below the highest-applied index, plus the reference-only marker check from the Critical above. This is the "migration-immutability CI guard" the memory already flagged as the prevention.

### [High] `0088_bug363` runs `TRUNCATE` + PK swap with no explicit transaction wrapper

- File: `apps/api/drizzle/0088_bug363_dedup_pairkey_category.sql:37-50`.
- What: The migration does `TRUNCATE memory_dedup_decisions` → `DROP CONSTRAINT ..._pk` → `ADD COLUMN category NOT NULL DEFAULT 'unknown'` → `ADD CONSTRAINT ..._category_pk` → `CREATE INDEX`, with no `BEGIN; ... COMMIT;` wrapper (contrast 0044, which explicitly wraps its destructive dedup in `BEGIN/COMMIT`). drizzle-kit migrate does wrap a migration file in a transaction by default, but with `"breakpoints": true` in the journal each `--> statement-breakpoint` is sent as a separate statement; a failure partway (e.g. the `ADD CONSTRAINT` failing on a concurrent insert that slipped past the TRUNCATE) leaves the table with data truncated and no primary key.
- Impact: A mid-file failure destroys all `memory_dedup_decisions` rows (TRUNCATE already committed in some failure modes) while leaving the table without a PK — a half-migrated state requiring manual repair. The inline rollback note itself says post-launch rollback is "not possible without data loss."
- Fix direction: Wrap destructive multi-statement migrations in an explicit `BEGIN; ... COMMIT;` (as 0044 does) so the whole transformation is atomic, and prefer `DELETE WHERE ...` over `TRUNCATE` for any table that could hold real data (the file's own line 36 comment already warns TRUNCATE is "only safe pre-launch").

---

## Medium

### [Medium] FK-index gap: `profile_quota_usage.profile_id` cascade FK has no index where profile_id is leftmost

- File: `packages/database/src/schema/billing.ts:140-161` (FK at :140-142, indexes at :157-161); created by `apps/api/drizzle/0102_tier_server_rework.sql:43,56,58`.
- What: `profile_quota_usage.profile_id` references `profiles(id) ON DELETE CASCADE`, but the only indexes are `unique(subscription_id, profile_id)` and `index(subscription_id)` — `profile_id` is never the leftmost column. Postgres does not auto-index FK columns, so a profile deletion cascade seq-scans this table. This is the exact class BUG-393 / migration `0086_bug393_fk_indexes.sql` swept across older tables; the 0102 tables regressed it.
- Impact: `ON DELETE CASCADE` from a profile delete (account deletion / GDPR erasure path) does a sequential scan of `profile_quota_usage`, which grows one row per (subscription, profile) per cycle. O(N) delete cost and lock duration that worsens over time. Correctness is fine; this is a latent performance/lock-contention bug.
- Fix direction: Add `CREATE INDEX profile_quota_usage_profile_id_idx ON profile_quota_usage (profile_id)` in a new migration, mirroring 0086. Consider re-introducing the BUG-393 sweep as a forward-only CI guard (every cascade FK column must have a covering index with that column leftmost) so new tables can't regress again.

### [Medium] FK-index gap: `top_up_credits.profile_id` cascade FK has no leftmost index

- File: `packages/database/src/schema/billing.ts:224-244` (FK at :224-226, indexes at :239-244); created by `apps/api/drizzle/0102_tier_server_rework.sql:51,60`.
- What: `top_up_credits.profile_id` references `profiles(id) ON DELETE CASCADE`. Indexes present: `index(subscription_id)` and `index(subscription_id, profile_id, expires_at)` — `profile_id` is never leftmost. Same gap as above. (For contrast, the sibling `usage_events.profile_id` at billing.ts:194-210 IS covered by `usage_events_profile_occurred_idx (profile_id, occurred_at)` — so only `profile_quota_usage` and `top_up_credits` are exposed.)
- Impact: Profile-deletion cascade seq-scans `top_up_credits`. Same O(N)-on-delete characteristic as the previous finding.
- Fix direction: Add `CREATE INDEX top_up_credits_profile_id_idx ON top_up_credits (profile_id)` in the same follow-up migration as the `profile_quota_usage` index.

---

## Low

### [Low] Historical drizzle snapshots missing for idx 0006–0010, 0013, 0021, 0025 (and others)

- File: `packages/database/src/drizzle-meta-coverage.test.ts:12-14` (documents the gap), `scripts/check-migration-rollback.sh:126-149` (only enforces the LATEST snapshot).
- What: Eight-plus historical journal entries have no `meta/NNNN_snapshot.json`. drizzle-kit `generate` only consults the latest snapshot, so this does not break deploys today, but it leaves the snapshot chain non-contiguous and is acknowledged tech debt in both the test and the guard script.
- Impact: Low today. Risk is that a future tool/workflow that walks the full snapshot chain (or a `generate` run from an older base) hits the gaps. The `prevId`/`id` chain-coherence test (`drizzle-meta-coverage.test.ts:68-86`) explicitly skips over gaps, so a corrupt link inside a gap region would go undetected.
- Fix direction: Backfill the missing snapshots from the surrounding migrations as a one-time hygiene task (already tracked per the test comment), or document acceptance explicitly if regeneration is deemed not worth the risk.

### [Low] Stale comment in `filing.ts` claims neon-http transaction semantics; driver is now neon-serverless

- File: `apps/api/src/services/filing.ts:555-557` ("neon-http does not honour `.for('update')` in interactive transactions").
- What: `packages/database/src/client.ts:96-138` now uses `drizzle-orm/neon-serverless` (WebSocket), which DOES support interactive transactions with row locking (client.ts:83-94 documents the Phase-0.0 switch away from neon-http). The filing.ts comment still describes the old neon-http limitation. The actual code (relying on the DB-level unique index for race safety) remains correct and defensive, so this is a doc bug, not a behavioral one.
- Impact: Misleading to the next reader; could lead someone to wrongly conclude `SELECT ... FOR UPDATE` is unavailable and over-engineer around a limitation that no longer exists.
- Fix direction: Update the comment to reflect neon-serverless interactive-transaction semantics, while keeping the unique-index dedup (it is still the correct durable barrier and is also enforced under node-postgres in CI).

---

## Cross-lens findings

- [Security / RLS lens] `concepts` and `concept_mastery` declare `enableRLS()` (`schema/concept-mastery.ts`) and the migration `0107:49-50` enables RLS, but since the migration is reference-only the RLS policies for these tables exist in no live DB. The RLS-coverage static test (`packages/database/src/rls-coverage.test.ts`) may report these tables as "covered" from schema source while they are absent at runtime — a potential false-positive in the RLS audit. Worth the security lens confirming RLS coverage is measured against applied DB state, not just schema declarations.

- [Billing lens] The `0102_tier_server_rework` tables (`profile_quota_usage`, `top_up_credits`) drive quota enforcement; the FK-index gaps above are a billing-path performance concern on account deletion. Also confirm the billing lens checks the `profile_quota_usage` unique `(subscription_id, profile_id)` constraint matches the upsert conflict target used in `services/billing/`.
