# Option 1 — Staging rebuild from committed migrations

**Purpose:** restore staging's full RLS policy set (currently 3/~50) → satisfy WI-794 AC#1 (40/40 staging RLS verified) AND produce the faithful rehearsal baseline (committed-migration schema, 0118-exact, subscriptions-present, full RLS).

**Target:** Neon branch `staging` = `br-delicate-star-agpvtzx3`, endpoint `ep-fancy-cherry-agyi8ssc` (= Doppler `stg` `DATABASE_URL` — confirmed same DB the reviewer checked; no worker-vs-Neon drift).

**Snapshots (rollback insurance):**
- `staging-pre-option1-20260617` = `br-red-tooth-agnob5vq` — **current rewound state w/ 524 acc / 509 prof** (taken 2026-06-17). ← restore target if we keep data / if rebuild fails.
- `staging-pre-rebuild-20260617` = `br-solitary-river-ag4p259k` — earlier broken-cutover state.

**Authorization:** operator green-lit Option 1 (2026-06-17). Discard-vs-preserve (step 4) HELD pending PM ruling. #8/#11 remain operator-only — this is staging-only.

---

## Steps

1. **[DONE]** Protective snapshot of current staging → `br-red-tooth-agnob5vq`.

2. **Reset staging schema to empty** (keep the endpoint/host stable so Doppler needs no change):
   ```bash
   doppler run -p mentomate -c stg -- bash -c 'psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
   doppler run -p mentomate -c stg -- bash -c 'psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"'
   ```
   (Dropping `public` also drops drizzle's journal table → `migrate` runs the full chain from scratch.)

3. **Apply committed migrations** (full chain → schema + ~50 RLS policies across ~44 tables incl. `family_preferences` create@0066 + GUC fix@0117 + subscriptions table; journal tip):
   ```bash
   cd packages/database && doppler run -p mentomate -c stg -- pnpm exec drizzle-kit migrate
   ```
   - The **journaled** `0117_fix_family_preferences_rls_guc.sql` applies. The **de-journaled** `_freeze-only/0117_m_repoint.sql` / `0118_m_drop.sql` do NOT (correct — they're cutover-execution scripts, not baseline). No `ALLOW_FREEZE_MIGRATIONS` needed.

4. **Reseed data — DECISION PENDING (discard vs preserve):**
   - **DISCARD (recommended):** run `test-seed` (creates legacy + scenario rows), then **re-run** the reseed migrations `0109/0114/0115` against the seeded DB to mirror legacy→v2 (they're `ON CONFLICT` upserts → re-runnable; ordering matters — they no-op'd on the empty DB in step 3, so must run AFTER seeding legacy). Ensure the seed set covers rehearsal shapes: ownerless accounts (disposal/STOP-1), mixed-age families.
   - **PRESERVE (harder):** `pg_dump --data-only` from `br-red-tooth` (push-built schema) → load into the rebuilt committed-migration schema. Risk: schema differences → column/constraint mismatches on restore; fiddly. (This extra cost is part of why discard is recommended.)

5. **Reset baseline flag + redeploy:**
   ```bash
   doppler secrets set IDENTITY_V2_ENABLED=false --project mentomate --config stg
   ```
   redeploy the staging worker so the rehearsal starts flag-OFF (pre-cutover baseline).

6. **Verify 40/40 → capture WI-794 AC#1 evidence:**
   ```bash
   doppler run -p mentomate -c stg -- bash -c 'psql "$DATABASE_URL" -tAc "
     select count(*) policies from pg_policies where schemaname=''public'';
     select count(*) rls_tables from pg_class where relrowsecurity and relkind=''r'';
     select policyname, qual from pg_policies where policyname=''family_preferences_profile_isolation'';
     -- enabled-without-policy (must be empty):
     select c.relname from pg_class c where c.relrowsecurity and c.relkind=''r''
       and not exists (select 1 from pg_policies p where p.tablename=c.relname);"'
   ```
   Expected: policies ≈ 50, family_preferences present with `qual` referencing `app.current_profile_id`, enabled-without-policy = empty.

---

## After completion
- **WI-794: re-review only, NO code change.** Code (0117 + the regression guard, proven 4/4 on a committed-migration DB) is already merged. Capture the step-6 40/40 evidence → re-finalize → reviewer closes.
- **Rehearsal baseline ready** (pending the 0118-exact subscriptions-present confirmation, which this rebuild provides) → proceed to C0.

## Rollback
If the rebuild fails: restore staging from `br-red-tooth-agnob5vq` (repoint Doppler `stg` to it, or reset `br-delicate-star` from it). Nothing prod-touching.
