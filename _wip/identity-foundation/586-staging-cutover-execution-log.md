# WI-586 — Staging Cutover Execution Log

> Live evidence trail for the staging convergence run. Cadence: steps 1–7 as a block,
> **halt at the flip (step 8)** for the operator. Runbook: `2026-06-11-cutover-plan.md` §4;
> session runbook: `586-staging-cutover-handoff.md`. Endpoint: `ep-fancy-cherry-agyi8ssc-pooler`
> (`neondb`). All times UTC.

## Step 1 — Pre-flight (read-only) ✓
- `IDENTITY_V2_ENABLED` = unset → **off** (correct start state).
- Baseline `verify-identity-reseed.mjs`: **EXIT 1, 12 integrity checks failed** — expected
  pre-freeze drift. New model ~35% populated vs legacy (524 accounts / 184 org; 509 profiles /
  182 person), because legacy is system-of-record and rows accrued since the one-time 0115 reseed
  with no live dual-write. This is exactly what freeze → final convergent reseed → gate-verify closes.
- Ownerless-account profile (disposal target): **111 total** (96 with a non-owner profile, 15
  zero-profile), oldest 2026-05-31, newest today, **107/111 created in last 14 days** →
  confirmed test/seed churn (staging has no real users). Plan's "6 test artifacts" note (2026-06-11)
  is a stale count; population class is unchanged.
- Tooling: `neonctl` NOT installed, `NEON_API_KEY` UNSET (stg) → marker = recorded ts+LSN (PITR),
  pre-drop branch (step 9.5) will need the `pg_dump` fallback. `CLOUDFLARE_API_TOKEN`/`_ACCOUNT_ID` SET.
- Freeze wiring: `maintenance.ts` gate (above auth) 503s all except `/v1/health` (+`/v1/inngest`
  until stage 2). Reaches worker via Doppler→worker secret sync. Local full `secrets:sync` blocked
  (render needs `CF_ACCOUNT_ID` + subscription/coaching KV ids that live as GH-Actions secrets, not
  in Doppler stg) → activated surgically via `wrangler secret put --name mentomate-api-stg` from a
  no-toml dir with `CLOUDFLARE_ACCOUNT_ID` env.
- Staging `Deploy` pipeline: GREEN on last 5 runs (readiness-doc failures since resolved).

## Step 2 — Freeze ✓
- Pre-freeze HTTP baseline: `/v1/health 200`, `/v1/ 401`, `/v1/profiles 401`.
- Stage 1 `MAINTENANCE_READONLY=true`: set in Doppler stg + pushed to worker. Verified (instant):
  `/v1/health 200`, `/v1/ 503`, `/v1/profiles 503`, `/v1/inngest 200` (open for drain);
  503 body `SERVICE_UNAVAILABLE` + `Retry-After: 120`.
- Stage 2 `MAINTENANCE_BLOCK_INNGEST=true`: set in Doppler stg + pushed to worker. Verified:
  `/v1/inngest 503`, `/v1/health 200`.
- **Prod-fidelity caveat:** between stage 1 and stage 2 the operator must confirm Inngest queue = 0
  on the dashboard. Staging is a quiescent rehearsal env, so stage 2 was set directly here.

## Step 3 — Pre-cutover marker ✓
- Neon staging restore point: **ts `2026-06-14 20:21:45.092473+00`**, **WAL LSN `0/4B6744C8`**, db `neondb`.
- Rollback mechanism through step 6: Neon PITR-to-timestamp (no Neon branch — neonctl/API unavailable).
  Restore must occur within the project's PITR retention (operator-confirmable in Neon console;
  not a concern for a minutes-scale staging rehearsal).

## Step 4 — Ownerless disposal ✓
- Sanctioned query (plan §4 step 3) in a transaction. accounts **524 → 413** (`DELETE 111` —
  exactly the characterized ownerless set), profiles **509 → 413** (96 non-owner profiles
  cascade-removed), **ownerless_remaining = 0**. Committed.

## Step 5 — Final convergent reseed ✓
- `0109_identity_reseed.sql` then `0115_identity_cutover_reseed.sql` run directly via psql
  (both confirmed comment-preamble + single idempotent `DO` block). Both returned `DO`, no errors.

## Step 6 — Verify (GATE) ✓ — EXIT 0
- All 26 integrity checks ✓; all exceptions = 0. Converged inventory: accounts 413 = organization 413;
  profiles 413 = person = login = membership 413; family_links 8 = guardianship 8;
  consent_states 5 = consent_request 5; consent (CONSENTED|WITHDRAWN) 3 = consent_grant 3;
  subscriptions 0 = subscription 0; knowledge_assertions 413 (one per person).

## Step 7 — M-REPOINT (FK re-point) ✓
- `m-repoint.sql` DO-block run directly (staging rehearsal). Completeness assertion passed.
- PRE: live FKs targeting legacy parents = profiles **54**, subscriptions **4** (matches expected 58).
- POST: **0** live FKs target legacy parents; new parents now person **67** (54 re-pointed + 13
  pre-existing new-model FKs), subscription **5** (4 + 1).
- Reversible NOW (still frozen): clean reverse re-point (inverse mapping) OR Neon PITR to the step-3 marker.

---

## Step 8 — FLIP ✓ EXECUTED 2026-06-14 ~20:41Z (operator: Jorn — explicit go)
**Result:** Doppler stg + worker set `IDENTITY_V2_ENABLED=true`, `MAINTENANCE_READONLY=false`,
`MAINTENANCE_BLOCK_INNGEST=false` — v2 set **while still frozen**, then unfrozen (controlled order).
Verified (instant): `/v1/health 200`, `/v1/ 401`, `/v1/profiles 401` (was 503), `/v1/inngest 200`;
health `deploySha 96e03c3b`, providers up; all three flags present on the worker.
**Staging now serves on the new identity model.** Rollback is now **PITR-only** (marker above) —
cheap on staging (test writes only).

### Pre-flip context (historical)
Steps 1–7 complete; staging was **frozen** (503 on everything but `/v1/health`) and internally
consistent on the new model. This was the last clean-abort point — past the flip, rollback is PITR-only.

**The flip (operator-owned):** in Doppler stg set `IDENTITY_V2_ENABLED=true`, set
`MAINTENANCE_READONLY=false` + `MAINTENANCE_BLOCK_INNGEST=false` (unfreeze), then redeploy the
staging worker so reads+writes land on the new model and the freeze lifts. (Cleanest single action:
set the three Doppler flags, then `gh workflow run deploy.yml -f api_environment=staging` — the deploy
syncs Doppler→worker and its post-deploy smoke runs against the now-unfrozen v2.)

**Clean abort instead (still available now):** reverse re-point + unset maintenance flags → back on
legacy; or Neon PITR to ts `2026-06-14 20:21:45.092473+00` / LSN `0/4B6744C8`.

After the flip: Step 9 soak (smoke + key flows on v2), Step 9.5 pre-drop snapshot (pg_dump fallback —
neonctl unavailable), Step 10 M-DROP (operator gate), Step 11 grep-clean + integration suite.

## Step 9 — Soak — STARTED 2026-06-14 ~20:42Z
- **Post-flip smoke (deploy.yml assertions) vs live v2 worker: 3/3 PASS** —
  `/v1/health 200` (status ok), `/v1/consent-page 400` (public route mounted), `/v1/sessions/resume-nudge 401`
  (auth gate). Worker healthy on v2, no crash, routes + auth intact.
- **Still to validate over the soak (authenticated v2 flows):** sign-in → profileMeta resolves from
  the new model; onboarding creates the v2 graph; consent request→approve round-trip; Stripe/RevenueCat
  webhook replay; quota metering; one Inngest cron cycle.
  - **Blocker for LOCAL e2e:** the web smoke launches `wrangler dev`, which needs a rendered
    `wrangler.toml` (`CF_ACCOUNT_ID` + subscription/coaching KV ids — GH-Actions secrets, absent from
    Doppler stg). Same gap that blocked local secret-sync. Reliable harness = **CI e2e** (renders toml)
    via a staging deploy or the CI pipeline.
- **Soak compressed (operator ruling 2026-06-14):** zero customers, app not in production → no
  customer-safety wait. Smoke (3/3) + verify `EXIT 0` accepted as sufficient soak. Tradeoff
  acknowledged: deep authenticated v2 e2e was NOT run (local harness blocked by KV-id gap); a v2
  auth-flow bug would surface post-drop and need a PITR rewind — cheap on staging (test data only).

## Step 9.5 — Pre-drop snapshot ✓
- `pg_dump` of the 5 legacy tables (schema+data) → `/Users/vetinari/eduagent-cutover-backups/586-staging-pre-drop-legacy-2026-06-14.sql`
  (164 KB, 5 tables, 5 COPY data blocks; stored outside the repo — contains staging PII).
  Makes M-DROP recoverable at table-level without a full-DB PITR rewind.

## Step 10 — M-DROP ✓ EXECUTED 2026-06-14 ~21:04Z (operator: Jorn — go)
- **T_drop PITR point:** ts `2026-06-14 21:03:54.226648+00` / LSN `0/4B88BC00` (recorded immediately pre-drop).
- `DROP TABLE` + `DROP TYPE` succeeded. Verified: legacy_tables_remaining **0**, legacy_enums_remaining **0**;
  new model intact (person 413, organization 413, subscription 0).
- **Post-drop smoke 3/3 PASS** (health 200/`ok`, consent-page 400, auth-gate 401). v2 worker unaffected by the drop.
- Rollback from here: dump-restore (R2 data-only) or operator PITR to `T_drop`/marker.

## Step 11 — Grep-clean + integration suite — PENDING (separate code PR)
Delete legacy schema/code (legacy table defs, `account-repository.ts`, legacy twin modules/seams),
**retire the `IDENTITY_V2_ENABLED` flag** (v2 becomes the only path), update docs (architecture/project_context/
audience-matrix/AGENTS + canon data-model annotation), archive stale memory. Acceptance: repo-wide grep clean,
full suite + 51 integration suites green. This is a code change — should be branched/planned, not an infra step.

## Rollback Plan (this run — concrete, staging)
**Recovery assets:** (1) durable pre-drop dump `~/eduagent-cutover-backups/586-staging-pre-drop-legacy-2026-06-14.sql`
(retention-independent); (2) Neon continuous PITR — marker ts `2026-06-14 20:21:45.092473+00` / LSN `0/4B6744C8`
(pre-flip), plus any timestamp within Neon retention.
**Who does what:** agent can run reverse-repoint, dump-restore, flag resets, worker redeploy via psql/wrangler;
**Neon PITR rewind is an operator action in the Neon console** (no neonctl/API key on this host).
**Cross-flip caveat:** `IDENTITY_V2_ENABLED` + `MAINTENANCE_*` live in Doppler/worker secrets, NOT the DB —
PITR does **not** revert them; any cross-flip rollback must manually reset them.

### R1 — Abort now (pre-drop) → back to legacy  [agent-executable, no PITR, no data loss]
1. Re-freeze: Doppler stg `MAINTENANCE_READONLY=true` + push to worker.
2. Reverse the FK re-point: inverse of `m-repoint.sql` (`person→profiles`, `subscription→subscriptions`) —
   clean because legacy still holds system-of-record and step-6 verify proved row-parity.
3. `IDENTITY_V2_ENABLED=false` (Doppler + worker).
4. Unfreeze (`MAINTENANCE_*=false` + worker redeploy). 5. Verify smoke green on legacy.

### R2 — After M-DROP → recover dropped tables
Pre-req: record `T_drop = now()` immediately before running M-DROP.
- **Data-only** (inspect/repair) [agent]: `psql "$DATABASE_URL" < <dump>` → 5 tables + data back (FKs stay on new model).
- **Full undo of the drop** [operator PITR]: rewind to `T_drop` → restores flipped+converged+legacy-intact ("back to now"); then R1 if also undoing the flip.

### R3 — Abandon entire cutover → pre-cutover state  [operator PITR + agent flags]
1. Re-freeze. 2. Operator: Neon PITR rewind to marker `20:21:45` / LSN `0/4B6744C8`.
3. Reset flags `IDENTITY_V2_ENABLED=false`, `MAINTENANCE_*=false` (Doppler + worker). 4. Redeploy; verify legacy smoke.

All rungs cheap on staging (test data only). PITR rungs need Neon retention to cover the window; the dump is the
retention-independent backstop.
