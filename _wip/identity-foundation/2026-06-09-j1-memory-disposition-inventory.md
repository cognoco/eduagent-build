---
title: Phase J1 — Memory Disposition Inventory
date: 2026-06-09
phase: J1
status: EXECUTED 2026-06-09 — ratified + applied (1 delete, 3 repoints, 1 keep); see exit-gate at bottom
scope: .claude/memory/ (90 active + 28 archived), identity-foundation surface only
---

# Phase J1 — Memory Disposition Inventory

**What this is.** The triage J1 actually owes (the ROADMAP J1 row presupposes "retained
identity-foundation entries" but no triage existed). Every active + archived `.claude/memory/`
entry was screened for identity-foundation coupling via its frontmatter `description`; coupled
candidates were read in full. **No memory file has been edited.** Dispositions below are proposals
for ratify.

**Disposition vocabulary**
- **REPOINT** — entry duplicates ratified canon → replace the duplicated content with a thin,
  provenance-cited pointer to the live canonical target. Target must exist (verified below).
- **REPOINT-FIX** — entry is already a pointer but cites stale/moved targets → repoint to post-J0 paths.
- **CULL** — content is stale/wrong *and* fully superseded by canon (or unprovenanced + unlinkable).
- **KEEP** — non-canon working state / user fact / UX-product rule; not a copy of identity canon.
- **OUT** — not identity-foundation-coupled (or belongs to a different workstream); J1 does not touch it.

**Canonical targets (all verified to exist 2026-06-09):**
`docs/canon/identity/{ontology,domain-model,data-model,prd}.md` · `docs/compliance/identity-compliance-register.md`
· `docs/adr/MMT-ADR-0007…0017` · `docs/registers/llm-models/master.md` · `docs/INDEX.md`
· `_wip/identity-foundation/CANONICAL-SET.md`

---

## A. IN J1 SCOPE — identity-foundation-coupled (5 entries)

| # | Entry | Coupling | Proposed disposition |
|---|---|---|---|
| 1 | `project_identity_foundation_decisions.md` | The dedicated identity pointer (WP-6) | **REPOINT-FIX** — already pointer-shaped ✓, but: (a) "Stream canon" block still points to **pre-J0 `_wip/` filenames** (`identity-ontology.md`, `domain-model.md`, `data-model.md`, `identity-foundation-prd.md`) — these **graduated to `docs/canon/identity/{ontology,domain-model,data-model,prd}.md`** in J0; repoint. (b) add the new L1 member `docs/compliance/identity-compliance-register.md`. (c) ADR label drift — it calls `MMT-ADR-0016` "safety/judge architecture" but the file on disk is `0016-llm-provider-model-selection-and-routing`; reconcile label to actual ADR title. |
| 2 | `feedback_persona_vs_role.md` | Age≠role; guardian-vs-self distinction | **KEEP** (revised 2026-06-09 after verification — was "CULL"). It *mentions* the removed `personaFromBirthYear()` fossil only as the **anti-pattern it warns against**; its actual "how to apply" recommends **`resolveProfileRole(db, profileId)`, which is LIVE** (`apps/api/src/services/profile.ts:756`, used in `recall-nudge-send.ts:128`, tested). Guidance is current and correct — not a cull candidate. Optional later one-line touch-up; no J1 action. |
| 3 | `project_persona_removal.md` | Epic-12 persona-enum removal history | **ARCHIVE** (move, not delete) — `git mv` → `.claude/memory/_archive/` + drop its `MEMORY.md` index line. Project change-log with commit provenance (Epic 12, 2026-04-09 / 2026-04-15); durable facts (persona enum removed → age/role/intent derived) are canon in `ontology.md`; the stale part is its "import `personaFromBirthYear`" apply-guidance (fossil removed). Archive neutralizes the stale guidance without destroying the record — matches the repo's populated `_archive/` convention (29 siblings incl. `project_persona_analysis.md`). |
| 4 | `project_product_roles_students_any_age.md` | Audience/role model (student-any-age, parent-as-student, child w/o login) | **REPOINT** — this user-corrected product-intent is now **canon** (`ontology.md` entities/roles + `prd.md` audience/Parts). Replace body with a pointer. **Verify-before-cull**: confirm canon explicitly carries (a) parent-as-student easy path, (b) child can exist without a linked login, (c) "Viewing &lt;child&gt;" context-switch — if any nuance is canon-absent, keep it as a thin pointer that names the gap rather than deleting it. Terminology note: predates 6-persona set + `supporter` rename. |
| 5 | `market_language_pivot.md` | Consent/age-floor clause (one paragraph) | **PARTIAL REPOINT** — body is mostly market/i18n (non-identity, KEEP). The **"Consent strategy (superseded 2026-06-05)"** paragraph (13+ launch floor, guardian-gated→16, country-allowlist, no under-13) duplicates canon → replace that paragraph with a pointer to `docs/compliance/identity-compliance-register.md` (the new canonical home; it currently cites the raw meeting minutes). |

## B. BORDERLINE — screened, ruled OUT of J1 (with reason)

| Entry | Why it looks coupled | Why OUT |
|---|---|---|
| `feedback_never_force_add_child.md` | guardian / zero-linked-children gate | **UX-resilience product rule** (dead-end escape), not a copy of identity canon. KEEP as-is. |
| `pricing_dual_cap.md` | model-router rung clause (rung 4+/5+, Family Gemini-only) | Pricing/quota is not identity. The routing-rung overlap belongs to the **model-router/llm-models workstream** (`MMT-ADR-0014/0016` + register), not identity-foundation memory. KEEP; revisit there. |
| `billing-payments.md` | Payer is an identity capability | Payment-**provider infra** (RevenueCat/Stripe), not the identity model. **Billing workstream.** KEEP. |
| `project_agent_doc_and_memory_architecture_revisit.md` | memory↔agent-doc governance | Meta-governance question → **feeds J2** (agent-doctrine reduction), not a J1 identity-content repoint. KEEP; tag J2. |

## C. ARCHIVED identity-touching — leave archived (note for `/nexus:memory-curate`)

`_archive/project_persona_analysis.md` (persona fragility; "resolved by Epic 12") · `_archive/project_parent_visibility_spec.md`
(privacy/RLS/parent-visibility specs) · `_archive/project_cr_124_scope.md` (profile-scoping IDOR fix). All already
archived + superseded by clean-cut. **No J1 action**; candidates for tombstone-condense at next memory curation.

---

## Incidental findings (NOT J1 edits — flagged for the ADR layer)

1. **ADR-0017 number collision.** Two files share `MMT-ADR-0017`: `…-concept-capture-additive-layer.md`
   and `…-llm-orchestrator-single-entry-point.md`. Phase I-c promoted `ARCH-8`→`MMT-ADR-0017` (orchestrator);
   the concept-capture ADR also took 0017. Duplicate number → one must renumber. ADR-layer fix, not J1.
2. **decisions-pointer ADR label drift** (folds into action #1) — `MMT-ADR-0016` is labelled "safety/judge
   architecture" in the memory but the on-disk title is "llm-provider-model-selection-and-routing." Reconcile.

## Exit-gate checklist — EXECUTED 2026-06-09

- [x] #1 REPOINT-FIX landed — stream-canon block → `docs/canon/identity/` + compliance register; ADR-0016 label was already correct (its *filename* is the stale one — see finding 3).
- [x] #2 KEEP — `feedback_persona_vs_role.md` untouched (recommends the live `resolveProfileRole`).
- [x] #3 **DELETED** — `project_persona_removal.md` removed (PM ruled delete over archive); index line dropped.
- [x] #4 REPOINT — `project_product_roles_students_any_age.md` → pointer (ontology + prd Part 10; nav-IA → audience-matrix + `navigation-contract.ts`; anti-pattern caution retained).
- [x] #5 PARTIAL REPOINT — `market_language_pivot.md` consent paragraph + apply-bullet → compliance register; market/i18n body kept.
- [x] Every retained identity entry cites a live canonical target; all paths verified to resolve. Active non-index memory count 89 → 88.
- [x] `MEMORY.md` index updated (1 line removed, 3 descriptions refreshed).
- [x] **ADR-layer fixes executed inline 2026-06-09** (PM-directed, beyond J1 proper):
  - **0017 collision** → orchestrator ADR renumbered **0017 → 0018** (`git mv`; 0 inbound file-path links so the rename broke nothing). Concept-capture keeps 0017. Bare-number cites flipped (orchestrator-meaning only): `architecture.md:894`, `adr/README.md:35`, `epics.md` ×5, `INDEX.md` (range + ARCH-8 note + L2 list). `architecture.md:139` (concept-capture) deliberately left at 0017.
  - **0016 filename ⊥ title** → `git mv` to `MMT-ADR-0016-safety-and-judge-architecture.md`; 3 inbound filename refs + INDEX `:54` label corrected.
  - **CLAUDE.md nav path** → repointed to the live impl `apps/mobile/src/lib/navigation-contract.ts` + archived spec.
  - **Live forward-instruction** `ROADMAP.md:191` (J2 target) corrected 0017 → 0018.

**Deferred-sweep decision (per CLAUDE.md "sweep when you fix").** The remaining `MMT-ADR-0017` /
old-orchestrator-filename references all live in **dated historical records** under `_wip/identity-foundation/`
(`2026-06-08-phase-i-architecture-legacy-pass.md`, `_handoffs/2026-06-08-phase-i-close.md`, ROADMAP
changelog entries). These are **accurate as-of-2026-06-08** (the ADR *was* 0017 then). They are
**intentionally NOT rewritten** — falsifying a dated changelog is worse than a stale internal link; the
renumber is now recorded in live INDEX/README/ROADMAP. Residual: those internal docs carry dangling
`…-0017-llm-orchestrator…` paths. Acceptable; revisit only if a future reader is misdirected.

## Findings appended during execution

3. **ADR-0016 filename ⊥ title.** `docs/adr/MMT-ADR-0016-llm-provider-model-selection-and-routing.md` was
   **re-scoped 2026-06-08**; its title is now "Safety and judge architecture." The memory label was right;
   the **filename** is the stale artifact. Folds into the same ADR-layer cleanup as finding 1.
4. **CLAUDE.md stale nav-contract path.** CLAUDE.md (Profile Shapes §) cites
   `docs/specs/2026-05-21-navigation-contract.md`, but that spec was archived to
   `docs/_archive/specs/Done/2026-05-21-navigation-contract.md`. Out of J1 scope; noted so it isn't lost.
