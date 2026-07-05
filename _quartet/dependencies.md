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

**Runtime instance rule (WI-1417).** Launch watchers from tracked templates, but put runtime
instances under a gitignored directory such as `.cosmo-watch/` (or a program-specific equivalent).
Per-launch config, logs, review outputs, and de-dupe state belong there. Never patch
`_quartet/clacks/*` in place to create a live watcher variant; useful deltas become Work Items and
land through the normal lifecycle.

## Substrate access ladder — MCP loss is degraded mode, never a stoppage (WI-1314)

Three independent paths reach the work system, in preference order: Notion **MCP** (convenience
layer) → the **cosmo bun CLIs** (`fetch`/`claim`/`create`/`complete`/`triage`/`refine`/`review`/`qa`
.ts, all authenticate via `NOTION_TOKEN` over REST and never touch MCP) → the **notion CLI / raw
REST API** (same token). Losing the MCP server does not remove the other two — it is a tooling
degradation, and every role protocol (`orchestrator-protocol.md`, `shepherd-protocol.md`,
`reviewer-protocol.md`, `roles/executor/executor-protocol.md`) now states the invariant: **halting a
lane on MCP loss is a protocol violation.** Drop down the ladder, report degraded mode as a
`decision` line (never `blocked`), and keep working.

**Reviewer polling path is already MCP-independent.** `clacks/review-watcher.ts` authenticates with
`NOTION_TOKEN` and calls `https://api.notion.com/v1/...` directly (`fetch(...)`, see the file's REST
helper) — it never depends on the MCP server, so a shepherd/reviewer citing "verdict-poll skipped,
MCP down" is describing a false constraint, not the watcher's actual dependency.

**Root cause of the MCP-equals-Notion conflation:** see `findings.md` → *MCP-equals-Notion
conflation — root cause (WI-1314)*.

## Estate bindings (swap per deployment)
Doppler (secrets), Codex (reviewer/auditor runtime), the repo commit skill, `zdx-config.yaml` (DB
discovery). These are this estate's specifics, not part of the standard — substitute the equivalents
when relocating `_quartet/`.

## External work this depends on

### Reviewer-leg productization — LANDED (the four blockers, settled 2026-06-29)
Quartet **consumes** the Cosmo reviewer mechanism; it does not reimplement it. The "Cosmo
improvements" workstream (project: ZDX-Marketplace) delivered the contract Quartet's reviewer leg
assumes:
- **WI-888** (reviewer reads only the latest completion summary; parser-robust; re-finalize clearable) — Closed/Done.
- **WI-889** (`execute complete` authors Fixed In; DoD hard-requires non-empty) — Closed/Done.
- **WI-890** (watcher de-dupe / stale-replay) — Closed **superseded**: both concerns already resolved in `clacks/review-watcher.ts` (transition-key de-dupe). No external fix needed.
- **WI-891** (reviewer respects advisory/continue-on-error red lanes in closure-verification) — Closed/Done.

These pin the reviewer **input** (completion-summary shape), the executor→complete **handoff**
(`builder.md` Phase-7), and the **greenness** definition (shepherd green-PR gate). Keep the
completion-summary parser-clean per the finalization runbook (folded to the cosmo/zdx skill docs via
**WI-887**, Ready).

### NEX/ZDX ontology — LANDED (terminology source of truth)
The "NEX/ZDX improvements" workstream landed the current work-system primitives: **WI-835**
(two-layer planning/execution ontology + childless WP), **WI-838** (Planning DB:
Initiative/Epic/Story), **WI-839** (planning→execution relations), **WI-852** (the `Asset` noun),
and **WI-834** (`Effort`). Quartet contracts should now use the current ZDX standard directly:
Initiatives use `INI-NN`; childless WPs are legal when the WP carries its own AC; `Effort` is a
Work Item t-shirt size mandatory at DoR; an Initiative realizes an Asset.

Source of truth on terminology is `zdx/standard/` plus
`zdx/adr/ZDX-ADR-0010-two-layer-planning-execution-ontology.md`, not this folder.
