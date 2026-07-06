# Audit A brief — MentoMate deep app audit

**Auditor session.** Repo: `~/nexus/_dev/eduagent-build` (this repo). Model: Fable (synthesis +
judgment); fan out subsystem reads to Explore/general-purpose subagents (Opus/Sonnet) — do NOT
spend Fable on grep. Read-only: you produce a roadmap, you do NOT change product code.

## Purpose

While Fable/Max is available (~24h), extract maximum "on-paper" optimization of the MentoMate app
— architecture, functionality, correctness, cost — pre-shaped so that when the MentoMate pipeline
restarts, dispatch picks only work expected to survive this audit's own triage. This is the
product counterpart to the assembly-line (ZDX) work; it is NOT about Cosmo/Quartet.

## Dimensions (cover each; add if you find a real gap)

1. **Architecture layering** — routes/services/schemas/Inngest vs the documented rules in
   `AGENTS.md` + `docs/architecture.md` + `docs/project_context.md`. Find drift, boundary
   violations, business logic in routes, scoped-repo rule breaks.
2. **Data model + migration debt** — schema coherence, the journal-divergence class (3 incidents),
   dead columns/tables, `.nullable().optional()` carve-outs, RLS/ownership-chain gaps.
3. **Feature surface vs PRD** — every feature: complete / dead / half-wired. Orphaned types,
   unreachable fallbacks, handlers pointing at removed code (the GC-class runtime bugs).
4. **LLM pipeline** — router, envelope discipline, quality gates (eval harness), per-exchange
   cost, model routing (MMT-ADR-0014), safety preambles, source provenance.
5. **Safety / compliance posture** — age gating (`computeAgeBracketFromDate`), consent,
   minor-safety surfaces, identity-compliance register conformance.
6. **Performance hotspots** — N+1s, bundle footprint, Inngest fan-out, mobile render (themeKey
   class), cold-start.
7. **Test economy** — where the ~12.7k tests over-cover (churn, internal mocks — GC1/GC6) and
   under-cover (safety/money/auth negative paths). Coverage vs value, not coverage vs %.

## Deliverable (write to `audits-2026-07-06/FINDINGS-A.md`)

Per finding: **{dimension, severity (P0-P3), what, evidence (file:line), proposed fix,
effort (S/M/L), Cosmo-grain (one WI? epic? needs decomposition?), survives-triage confidence}**.
End with: top-10 ranked, and a "restart-safe" shortlist (items you're confident dispatch-ready now).

## Reporting (substrate)

Set `QUARTET_ROLE=fable:audit-mentomate`. Resolve `/quartet` secrets (Infisical
`zwizzly-global/prod//quartet`). Instantiate `clacks.py` (branch `WI-1263-substrate-v1`,
`_quartet/substrate/`) OUTSIDE the git tree. At boot: `clacks heartbeat audit-mentomate`.
Post a status line per dimension completed (`clacks send audit-mentomate '{...}'`). Log any
scope decision (`clacks decide ...`). Heartbeat hourly. PM (fable) reads `audit-mentomate`.
