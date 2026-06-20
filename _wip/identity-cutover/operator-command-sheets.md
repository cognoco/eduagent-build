# Operator Command Sheets — Identity Cutover (PRG-06 / WS-18)

> Drafted by the orchestrator, 2026-06-17 (prep set item 4). **Operator-run.** #8 (flip)
> and #11 (DROP) are operator-only. Every value below is verified against live infra +
> `origin/main` on the drafting date — re-verify the migration level and prod emptiness at
> execution time (cheap; commands in §0).

---

## ⚠️ CONTEXT THAT CHANGES EVERYTHING — prod is empty (verified 2026-06-17)

Production (`br-green-pond-agpzmrwx`, host `ep-holy-leaf-ag0rtn17`) has **0 rows in all 85
user tables** (migration level **116** = drop not applied). Staging has real-shaped data
(524 accounts / 509 profiles); prod does not. Consistent with **pre-launch**.

Implication for the **prod** runbook (NOT staging):
- The data-migration spine — **disposal → reseed → parity (C2–C5)** — is a **no-op on prod**
  (0 legacy rows → 0 v2 rows; parity is trivially 0 = 0).
- **#11 DROP blast radius on prod = 0 rows.** The "irreversible prod data loss" that made
  #11 a catastrophe-gate does not apply while prod is empty (nothing to lose; PITR recovery moot).
- The **freeze window (MAINTENANCE_READONLY / _BLOCK_INNGEST)** protects in-flight writes.
  With 0 users + (apparently) no traffic, there is nothing to freeze — it is hygiene, not data-safety.
- **The risky operation collapses to: flip the flag → drop the empty tables.**

**This holds ONLY while prod stays empty.** If the app launches / users sign up before the
cutover runs, prod gains data and the full runbook re-applies. → Strong argument to do the prod
cutover **before launch**. The staging rehearsal remains the place that exercises the full
data path (staging has data) and proves v2 code correctness for post-launch users.

---

## §0 — Pre-flight re-verification (run first, every time; read-only)

```bash
# Neon context (this shell needs org disambiguation)
ORG=org-floral-cell-29259725 ; PROJ=lingering-violet-30592106
PROD=br-green-pond-agpzmrwx

# 1. Prod migration level — expect 116 (0117/0118 NOT applied)
doppler run -c prd -- node --input-type=module -e "import {neon} from '@neondatabase/serverless'; const sql=neon(process.env.DATABASE_URL); const m=await sql('select count(*)::int n from drizzle.__drizzle_migrations'); console.log('migrations applied:', m[0].n)"

# 2. Prod blast radius — expect all 0 while pre-launch
doppler run -c prd -- node packages/database/scripts/verify-identity-reseed.mjs --inventory

# 3. Confirm the 3 control flags' current prod state (absent => default false)
doppler secrets --config prd --only-names | rg 'IDENTITY_V2_ENABLED|MAINTENANCE_READONLY|MAINTENANCE_BLOCK_INNGEST' || echo "none set (all default false — current prod-off behavior)"
```

**Flag facts (verified in `apps/api/src/config.ts`):** all three are `z.enum(['true','false']).default('false')`.
They are **absent** from prod Doppler today → resolve to `false` → current (legacy) behavior.
So the flip/freeze are **`doppler secrets set` (introduce the key) + redeploy**, not an edit.

---

## §1 — FREEZE (C0/C1) — operator; hygiene-only while prod is empty

Two-stage maintenance gate (`apps/api/src/middleware/maintenance.ts`):

```bash
# Stage 1 — read-only (503 all except health check)
doppler secrets set MAINTENANCE_READONLY=true --config prd
#   → trigger the production deploy so the worker picks up the secret

# Stage 2 — after the Inngest drain reads zero, also block Inngest
doppler secrets set MAINTENANCE_BLOCK_INNGEST=true --config prd
#   → trigger the production deploy
```

Lift the freeze (after the cutover) by setting both back to `false` (or deleting the keys) + deploy.

---

## §2 — SNAPSHOT (#6 / C2) — operator-delegated-to-orchestrator under conditions

neonctl is authed and can branch the prod parent (verified 2026-06-17 — no pg_dump fallback needed):

```bash
neonctl branches create --project-id "$PROJ" --org-id "$ORG" \
  --parent "$PROD" --name pre-drop-$(date +%Y%m%d)
# Copy-on-write, no impact on prod. This is the ONLY recovery path post-#11. Take it
# immediately before the drop, NOT earlier (a stale snapshot defeats the purpose).
```

---

## §3 — REPOINT (C6) — operator; freeze-only, hand-applied (NOT in the migrate chain)

`apps/api/drizzle/_freeze-only/0117_m_repoint.sql` (`-- @freeze-only`, de-journaled; journal tip = 0116).
**Catalog-driven dynamic loop** (verified 2026-06-17) — `0117` queries `pg_constraint` at run time
and `EXECUTE format`s the repoint per live FK, with a completeness `RAISE EXCEPTION` that aborts on
any unexpected FK. It **self-adapts to the target's live catalog** (stg 64 / prod 65 FKs handled
automatically) — **no manual re-authoring per env**; apply the same file. On an empty prod there are
no data rows, but the FK *constraints* still exist and must be repointed before the DROP (Postgres
blocks a DROP on a dangling dependency — intentional, no CASCADE).

**Apply path (two options, verified against the guard `check-reference-only-migrations.mjs`):**
- **Simplest — direct `psql`:** `psql "$PROD_URL" -f apps/api/drizzle/_freeze-only/0117_m_repoint.sql` (the guard's own comment names `psql -f` as the hand-run path; bypasses drizzle-kit entirely, no journal/env needed).
- **Or journal-promote:** copy into `apps/api/drizzle/` with a new number + add to `_journal.json`, then `ALLOW_FREEZE_MIGRATIONS=true pnpm exec drizzle-kit migrate` (the guard is fail-closed and blocks a journaled `@freeze-only` migration *unless* that signal is set).

---

## §4 — FLIP (#8 / C7) — OPERATOR-ONLY

```bash
doppler secrets set IDENTITY_V2_ENABLED=true --config prd
# → trigger the production deploy so the worker rebuilds with the flag on
```

**Verify after deploy:**
```bash
# health + a couple of flag-on reads should be non-5xx
curl -fsS https://<prod-worker-url>/health
# (full route-smoke needs a live JWT + seeded owner/child — only meaningful once prod has data)
```

**Rollback (instant, pre-#11):** `doppler secrets set IDENTITY_V2_ENABLED=false --config prd`
(or delete the key) + redeploy → back to legacy reads. Safe as long as the legacy tables still
exist (i.e. before #11).

**Soak:** runbook calls for 24h flag-on soak before #11. On an empty/pre-launch prod the soak's
value is limited (no live traffic to observe) — operator's call whether to compress it.

---

## §5 — DROP (#11 / C8) — OPERATOR-ONLY — irreversible (except PITR)

`apps/api/drizzle/_freeze-only/0118_m_drop.sql` (`-- @freeze-only`). The exact statements:

```sql
DROP TABLE IF EXISTS consent_states, family_links, profiles, accounts;
DROP TYPE  IF EXISTS consent_status, consent_type, location_type;
```

- **4 tables, 3 enums.** `subscriptions` + `subscription_status` + `subscription_tier` are
  **RETAINED** (billing subsystem → WI-805, post-flip).
- **Precondition:** §3 repoint must have run first (else the plain DROP fails loud on a dangling FK).
- **Precondition (redeploy-before-DROP):** redeploy the worker immediately before the DROP so no long-lived process holds a stale `legacyTableExistsCache` `true` (the `createIdentityGraph` bridge in `identity-v2/identity-graph.ts` caches legacy-table existence per process; a process that probed pre-DROP could attempt a dual-write to a dropped table until it restarts). On Cloudflare Workers (ephemeral isolates) + an empty/pre-launch prod this is near-nil exposure, but it matters for any future cutover with live traffic. `clearLegacyTableCache()` (same file) is the in-code/test hook; redeploy is the operational mitigation. (WI-847, 2026-06-19.)
- **Recovery:** none in place — only a Neon PITR rewind to the §2 snapshot. **On an empty prod,
  there is no data to lose** — the irreversibility is structural (schema), not data.

Apply via the same path as §3 — simplest is `psql "$PROD_URL" -f apps/api/drizzle/_freeze-only/0118_m_drop.sql` — after the §4 STOP gate (repoint §3 must have run first, else the DROP fails loud on a dangling FK).

---

## §6 — POST-DROP SMOKE (C9)

`_wip/identity-foundation/scripts/flag-on-route-smoke.mjs` — fires flag-on GET/PUT at every
parent/child route, asserts no 5xx. **Requires a post-drop DB + worker flag-on + a live Clerk JWT
+ a seeded owner/child profile.** Meaningful on **staging** (has data) during the rehearsal; on an
empty prod it has nothing to exercise until prod has users.

```bash
node _wip/identity-foundation/scripts/flag-on-route-smoke.mjs \
  --base-url https://<worker-url> --token "<clerk-jwt>" \
  --owner "<owner-profile-id>" --child "<child-profile-id>"
```

---

## Sequence map (steps → gate owner)

| Step | Action | Owner | Prod blast radius (empty) |
|---|---|---|---|
| C0/C1 | Freeze (READONLY → BLOCK_INNGEST) | operator | none (hygiene) |
| C2 / #6 | Neon snapshot branch | orch (delegated) | n/a |
| C2–C5 | Disposal → reseed → parity | — | **no-op (0 rows)** |
| C6 | Repoint FKs (0117, regenerated) | operator | schema-only |
| **C7 / #8** | **Flip `IDENTITY_V2_ENABLED=true`** | **operator** | none (0 users) |
| — | 24h soak | operator | limited value (no traffic) |
| **C8 / #11** | **DROP 4 tables + 3 enums (0118)** | **operator** | **0 rows lost** |
| C9 | Post-drop route smoke | operator | n/a until prod has data |

> The full data path (disposal/reseed/parity) is exercised on **staging** (has data) as the
> rehearsal — that is where these scripts earn their keep before prod gains data at launch.
