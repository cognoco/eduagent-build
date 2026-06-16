# WI-586 — Staging Cutover Execution Handoff (2026-06-14)

> **Purpose.** Resume the WI-586 identity convergence in a fresh session without losing a
> beat. The *substance* lives in durable artifacts (cited below); this file captures the
> **session-specific decisions, current position, and live state** that aren't in those docs.
> Read this first, then the cited artifacts, then continue from **step 1**.

## Your role — READ THIS FIRST
You are the **orchestrator / control point of the `eduagent-build` pre-launch umbrella
program** (operator = **Jorn**). Structure: Program → Initiatives (`PRG-NN`) → Cosmo
Workstreams → Work Items. Standing responsibilities:
- **Program tracking** — the roster (`_wip/umbrella-program/program-roster.md`), the
  dashboard (`_wip/umbrella-program/dashboard.html`), the Stream-2 drain backlog
  (`_wip/umbrella-program/stream-2-backlog.md`), `planning-reference.md`, and checkpoints.
- **Lane coordination** — spin up / coordinate shepherd + executor lanes via the file-based
  channel (`_wip/<lane>/_state/{inbox,outbox}.jsonl`): **you rule + relay operator decisions,
  shepherds execute, a separate reviewer closes.** All lanes are **currently closed**
  (PRG-10 + PRG-14 graduated), so there is **no live channel traffic** right now.
- **Operator partnership** — surface decisions; gate irreversible / prod / outward-facing
  actions on Jorn's explicit go.

**Active focus this session: execute WI-586** (the identity convergence, below) — currently the
*only* live thread. If a program-level matter arises, handle it as orchestrator (orient from the
program docs above); otherwise proceed with the 586 staging cutover.

## Where we are (current position)
- About to execute the **staging cutover** — the first real convergence run. It doubles as
  staging's required cutover AND the rehearsal for prod.
- **Approved cadence:** run **steps 1–7 as a block**, report each step, **HALT at the flip
  (step 8)** and hand to the operator. Operator can halt mid-stream anytime.
- Nothing destructive has been run yet. Steps 1–7 are all reversible.

## The decision: rehearse on STAGING, not dev (ruled 2026-06-14)
- **Dev is patchwork / not a clean start:** journal=22 (dev is `db:push:dev`-managed, so the
  journal is stale), `person`/`organization` present but `consent_request` (0114) **absent**,
  0116 index applied (shepherd patched it during WI-738). Rehearsing there needs prep AND
  wouldn't mirror prod. **Off the critical path** (reconcile later via push + its own cutover).
- **Staging is clean + prod-shaped:** journal=116, reconciled to a true-116 during BUG-12
  (0115 reseed ran, 0116 applied), legacy live as system-of-record, new model populated,
  `IDENTITY_V2_ENABLED` off. Best prod proxy. Its cutover is a required plan step anyway.

## The staging cutover sequence (R = reversible, GATE = operator)
| # | Step | Who | What | Reversible? |
|---|------|-----|------|-------------|
| 1 | Pre-flight | agent | Re-confirm start state + baseline `verify-identity-reseed.mjs` (read-only) | R |
| 2 | Freeze | agent | `MAINTENANCE_READONLY` + `MAINTENANCE_BLOCK_INNGEST` in Doppler stg (config.ts:185-186). **Verify wiring** — may need a worker resync/redeploy to take effect | R (unset) |
| 3 | Pre-cutover marker | agent | Record Neon staging restore point (timestamp) for whole-cutover rollback | R (safety) |
| 4 | Ownerless disposal | agent | Remove orphan legacy rows that shouldn't carry forward (cutover-plan §4 step 3 — **confirm exact query at execution**) | R-ish |
| 5 | Final reseed | agent | Re-run `0109` + `0115` reseed DO-blocks (idempotent/convergent) | R (additive) |
| 6 | **Verify** | agent · **GATE** | `verify-identity-reseed.mjs` must **exit 0**. Fail → STOP | R (read-only) |
| 7 | M-REPOINT | agent | Run `pending-migrations/m-repoint.sql` DO-block vs staging → re-point ~58 FKs (54→person, 4→subscription) + completeness assertion. Catalog-driven/idempotent | R while frozen |
| | — — — | | *above reversible; flip is the turning point* | |
| 8 | **FLIP** | **OPERATOR · GATE** | `IDENTITY_V2_ENABLED=true` in Doppler stg + **redeploy staging worker**. After this, rollback = snapshot-rewind only | rewind-only |
| 9 | Soak + smoke | agent | Exercise staging on new model (health + key flows) | — |
| 9.5 | **Pre-drop snapshot** | agent/operator | **Explicit Neon branch** of staging (durable, non-expiring) — OR `pg_dump` the 5 legacy tables if Neon API not wired. Makes step 10 recoverable | safety |
| 10 | **M-DROP** | **OPERATOR · GATE** | Run `pending-migrations/m-drop.sql` → drop 5 legacy tables + 5 enums. **Recoverable only by rewinding to the step-9.5 snapshot** (loses post-snapshot writes) | snapshot-rewind only |
| 11 | Grep-clean + verify | agent | Confirm no code references dropped tables; run integration suite vs post-drop staging | — |

**Gates needing the operator:** step 6 (verify auto-stops on fail), **step 8 flip** (Doppler flag + staging redeploy), **step 10 drop-go** (after the 9.5 snapshot).

### Neon-snapshot refinement (ruled 2026-06-14)
M-DROP is **not** absolutely irreversible — with an explicit Neon branch (preferred; durable,
unlike a PITR timestamp bounded by retention) or a `pg_dump` of the 5 legacy tables taken at
**step 9.5 (just before the drop)**, it is recoverable via rewind. "Recoverable" still = a
rewind that discards post-snapshot writes — nearly free on frozen staging, costly on prod (so
it stays a serious gate there). Verify whether `neonctl`/`NEON_API_KEY` is available; `pg_dump`
of the 5 tables is the no-API fallback.

## Live environment state (as of 2026-06-14)
- **Staging** — endpoint `ep-fancy-cherry-agyi8ssc-pooler`; journal **116** (reconciled);
  0115 reseed applied, 0116 unique index applied; `IDENTITY_V2_ENABLED` off. **Ready for cutover.**
- **Prod** — endpoint `ep-holy-leaf-ag0rtn17`; **0108–0116 applied** via the BUG-12 deploy
  (additive, flag off); `IDEMPOTENCY_KV` bound on `mentomate-api-prd`; **placeholder webhook
  secrets** (`RESEND_WEBHOOK_SECRET`/`REVENUECAT_WEBHOOK_SECRET`) in Doppler prd — real values
  are a **pre-launch blocker**, tracked in two `Captured` Cosmo WIs (Work Items DB
  `collection://36fd1119-9955-4684-8bfe-deb145e6a21f`). Flag off. **Prod cutover is LAST**, after staging soak.
- **Dev** — patchwork (see decision above); off critical path.

## Closed this session (no live watchers to lose — favors fresh start)
- **BUG-12** closed (prod KV binding live, prod healthy).
- **PRG-10 fast-follow** graduated (WI-734–739 all Closed).
- **PRG-14** graduated (WI-741–746 Closed); content fixes (a)+(b) landed in `25ed39a20`;
  only (c) gha-inventory nit + the skill lean-pointer rework carried to **Stream 2**
  (`_wip/umbrella-program/stream-2-backlog.md`).
- No active shepherds; channel mailboxes (`_wip/*/_state/`) are quiescent.

## Durable artifacts to read on resume
- `_wip/identity-foundation/2026-06-11-cutover-plan.md` **§4** (runbook), **§2.7** (M-REPOINT catalog generator), **§4.2** (rollback truth table)
- `_wip/identity-foundation/wi586-readiness-2026-06-14.md` (12/12 readiness; orphan re-homes B1–B7)
- `_wip/identity-foundation/pending-migrations/{m-repoint.sql, m-drop.sql, README.md}` (inert drafts — for the staging rehearsal run the DO-blocks directly via psql; **promote to numbered migrations 0117/0118 for the prod run** via `drizzle-kit migrate`)

## Operational constraints (carry forward)
- Secrets via **Doppler**: `doppler run --config <dev|stg|prd> --project mentomate -- <cmd>`.
  **Never print secret values.** Doppler ≠ Infisical.
- DB access: `doppler run --config <env> --project mentomate -- bash -c 'psql "$DATABASE_URL" ...'`.
- **rtk caveat:** rtk's token-compression mangles exact strings — for precise names (endpoints,
  constraint names, SQL) read **natively**, not via rtk-filtered grep.
- Commits via the **commit skill** (own-work scope; never `git add -A`; on push reject do
  `git pull --no-rebase --no-edit` then re-push; never rebase/force-push pushed commits).
- Cloudflare/Neon: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` are in Doppler (used for
  the wrangler/CF-API work); prod deploys are manual `gh workflow run deploy.yml -f
  api_environment=production` + a **double** GitHub `production` environment approval.

## First action on resume
Run **steps 1–7 as a block**, reporting each, and **halt at the flip (step 8)** for the operator.
