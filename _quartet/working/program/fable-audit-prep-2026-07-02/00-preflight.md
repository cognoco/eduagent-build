# 00 — Preflight Record

> **Freshness:** this file records the *original* session-start context (recon began at
> `a52b8282f`). The bundle is FROZEN at `origin/main` = `145e74d5e`; see
> `05-audit-response.md` § Frozen Anchor. The SHAs below are historical and correct as of run.

**Prep agent run:** 2026-07-02
**Handover:** `_quartet/working/program/fable-audit-prep-handover.md`
**Output dir:** `_quartet/working/program/fable-audit-prep-2026-07-02/`

## 1. Execution context (git)

| Item | Value |
| --- | --- |
| Repo path | `/Users/vetinari/nexus/_dev/eduagent-build` |
| Remote | `origin → https://github.com/cognoco/eduagent-build.git` |
| Working-tree HEAD | `d843bf7bd4f449b21ee31d9e6c6ff8283b6ee5c8` (branch `main`) |
| `origin/main` tip | `a52b8282f5475bbf8bfd1fce8d727d14e5201aef` (fetched 2026-07-02T10:00Z) |
| HEAD vs origin/main | **HEAD is 5 commits BEHIND, 0 ahead** (clean ancestor) |

**Anomaly — `core.bare=true`:** this checkout's `.git/config` has `core.bare = true`, so
`git status` / `git rev-parse --show-toplevel` fail with "must be run in a work tree".
Worked around with `git -c core.bare=false … status` (via `GIT_DIR=.git GIT_WORK_TREE=.`).
`log`/`diff`/`rev-parse HEAD`/`show` work regardless. **This is a local-checkout config
quirk, not a prod fact** — but flag to Fable: it can mask uncommitted state from tools that
don't override it.

**Decision — audit "current reality" is pinned to `origin/main` (`a52b8282f`), not the stale
working tree.** The 5 missing commits land squarely on the audit target:

```
a52b8282f fix(api): reroute v1-pinned scheduledDeletion to v2 — P1 live prod 500 + GDPR erasure gap [WI-1255]
666127c28 fix(api): audit + Stripe teardown on consent-deny payer subscription [WI-...]
2e9942dcf docs(v2-plan): retract WI-1170 silent-scope-narrowing finding [WI-1170]
069d7bdfd docs(v2-plan): add WI-1175 publish-readiness review [WI-1175]
2b7fdf876 fix(tooling): WI-1246 guard /commit fork against shared-main landings (#1802)  ← already in working tree
```
Touch `apps/api/src/services/identity-v2/{deletion-v2,consent-v2}.ts`,
`apps/api/src/inngest/functions/account-deletion.ts`, `services/billing/store-teardown.ts`,
and add `docs/…/2026-06-30-v2-publish-readiness-canonical-plan.md`.
Read changed files via `git show origin/main:<path>` when they matter. **No branch switch**
(shared checkout; `feedback_never_switch_branch`).

Working tree is otherwise dirty with Quartet channel logs / memory files / untracked WI
artifact dirs (expected on this orchestration checkout; not audit-relevant except §11 logs).

## 2. Exclusion acknowledgement (§1)

The following are present in the working tree (untracked) and were **NOT read**:

- `_wip/identity-cutover/2026-07-01-identity-cutover-779-strip-proposal.md`
- `_wip/identity-cutover/strip-proposal-critique.md`

WI-779 / WI-1239 appear as **work-item IDs** in channel logs and migration comments; those
are treated as allowed primary references (the raw Cosmo WI-779 record is §1-allowed). No
excluded-analysis substance was ingested. Contamination scan runs before handoff (§12).

## 3. Tooling

All present: `doppler` (`/opt/homebrew/bin/doppler`), `psql`, `node`, `pnpm`, `jq`, `gh`,
`rg`, `fd`.

## 4. Environment DB access

Doppler project `mentomate`, configs: `dev`, `dev_personal`, `stg`, `prd`.
`DATABASE_URL` present and `psql`-reachable in **dev, stg, prd** (verified; no values printed).

## 5. Deviations from handover

1. **§4.2 FK query SQL bug fixed.** Handover's `ORDER BY source_table::text` is rejected by
   Postgres (`::text` forces alias→base-column resolution). Changed to
   `ORDER BY conrelid::regclass::text, conname`. Identical result set. See
   `queries/staging-fk-targets.sql`.
2. **Scope extended dev + prd.** Handover §4.1/§4.2 checked staging only; catalog + FK +
   row-count run across **all three** envs — this is where the convergence divergences surface
   (see `evidence/Q2-*` and `evidence/Q3-*`).
