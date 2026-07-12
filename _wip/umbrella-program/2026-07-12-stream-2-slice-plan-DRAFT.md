---
title: Stream 2 drain — slice plan (DRAFT — on paper, nothing in Cosmo)
status: DRAFT · awaiting operator ruling at the D-gate
date: 2026-07-12
author: batch7-shepherd session (WI-1309 draft-on-paper directive)
sources: stream-2-backlog.md (home doc, read in full), program-roster.md § PRG-20,
  WI-1309 AC, existing WS-36 cluster (WI-752/757/895–900) read from Cosmo
rule: pointers-never-copies · extract-before-cleanup · do NOT seed from
  docs/_archive/parallel-adr-audit-2026-06-03/
---

# Stream 2 drain — executable slice plan (DRAFT)

**What this is.** The WI-1309 deliverable, on paper: every item in the Stream-2 drain
body converted into a proposed Cosmo WI (with AC sketch, dependencies, effort) or
explicitly dispositioned. Designed so that **all human judgment is concentrated in one
up-front decision gate (the D-gate)**; everything downstream is autonomous-executable.
Nothing here has been created in Cosmo.

**Shape:** Wave 0 (autonomous prep — builds the artifacts the decisions need) →
**D-gate (ONE operator ruling session, 7 decisions)** → Waves 1–3 (autonomous
execution) → Wave 4 (closeout + backstop diff). After the D-gate, the only remaining
HITL is ordinary review-gate traffic.

**Two live facts the plan corrects for** (verified 2026-07-12):

1. **The ~70-decision census does not exist in-tree.** The only comprehensive decision
   register is the quarantined parallel audit we must not seed from. The census is
   therefore a Wave-0 WI (S2-01), not an input — and the MoSCoW ruling (D1) cannot
   happen until it's built.
2. **Root `AGENTS.md` is now 52.9k chars** — 12.9k over the 40k harness ceiling and
   7.4k worse than the 45.5k the home doc recorded on 2026-06-13. The principles-catalog
   trim (S2-04) is the named remedy and should be treated as the most time-sensitive
   item in the drain.

---

## 1 · The D-gate — all operator decisions, batched (ONE session)

> Modeled as a single **Manual** WI (S2-D). Everything else in this plan is
> Assisted/Auto. Each decision below arrives at the gate with its Wave-0 prep artifact
> and a recommendation; you rule, we execute.

| # | Decision | Prep artifact (Wave 0) | Recommendation |
|---|---|---|---|
| **D1** | **MoSCoW ruling over the decision census** — approve/adjust each row's MUST/SHOULD/NICE/SKIP class; MUST+SHOULD rows become ADR-authoring batches | S2-01 census table (each row: decision, sources, drift evidence, proposed class, significance-gate verdict) | Rule the table as a batch; contest only rows you disagree with — silence = proposed class stands |
| **D2** | **Borderline significance-gate calls** — does the 0.88 source-provenance confidence gate get its own ADR? does brand theming (dark-first, no-accent-picker) get an ADR or a canon section? + any census rows S2-01 flags borderline | flagged-rows annex of S2-01 | 0.88 gate: **yes, companion ADR** (it's a behavior-shaping numeric policy with drift risk). Brand: **canon section, no ADR** (stable, uncontested; ADR only if the neutral/slate contingency is ever exercised) |
| **D3** | **Approve the docs-tree mapping table** — current `docs/` layout → MMT-ADR-0000 §I.4 target (`canon/adr/specs/plans/runbooks` + `assets/`/`_archive/`), incl. J3 nonstandard dirs (`E2Edocs/ _scratch/ _vault/ analysis/ superpowers/ meetings/`) and the `audience-matrix.md` move | S2-02 mapping table (old path → new path → citation-update list) | Approve as a batch; the layout is already ratified in ADR-0000 — this is placement mechanics, but a wrong bulk move is expensive, hence one look |
| **D4** | **Approve the `principles.md` boundary** — exactly which AGENTS.md sections leave (Non-Negotiable Rules, Code Quality Guards, Languages binding-rules → their L3 homes) and what stays as pointers | S2-03 extraction draft + before/after char counts | Approve draft; hard requirement = AGENTS.md back under 40k with zero semantic loss (each moved rule replaced by a one-line pointer) |
| **D5** | **Sequencing: governance before backfill?** — do the ADR-governance amendments (WI-757/896, amending MMT-ADR-0000) land before bulk ADR authoring starts? | none needed | **Yes** — author ~70 ADRs once, under corrected governance, not twice. Enforcement children (WI-897–900) run parallel; they gate nothing |
| **D6** | **Fix the "or" targets in the WI-387 drain table** — row 1 (`human_override` → PRD **or** ux-design-spec), row 5 (brand → canon **or** ADR, collapses into D2), row 8 (`language_assessments` → PRD **or** identity prd) | none needed (table in home doc) | Row 1: **ux-design-specification.md** (it's a design principle). Row 5: per D2. Row 8: **PRD.md** (assessment design is product-wide, not identity) |
| **D7** | **Reorg timing** — bulk `docs/`→`docs/canon/` relocation before or after the ADR-backfill batches land? | none needed | **After** (Wave 3): backfill ADRs cite paths; moving files mid-authoring churns citations. The reorg is fast once everything it moves is stable |

---

## 2 · Proposed WI register

Provisional codes `S2-NN`; real WI numbers minted at slice time. Type/Effort per ZDX.
"Gate" = what must be ruled/landed first. All Assisted unless marked.

### Wave 0 — prep (autonomous, all parallel, start immediately on slice)

| Code | Name | Type / Effort | Gate | AC sketch |
|---|---|---|---|---|
| **S2-01** | Controlled decision census (~70 decisions) | Task / **L** | — | Sweep `.claude/memory/`, canon, ADR set, specs decision-blocks, decision-capture docs; output one census table: decision · sources (file:line) · drift evidence (memory-only? ≥2-source divergent?) · proposed MoSCoW · significance-gate verdict · borderline flag. **Must NOT read the quarantined register** (sealed until S2-15). Feeds D1/D2 |
| **S2-02** | Docs-tree reorg mapping table | Task / **M** | — | Full inventory of `docs/` + J3 nonstandard dirs → target per ADR-0000 §I.4; per-move citation-update list (incl. `prd.md:319` for audience-matrix); flags any file with no obvious home. Feeds D3 |
| **S2-03** | `docs/canon/principles.md` extraction draft | Task / **M** | — | Draft the catalog from AGENTS.md Non-Negotiable Rules + Code Quality Guards (+ `project_known_bug_patterns` memory, WI-387 row 4) + Languages binding-rules → `architecture.md`; pointer stubs for AGENTS.md; before/after char counts proving <40k. Feeds D4. **Draft only — lands in S2-04** |
| **S2-D** | **Stream-2 D-gate ruling session** | **Manual** / S | S2-01/02/03 done | Operator rules D1–D7 in one sitting; rulings recorded on the WI + home doc |

### Wave 1 — governance + foundations (autonomous, after D-gate)

| Code | Name | Type / Effort | Gate | AC sketch |
|---|---|---|---|---|
| *(fold)* | **WI-757/896** — amend MMT-ADR-0000 (shift-left provenance, reconstruct-vs-launder) | existing / S | D5 | Existing captured items; refine → execute first per D5. **Fold, don't duplicate** |
| *(fold)* | **WI-897–900** — enforcement layers B–E (AGENTS doctrine rule, brainstorm gate, /refine ADR-gate, pre-commit link check) | existing / S–M each | D5 (parallel lane) | Existing captured items; run parallel to backfill — they gate nothing |
| *(fold)* | **WI-752** — ADR governance correction & re-vetting | existing (Ready/Parked) / M | WI-757/896 landed | Unpark after amendments; re-vet the 3 seed ADRs + any pre-gate ADRs under corrected rules |
| **S2-04** | Land `principles.md` + AGENTS.md trim (40k ceiling) | Task / **M** | D4 | S2-03 draft lands; AGENTS.md <40k verified by CI-checkable count; zero semantic loss (every moved rule → pointer); absorbs WI-387 row 4. **Most time-sensitive item — pull earliest** |
| **S2-05** | ARCH-N register drain (incl. ARCH-3 fix) | Task / **M** | D1 | Every `ARCH-N` in `docs/specs/epics.md` → superseding MMT-ADR, tombstone, or documented keep; ARCH-3 content corrected in its successor; register annotated frozen-and-drained |

### Wave 2 — the drain body (autonomous, after Wave-1 governance)

| Code | Name | Type / Effort | Gate | AC sketch |
|---|---|---|---|---|
| **S2-06** | ADR backfill batch 1 — MUST rows | Task / **L** | D1 + WI-757/896 | Every census MUST row (memory-only or ≥2-source-drifting) gets its ADR under corrected governance; extract-before-cleanup — no source memory/file relocated before its ADR merges. Identity-slice rows ride the runway tail (Prong A/B) — marked, not duplicated |
| **S2-07** | ADR backfill batch 2 — SHOULD rows | Task / **L** | S2-06 pattern proven | Single-canon extraction rows; same constraints |
| **S2-08** | NICE/SKIP disposition sweep | Task / **S** | D1 | Every NICE row: recorded-as-stable note. Every SKIP row: tombstone with reason. Census table becomes a fully-dispositioned ledger (no silent rows) |
| **S2-09** | WI-387 9-memory drain — content extraction | Task / **M** | D2 + D6 | Each of the 9 rows: content lands in its ruled target (rows 3/5 include their D2-ruled ADR-or-canon form); then hand back to WI-387 to archive/pointer each memory. Extract-before-cleanup binds |
| **S2-10** | `Docs`-tagged memory migration (WI-387 remainder) | Task / **S** | — (post D-gate) | Every `Docs`-tagged row in the WI-387 triage prep migrated to `docs/` (seed: `book_generation_pass` + `enduser_session_pass` → `docs/testing/`; converge `llm_source_provenance` with S2-09 row 3, don't fork); memories become pointers |

### Wave 3 — structural moves (autonomous, after Wave 2 lands)

| Code | Name | Type / Effort | Gate | AC sketch |
|---|---|---|---|---|
| **S2-11** | Execute `docs/`→`docs/canon/` reorg | Task / **L** | D3 + D7 (post-Wave-2) | Bulk relocation per approved mapping; every citation in the update-list rewritten; link-checker or grep-sweep proves zero dangling paths; `_archive/` drains applied |
| **S2-12** | Glossary bucket-3 routing (cards/celebrations) | Task / **S** | S2-11 (target paths stable) | Principles → `ux-design-specification.md`; terms → per-area `CONTEXT.md`; inventories → L3 register; bucket-3 section of `docs/glossary.md` reduced to pointers. (Buckets 1/2 explicitly NOT this WI — PRG-01/PRG-21) |
| **S2-13** | J3 loose-canon + nonstandard-dir cleanup + audience-matrix move | Task / **M** | S2-11 | Estate-spine docs conformant; `E2Edocs/ _scratch/ _vault/ analysis/ superpowers/ meetings/` dispositioned per mapping; `audience-matrix.md` relocated with `prd.md:319` updated |
| **S2-14** | PRG-14 tech-skill lean-pointer rework | Task / **M** | S2-04 (principles home exists) | The 3 `tech/*` skills (eduagent-schemas, eduagent-db, gha-hardening): facts extracted to L3 (much already in AGENTS.md/architecture.md — converge), skills slimmed to trigger + pointer + key-invariants; the lean-pointer bar recorded for future `tech/*` minting |

### Wave 4 — closeout

| Code | Name | Type / Effort | Gate | AC sketch |
|---|---|---|---|---|
| **S2-15** | Quarantine backstop diff + final disposition | Task / **S** | S2-06/07/08 done | NOW open `docs/_archive/parallel-adr-audit-2026-06-03/`; diff its §1 conflict-resolutions + STANDS/refuted findings against the controlled sweep; harvest any verified fact the sweep missed (as ordinary census addenda); then delete or permanently archive the quarantine with a disposition note |
| **S2-16** | Home-doc reconciliation + Stream-2 graduation check | Task / **XS** | all above | `stream-2-backlog.md` updated: "sliced into Cosmo" pointer + WI map; change-log entry; check the post-P graduation clause (standalone workstream) with the umbrella |

---

## 3 · Dependency graph (compact)

```
S2-01 ─┐                        ┌─ WI-757/896 ─→ WI-752
S2-02 ─┼─→ S2-D (D-gate) ──────┼─ WI-897…900 (parallel lane)
S2-03 ─┘        │               ├─ S2-04 (AGENTS trim — pull earliest)
                │               └─ S2-05 (ARCH-N drain)
                │
                └─ after Wave-1: S2-06 → S2-07 → S2-08
                                 S2-09, S2-10 (parallel to 06/07)
                └─ after Wave-2: S2-11 → S2-12, S2-13
                                 S2-14 (needs only S2-04)
                └─ closeout:     S2-15 (after 06/07/08), S2-16 (last)
```

Autonomy profile: **1 Manual WI (S2-D)** + ordinary review gates. Everything else
Assisted, subagent-executable, with mechanical ACs.

## 4 · Coverage ledger — every home-doc item accounted for

| Home-doc item | Disposition |
|---|---|
| ~70-decision ADR backfill (MoSCoW) | S2-01 (census) + D1 + S2-06/07/08 |
| architecture.md non-identity structural rebuild | **Partially deferred**: rot-fixes ride S2-06/07 where census rows touch it (e.g. Epic-6 via S2-09 row 2); the *full structural rebuild* stays gated on PRG-01 moot-by-refactor per roster ("don't rebuild canon for areas the clean-cut rewrites") — carried as an explicit non-WI note in S2-16, re-sliced when PRG-01 blast radius is final |
| ARCH-N drain + ARCH-3 fix | S2-05 |
| Principles/invariants catalog + AGENTS.md 40k ceiling | S2-03 (draft) + D4 + S2-04 |
| Reduced docs/→docs/canon/ reorg | S2-02 + D3/D7 + S2-11 |
| Glossary bucket 3 | S2-12 |
| WI-387 9-memory DRAIN table | S2-09 (+ D2/D6) |
| WI-387 `Docs`-tagged remainder | S2-10 |
| J3 deferrals + audience-matrix | S2-13 (mapped in S2-02) |
| PRG-14 tech-skill rework | S2-14 |
| Agent-doctrine / memory pointer cleanup (canon-class) | Covered by S2-09 + S2-10 + S2-04 jointly |
| 752/757/895–900 cluster | Folded into Wave 1, sequenced by D5 — no new WIs minted |
| Population A/C audit findings (agent-instructions etc.) | **Out of Stream 2** — owned by PRG-03/PRG-14 per N.0; no WI here (pointer only) |
| Estate-level ZDX generalization | **OUT** — parked as Nexus WI-519, untouched |
| Quarantined parallel ADR audit | Sealed until S2-15 (backstop diff only) |
| Identity-slice ADR rows | Marked in census; ride the runway tail (Prong A/B), not re-sliced here |

## 5 · Open items the operator should know (not decisions, just facts)

- **PRG-20 activation gate** ("IF clean-cut tail done") — cutover landed 06-18 but
  PRG-06 wasn't yet graduated at last roster update. Slicing (this plan) is Phase-P
  work and legitimate now; *execution start* of Waves 0+ should be checked against the
  gate at slice time — or treated as an implicit D-gate rider ("start now vs hold").
- The AGENTS.md overage is growing (~45.5k → 52.9k in a month). If Waves are delayed,
  S2-04 is separable: it could run as an early standalone after only D4.
- Effort totals: roughly 2 XS · 5 S · 7 M · 4 L across ~18 WIs (incl. folds) — a
  multi-week workstream at typical shepherd throughput, highly parallelizable after
  the D-gate.
