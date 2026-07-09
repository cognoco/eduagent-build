# MVP Roadmap Initiative — Plan

**Created:** 2026-07-09 · **Owner:** operator (Jørn) + Zuzka (product) · **Agent:** this initiative's sessions
**Goal:** one ratified MVP roadmap for MentoMate — top-down MVP definition anchored in canon, every backlog item mapped to it, gaps captured, quarantine fates executed, roadmap materialized.
**Out of scope:** ZDX/Cosmo/Quartet machinery; WS-34/WS-37 closeout (runs independently); all other MentoMate execution stays on ice until this initiative concludes.

## Context (why)

- Cosmo backlog is two unanchored populations: bottom-up captures (bugs/findings) and pseudo-top-down spec extractions (specs/plans written in isolation, no common PRD/architecture anchor).
- Spec-corpus triage (`_quartet/working/program/spec-triage/`) ran Phases 0–3 (register → 27 disposition sheets → decision pack → 7 product rulings, Zuzka 2026-07-05 / Jørn co-sign 07-06). **Phase 4 (execute fates on ~95 quarantined items) never ran.**
- ROADMAP-A (`_quartet/working/program/audits-2026-07-06/ROADMAP-A-mentomate.md`) merges spec-triage + the Jul-6 codebase audit; all 6 of its decision gates ruled 2026-07-07. It is the input synthesis, not the roadmap of record.

## Phases

| # | What | Who | Deliverable |
|---|------|-----|-------------|
| 1 | **Ground truth**: pull all non-Closed MentoMate WIs (REST script, paginated); classify by provenance / stage / workstream / quarantine membership; verify Phase-3 ballot rulings verbatim from Notion | agent | `inventory.jsonl` + `INVENTORY.md` here |
| 2 | **Top-down MVP definition**: capability tree per user journey (learner loop, guardian/family, onboarding+consent, billing, safety+compliance, languages/voice, notifications, store/publish). Each node: in / out / degraded-at-launch. Folds in all existing rulings; code-verified, not doc-trusted | agent drafts → **Zuzka + Jørn ratify** | `MVP-DEFINITION.md` here (graduates to canon after ratification) |
| 3 | **Fit/gap analysis**: map every inventory item to a definition node. Outputs: coverage matrix (per capability: shipped/partial/missing + closing WIs), orphan WIs (map to nothing), gaps (no code + no WI). Reuse spec-triage verifications + FINDINGS-A evidence | agent (fan-out/workflow if volume warrants) | `COVERAGE.md` + `GAPS.md` |
| 4 | **Ruling session**: gaps, contested mappings, definition-vs-backlog conflicts | **Zuzka + Jørn** | rulings recorded |
| 5 | **Materialize**: execute quarantine fates (kills/re-homes/adopts per decision pack §2 + rulings), create gap WIs, sequence into milestones, write roadmap-of-record, doc-hygiene pass (archive shipped/obsolete specs, fix stale headers, triage `2026-07-02-4-strands.md`) | agent | roadmap-of-record (location TBD — revisit at Phase 5) |

## Phase-1 mechanics

Deterministic REST pull (python script, `NOTION_TOKEN` from env) — no LLM for the fetch. Property-derivable classification inline; residual items needing body reads → batched cheap subagents. Provenance buckets: `spec-triage/quarantine` · `codebase-audit (A-xx)` · `coverage-audit (WI-1399–1416)` · `execution-candidates` · `bottom-up bug` · `lane residue` · `launch-ops`.

## Operator involvement (the full list)

1. Ratify MVP definition (Phase 2 exit).
2. Rule Phase-4 gap/conflict list.
3. Calendar-bound externals (independent, already in Operator Queue): OPQ-22 counsel packet, OPQ-5 Doppler secrets, OPQ-6 store gates, OPQ-11 device/beta runs.

## Decisions log

- 2026-07-09: approach approved in principle (operator). MVP definition = standalone doc here, graduates to canon after ratification. Roadmap-of-record location deferred to Phase 5.
