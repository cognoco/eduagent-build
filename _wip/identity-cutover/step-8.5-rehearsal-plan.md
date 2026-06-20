# Step-8.5 Post-Drop Flag-On Route-Smoke — Rehearsal Plan (READY-TO-FIRE; HOLD for operator GO)

> **Status: PLAN ONLY. Do NOT execute.** ic-orch-093 holds all DB-destructive work at the
> code→execution boundary until an explicit OPERATOR execution-phase GO. Every step below that
> touches a real DB is gated. Drafted by shepherd (PRG-06) per ic-orch-093 safe-prep authorization.

## Why this rehearsal exists (the gap)
The 586 **staging** cutover already ran on 2026-06-14 (flip @20:41Z, M-DROP @21:04Z; operator Jorn) —
see `_wip/identity-foundation/586-staging-cutover-execution-log.md`. But its post-flip/post-drop smoke was
**narrow** (`/v1/health` 200, consent-page 400, auth-gate 401 — 3/3). It did **NOT** exercise the broad
flag-on reader surface that **WI-809** later gated, because those fixes did not exist on 2026-06-14. So a
real post-drop request to (e.g.) a dashboard child route or the GDPR export would have 500'd on the dropped
tables back then. **Step-8.5 = the broad flag-on post-drop route-smoke that proves WI-809 + WI-810 actually
prevent the 500s** — the runtime backstop to the static completeness audit (which "missed twice").

The current `-c stg` DB is NOT a valid target: it has **drifted** past 0118 — it dropped legacy
`subscriptions` too (a WI-805 table, not in 0118). The reused legacy `generateExport` reads `subscriptions`
unconditionally (export.ts; WI-805 scope, deliberately not gated by WI-809), so the export path 500s on the
drifted DB with a *misleading* `relation "subscriptions" does not exist`. The rehearsal needs a **0118-EXACT**
DB: the 4 identity tables DROPPED **and** `subscriptions` PRESENT.

---

## (a) Staging rebuild to 0118-EXACT (subscriptions PRESENT) — GATED
Goal state: `accounts`, `profiles`, `family_links`, `consent_states` **dropped**; ALL v2 identity tables
(`person`, `organization`, `membership`, `guardianship`, `supportership`, `consent_request`, `consent_grant`,
`login`, `subscription`) present + populated; legacy `subscriptions` + `quota_pools` + learning tables
**present**; FKs re-pointed (0117 M-REPOINT applied).

Two options (operator picks; both NON-prod):
1. **Fresh Neon branch from a pre-cutover snapshot** (preferred — clean + disposable):
   - Create a Neon branch off the staging branch's pre-586-flip PITR point (marker `20:21:45Z` / LSN
     `0/4B6744C8`, recorded in the execution log) → gives legacy-intact + v2-present + subscriptions-present.
   - Apply `0117_m_repoint` then `0118_m_drop` (the freeze-only migrations) against that branch with
     `ALLOW_FREEZE_MIGRATIONS=true` (the guard added in WI-586 TASK-B; the migrations live in
     `apps/api/drizzle/_freeze-only/`). 0118 drops ONLY the 4 identity tables — `subscriptions` is RETAINED
     by design (its drop is WI-805's `m-drop` follow-on, not 0118).
   - Result = 0118-exact. Point a throwaway staging worker / the test harness `DATABASE_URL` at this branch.
2. **Re-align the current drifted stg** (only if option 1 is impractical): restore `subscriptions` (+ its FKs
   `quota_pools.subscription_id`) from the 2026-06-14 pre-drop dump
   (`~/eduagent-cutover-backups/586-staging-pre-drop-legacy-2026-06-14.sql`, schema-only for subscriptions),
   leaving the 4 identity tables dropped. Riskier (hand-surgery on a live drifted DB) — prefer option 1.

**Verify rebuild before smoke (read-only):**
`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN
('accounts','profiles','family_links','consent_states','subscriptions','subscription','person','membership',
'guardianship','consent_grant','quota_pools');`
→ EXPECT absent: accounts/profiles/family_links/consent_states. EXPECT present: subscriptions + all v2 +
quota_pools. (This is the exact probe shape used during WI-809 to detect the drift.)

## (b) Pre-rehearsal Neon snapshot (safety / rollback) — GATED
- **Preferred:** `neonctl branches create --project-id lingering-violet-30592106 --name step85-rehearsal-pre
  --parent <staging-branch>` — instant, disposable rollback target. (NOTE: the 2026-06-14 run recorded
  neonctl/API as **unavailable** — if still so, fall back to PITR.)
- **Fallback (PITR):** record `T_pre = now()` + LSN immediately before any destructive step; Neon PITR can
  rewind to it. Also keep the durable `pg_dump` of the legacy tables (already exists from 9.5).
- For a rehearsal on a throwaway branch (option 1a), the branch itself IS the snapshot — drop the branch to
  reset. No prod exposure.

## (c) Broad flag-on post-drop route-smoke spec — the actual test
Against the 0118-exact DB with `IDENTITY_V2_ENABLED=true`, seed a minimal v2 graph (org + owner person +
admin membership + login; child person + learner membership + guardianship(owner→child) + a CONSENTED GDPR
`consent_grant`; a subject + a learning_session for the child), then hit each swept WI-809 endpoint and
assert **no 500** (and the documented happy-path status). The endpoints (the WI-809 fixed surface):

| Surface | Endpoint(s) | flag-on path under test | PASS |
|---|---|---|---|
| nudge | `POST /v1/nudges` (guardian→child) | consent gate → isGdprProcessingAllowedV2 | 200/201, push attempted |
| dashboard | `GET /v1/dashboard/children/:id` (child-detail) + `/progress-summary` + `/inventory` + `/weekly-reports/:rid/view` + the 5th assert route | assertChildDashboardDataVisible(opts) + getChildDetail GDPR-pin | 200 (or 403 redacted, NOT 500) |
| learner-profile | `GET /v1/learner-profile/:id` + `/export` + `POST .../tell` + `.../me` | assertChildDashboardDataVisible(opts) + parseLearnerInput→applyAnalysis gate | 200, NOT 500 |
| consent | `POST /v1/consent/request` + `POST /v1/consent/resend` | getOrgMemberDisplayNameV2 (org+not-archived) | 200 for in-org child; 403 for out-of-org/absent (NOT 500, NOT existence-oracle) |
| export | `GET /v1/account/export` (owner) | generateExportV2 → generateExport(learningOnlyProfileIds) | 200, full DataExport (account/profiles/consent/family from v2; learning + subscriptions present) |
| Inngest: freeform-filing | trigger `freeformFilingRetry` for the seeded session | isIdentityV2EnabledInStep → isGdprProcessingAllowedV2 | filed/skipped, NOT thrown |
| Inngest: session-completed | trigger for the seeded session | applyAnalysis opts → v2 GDPR gate | completes, NOT thrown |
| Inngest: quota-reset (WI-810) | invoke `quotaReset` (or wait for cron) | monthly reset → resetExpiredQuotaCyclesV2 (joins v2 `subscription`) | completes, monthlyResetCount returned, NOT FK/500 |

**Negative corroboration (optional, high-value):** temporarily flip a single fixed reader back to its legacy
form on the rehearsal branch → confirm it 500s with `relation "<dropped table>" does not exist` → restore.
Proves the smoke is non-vacuous (catches an un-gated reader). This mirrors the per-fix red-green WI-809 used.

**Harness:** extend the existing `deploy.yml` post-flip smoke assertions (the 3/3 narrow set) with the table
above, OR run the WI-809 integration suites against the 0118-exact branch with
`IDENTITY_POST_DROP=1 EXPORT_V2_INTEGRATION_READY=1` (now that subscriptions is present, the export-v2 suite
activates) — those 6+ post-drop tests ARE the codified version of this smoke.

## (d) §4 cutover sequence + gate ownership + go/abort
Runbook: `docs/.../2026-06-11-cutover-plan.md §4` (referenced by the execution log). Step numbering from the
2026-06-14 staging execution log (map to the orch's #-gates noted):

| Step | Action | Owner / gate |
|---|---|---|
| 1 Pre-flight | read-only baseline + verify-reseed | agent (read-only) |
| 2 Freeze | `MAINTENANCE_READONLY=true` + `MAINTENANCE_BLOCK_INNGEST=true`, redeploy | **orch under conditions (#4-class)** |
| 3 Pre-cutover marker | record PITR marker/LSN | agent |
| 4 Ownerless disposal | dispose ownerless rows | orch under conditions |
| 5 Final convergent reseed | `0109` + `0115` reseed | orch under conditions |
| 6 Verify (GATE / STOP-1) | `verify-identity-reseed.mjs` EXIT 0 | **orch under conditions (#6 STOP-1)** — HALT if non-zero |
| 7 M-REPOINT | `0117` FK re-point | orch under conditions |
| **8 FLIP** | Doppler `IDENTITY_V2_ENABLED=true` + unfreeze + redeploy | **OPERATOR-ONLY (#8)** |
| 9 Soak | post-flip smoke + key flows on v2 | agent (read-only smoke) |
| **8.5 (this plan)** | **broad flag-on post-drop route-smoke** | agent runs; **on the 0118-exact rehearsal branch only** |
| 9.5 Pre-drop snapshot | `pg_dump` 5 legacy tables / Neon branch | agent |
| **10/11 M-DROP** | `0118` drop the 4 identity tables | **OPERATOR-ONLY (#11)** |
| 11 Grep-clean | delete legacy code + flag, integration green | separate code PR (WI-808-ish) |

**Sequencing note:** step-8.5 (broad smoke) logically belongs **between FLIP (#8) and M-DROP (#11)** in a real
run — but it can ONLY validate the post-drop readers on a DB where the drop has happened. Hence the rehearsal
on a 0118-exact **branch** (drop already applied there) BEFORE the real prod #8/#11. Greenlight the real #11
only after step-8.5 is green on the rehearsal branch.

**Go / Abort criteria:**
- **GO to real #8 flip:** step-8.5 GREEN on the 0118-exact rehearsal branch (all rows in (c) PASS, negative
  corroboration shows a reverted reader 500s) + step-6 verify GATE EXIT 0 + pre-flight clean. Operator-initiated.
- **GO to real #11 M-DROP:** post-flip soak (step 9) green on prod v2 + 9.5 snapshot taken + step-8.5 already
  proven on the rehearsal branch. Operator-initiated.
- **ABORT (any gate red):** R1 (pre-drop, agent-executable: re-freeze → reverse-repoint → unfreeze → verify
  legacy smoke; no PITR, no data loss). Post-drop → R2 (operator PITR to `T_drop`). Full abandon → R3
  (operator PITR to pre-cutover marker). Cross-flip caveat: `IDENTITY_V2_ENABLED` + `MAINTENANCE_*` live in
  Doppler/worker secrets, NOT the DB — PITR does not revert them; reset manually.

---
## What I am NOT doing (the HOLD)
No migrations, drops, pushes, reseeds, freezes, or flag-flips against any real DB. No Neon branch creation, no
PITR. This document is read-only/planning. Execution waits on the explicit operator execution-phase GO relayed
through the orchestrator. #8 flip + #11 drop are OPERATOR-ONLY regardless.
