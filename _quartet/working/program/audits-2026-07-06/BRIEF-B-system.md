# Audit B brief — Nexus / ZDX / Cosmo / Quartet system audit

**Auditor session.** Repo: `~/nexus` (the Nexus control-plane repo, NOT eduagent). Model: Fable
(synthesis + judgment); fan out reads to subagents. Read-only: produce a roadmap, change nothing.
Behave as Hex would inside the Nexus repo (read `~/nexus/AGENTS.md` + `CONTEXT.md` first).

## Purpose

Same window, same logic as Audit A, applied to the ENABLING LAYER: the machinery both programs
execute through. Extract maximum on-paper improvement of Nexus/ZDX/Cosmo/Quartet before we lock
down ZDX build work, so the ZDX finish-line roadmap is built on audited foundations, not the
current organically-grown state. Anchor priority on the four operator pain points
(role accountability · clacks reliability · reviewer invisibility · Codex/token economics).

## Dimensions (cover each)

1. **Cosmo/ZDX data model + lifecycle completeness** — WI DB schema, Stage/State/Resolution/
   Altitude/Execution-Path, Workstream/Work-Package structure. The BOTTOM-UP lifecycle
   (`/capture→/triage→/refine→/execute→/review→/close`) exists; the **TOP-DOWN** verbs
   (PRD→Epic→Feature→WI decomposition, coverage tracing, re-decomposition) do NOT — assess this
   gap and what it takes to close (track 10). Read `zdx/standard/`.
2. **Quartet role/protocol design** — orchestrator/shepherd/reviewer accountability &
   mandate (the muddle: neither role owns the queue). Charters-vs-protocols split. The pilot
   findings (`_quartet/working/program/codex-pilot-2026-07-05/observations.md` +
   `.../lanes/coverage-debt/codex-pilot-shepherd-findings.md`) are primary evidence — read them.
3. **Clacks / substrate** — the new Supabase substrate (`_quartet/substrate/`, branch
   `WI-1263-substrate-v1`): is the design sound, what's missing for fleet-wide rollout, how do
   the hand-rolled watcher variants get retired, cross-machine sync.
4. **Reviewer independence vs observability** — WI-1645 (single-writer breach); the one-way
   liveness design.
5. **Codex / token economics** — Codexification state (WS-43), the attended-only finding, exec
   sandbox constraints (WI-1647/1648), where Claude token burn is worst and what Codexifies next.
6. **Tooling debt** — marketplace repo has no CI (WI-1264), the plugin-cache upstream-bug class
   (OPQ-17), lifecycle-tool regression incidents, migration/journal safety.
7. **Nexus architecture** — control-plane model (NEX-ADRs), repo/workspace layout, secrets
   machinery, cross-repo/cross-machine concerns.

## Deliverable (write to `_dev/eduagent-build/_quartet/working/program/audits-2026-07-06/FINDINGS-B.md`)

Same shape as Audit A: per finding {dimension, severity, what, evidence, proposed fix, effort,
Cosmo-grain, survives-triage confidence}; top-10 ranked; a "known-work" shortlist of items
confident enough to fold into the immediate ZDX hand-back (feeds track 6). Cross-check against the
existing draft audit (`audits-2026-07-05/AUDIT.md` — 62 items) and the day-2 pilot doc; say where
you agree/differ.

## Reporting (substrate)

Set `QUARTET_ROLE=fable:audit-system`. Same `/quartet` secrets + `clacks.py` (instantiate outside
the tree). Boot: `clacks heartbeat audit-system`. Status per dimension; decisions logged; hourly
heartbeat. PM (fable) reads `audit-system`. If you need to reach Audit A, post to lane `audit-xtalk`.
