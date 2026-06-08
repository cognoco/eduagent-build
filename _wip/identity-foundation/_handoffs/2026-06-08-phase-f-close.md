# Handoff — Phase F closed (2026-06-08)

**State:** Phases **A–F complete.** Next: **Phase G** (lock the canonical set + seed
the documentation index). Live tracker: `_wip/identity-foundation/ROADMAP.md`.

## What closed F (the F.1 spine + the 2026-06-08 reconciliation)
- **3 spine ADRs ratified:** `MMT-ADR-0013` (policy-engine spine), `MMT-ADR-0014`
  (router ⟂ vetting split), `MMT-ADR-0015` (data-model amendment). `data-model.md`
  lockstep SQL written.
- **ADR-14/16 reconciliation:** model picks are ephemeral data → moved to the new
  `docs/registers/llm-models/` master (DB-bound, **not canon**); `MMT-ADR-0016`
  **repurposed** to safety/judge architecture only (no app-owned denylist;
  vendor-independent, non-reasoning judge); the Gemini exit is a compliance **input**,
  recorded in the vetting trail; `MMT-ADR-0014` absorbed the mechanism (fail-closed →
  `CircuitOpenError`; separately-routable tutor/judge roles). `docs/registers/` added
  as a type-named **L3 sibling** (ADR-0000 amended).
- **Vetting (WP-4):** reframed to a short **runbook** (`docs/runbooks/llm-model-vetting.md`);
  the standing process/master/records already exist; **iteration-1 launch-set record
  ratified.**
- **Continuity:** WP-6 memory pointer (`.claude/memory/project_identity_foundation_decisions.md`,
  pointer-only) + this WP-7 handoff.

## Carried contingencies (not blocking)
- **R-1 (COPPA):** walkthrough returned *unclear-with-defensible-posture* (no live
  counsel); real counsel sign-off (**HW-2**) owed before any sub-13 / v2 build. Not
  launch-blocking.
- **WP-8** (cleanup sweep) → Phase **J**. **WP-9** (US sub-13 fork) → carried.
  **WP-10** (sub-13 v1.1 ungating) → deferred future workstream.

## Phase G — what it is
Explicitly confirm the **canonical set** (now incl. ADRs 0013–0016, the registers,
the ADR-0000 registers amendment, the A-vs-B memo) and **seed the documentation
index** — the agent boot-flow linchpin and a prerequisite for Phase J's
memories-as-pointers + the `docs/` §I.4 drain. G is the lens for the gap analysis (L)
and gates H (the `architecture.md` identity carve-out).

## Watch-outs
- `.claude/memory/` **"Strictly 11+"** constraint is **stale** (superseded by Path X:
  13+ consent-capacity floor, sub-13 built-but-gated) — a Phase-J cleanup target; do
  not trust it.
- Deep provenance citations inside the ratified `identity-ontology.md` /
  `identity-foundation-prd.md` point at files now in `archive/` / `_research/` —
  they resolve by name-search, not path.
