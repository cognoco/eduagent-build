# Quartet Dependencies

What the Quartet needs from outside `_quartet/` to actually run, and what external work it tracks.
A fresh orchestrator reads this **before** the activation checklist — several steps cannot start
without the inputs below.

## Hard prerequisites (the "do not proceed if" set)

| Need | Where it comes from | Used by |
|---|---|---|
| `NOTION_TOKEN` (env) | the estate secret manager (this estate: Doppler) — never hard-code | every Cosmo step; `clacks/orch-stage-monitor.sh`; `clacks/review-watcher.ts` |
| **Work Items DB id** (UUID) | repo-root `zdx-config.yaml` → `.zdx.work-items.data_source_id` (read with `yq`). Outside `_quartet/`. | reviewer kickoff `«WORK-ITEMS-DB-ID»`; `COSMO_WATCH_DB`; the monitors |
| **Workstream page id** (`WS-N`) | created at activation **step 2** (does not pre-exist) | shepherd + reviewer kickoffs; the Cosmo-Stage monitor filter |
| repo `AGENTS.md` (Cosmo lifecycle rules) | repo root | shepherd + reviewer (cited as required reading) |
| commit flow | the repo's commit skill (this estate: `.agents/skills/commit/SKILL.md`) | executors committing from a worktree |
| review/auditor runtime | a **second** runtime, distinct from executors (this estate: Codex) | reviewer; auditor executor type |

If `NOTION_TOKEN` or the Work Items DB id is absent, **stop** — you cannot create the Workstream or
the slice. Record a `blocked` outbox entry and surface to the operator rather than guessing.

## Watcher env (`clacks/review-watcher.ts`)
`NOTION_TOKEN` · `COSMO_WATCH_REPO` (repo root the review agent runs in) · `COSMO_WATCH_DB` (Work
Items DB id) · `COSMO_WATCH_CONFIG` (path to the workstream JSON). Optional: `COSMO_WATCH_POLL_MS`
(default 60000), `COSMO_WATCH_OUTDIR` (durable state dir — point at `working/program/`, **not**
`/tmp`).

## Estate bindings (swap per deployment)
Doppler (secrets), Codex (reviewer/auditor runtime), the repo commit skill, `zdx-config.yaml` (DB
discovery). These are this estate's specifics, not part of the standard — substitute the equivalents
when relocating `_quartet/`.

## External work this depends on

Quartet's forward-dependencies — the Cosmo work-system / planning-layer capabilities it consumes —
are **owned and tracked live in Cosmo under the ZDX Productization program** (`INI-25` in the
Initiatives DB) → its workstreams ("Cosmo improvements", "NEX/ZDX improvements") → work items.
**Check Cosmo there for current status; do not mirror it here** (one-fact-one-home,
`planning-rules.md` §1.4). That program is owned by a separate orchestrator.

Two durable facts a Quartet orchestrator can rely on:
- The **planning layer is live** — the Initiatives DB, the Workstream records, and the
  Initiative→Workstream→Work-Item relations exist and are in use (this repo's program runs on them).
- The **reviewer-leg contract** Quartet's reviewer consumes — completion-summary shape, `Fixed In`
  authored by `execute complete`, advisory/continue-on-error red handling — **landed** (mid-2026).
  Keep completion summaries parser-clean per the finalization runbook.

Write Quartet contracts against **stable primitives** — Work Item, Workstream, Stage, State,
Execution Path, claim, reviewer disposition, evidence. Source of truth on terminology is the current
ZDX standard, not this folder.
