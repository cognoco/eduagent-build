# Quarantined — Parallel ungoverned ADR audit (2026-06-03)

**Status:** Sealed cross-reference. **Do NOT build on or cite these as canon.**

## What this is

During the Phase-C decisions-layer work, a separate, uncoordinated session pushed
an ADR-audit deliverable to `main`:

- `ADR-register-draft.md` — a backward-looking "decision register" (`<DOMAIN>-NN`
  IDs) with a §1 "Conflicts, Supersessions & Code-Verified Resolutions" section.
  (Originally `docs/ADR-register-draft.md`.)
- `cleanup-wrong-decisions.md` — a cleanup plan with STANDS-vs-refuted findings, a
  "do NOT touch" list, and Phases 1–7 of code tasks.
  (Originally `docs/plans/2026-06-03-adr-register-cleanup-wrong-decisions.md`.)

It also pushed stale-fact "citation fixes" to `docs/architecture.md`,
`docs/project_context.md`, `docs/compliance/audience-matrix.md`, `CLAUDE.md`, `AGENTS.md`
(commits `944d87a`, `1039bb217`).

## Why it is quarantined, not adopted

- **Producing workflow is not in the repo** — its selection criteria, coverage, and
  importance-weighting cannot be verified.
- **No significance gate applied** — it extracts "architecture decisions" without the
  OR-trigger gate ratified in `docs/adr/MMT-ADR-0000` §II.1.
- **Scope is archived specs only** — not a full controlled sweep of canon/code.
- **Domain conflicts with in-flight identity-foundation decisions** — e.g. it
  prescribes `isOwner` / owner-based gating that ratified decision C2 dissolves
  (see `_wip/identity-foundation/identity-ontology.md` §R / §1.5).

## Disposition

- The **material canon/doctrine edits** from `944d87a` / `1039bb217` were **reverted**
  (LLM-envelope rule softening, persona→`isOwner`-gating rewrite, nav-contract
  finding-status flips, onboarding/helper-location re-citations). Pure count/line
  refreshes (migration count, route count, a moved line number) were **retained**.
- These two draft docs are **retained here as a completeness backstop only**: after
  the controlled ADR sweep (Stream 2), *diff* the result against this register's §1
  conflict-resolutions and the cleanup plan's STANDS/refuted findings, then decide
  the final call — harvest the independently-verified facts, or discard.

See `_wip/identity-foundation/ROADMAP.md` (decisions-layer cross-cutting thread) for
the live tracking entry.
