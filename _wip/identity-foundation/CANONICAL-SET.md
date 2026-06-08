# Identity-Foundation Canonical Set — locked 2026-06-08 (Phase G)

**What this is.** The *explicit, named* set of documents that constitute the ratified
canon of the identity-foundation carve-out as of the close of Phase F. Phase G is
**confirmation only** — every document below already exists and was ratified in its
own phase; this file does the one thing the runway had not yet done: state the set
*as a set*, name each member's **role**, and fix it as the **lens** the downstream
work reads against.

**Why it exists (its two jobs).**
1. **Lens for the gap analysis (Phase L).** L tags every audit finding with a
   `canonical-set-source`. That column has no meaning until "the canonical set" is a
   closed, enumerated list. This file *is* that list.
2. **Gate for the `architecture.md` carve-out (Phase H).** H authors the *one* deep
   new piece of canonical prose (the identity-foundation section of `architecture.md`),
   cited to ADRs + the data model. H may cite **only** what is in this set; anything
   not here is not yet canon and must not be load-bearing in H.

**Boundary.** This file *names and confirms*; it does **not** edit, re-home, or
restructure any member (that is Phase J) and does **not** author new canon (that is
Phase H). Membership is the deliverable.

**Why the members live where they do (and why G moves nothing).** Per
`MMT-ADR-0000` §I.4 — the physical-placement rule — the layers land in different
homes *on different timelines*:

- **ADRs (L2) are global from birth** → already at `docs/adr/`. ✅ placed.
- **Registers (L3, type-named)** → already at `docs/registers/`. ✅ placed.
- **A stream's domain canon (L1) incubates in `_wip/<slug>/` until its clean cut,
  *then* folds into `docs/canon/`.** So the four domain docs below are *correctly*
  in `_wip/identity-foundation/` right now — moving them to `docs/canon/` during the
  planning runway would **violate** §I.4. They graduate at the **clean-cut build
  (after Phase P)**, not in G–P.

The **only** physical relocation the runway performs is **Phase J step (c)** — and
it touches *different* files: the **loose root estate canon** (`architecture.md`,
`PRD.md`, `ux-design-specification.md`) → `docs/canon/`, plus the artifact drains.
That step is **gated on this Phase-G lock** (you can't sort loose docs into
canon/L3/archive until "the canonical set" is a closed list — which this file makes
it). So G is the *prerequisite* that unblocks the move, not the move itself.

---

## The set

Grouped by layer (per `docs/adr/MMT-ADR-0000` §I.1 five-layer model). Every path is
relative to the repo root.

### L1 — Canon (the *what*: contracts, invariants, target model)

| # | Document | Role in the set | Ratified |
|---|---|---|---|
| 1 | `_wip/identity-foundation/identity-ontology.md` | The **conceptual vocabulary** — entities, roles, edges, the terms every other doc is written in. Source of the shared language. | Phase A/C (ontology v1) |
| 2 | `_wip/identity-foundation/domain-model.md` | The **domain model** — entities / roles / consent model / tenancy; org & membership **re-derived, not inherited**. | Phase D · 2026-06-03 |
| 3 | `_wip/identity-foundation/data-model.md` | The **target schema** — 8 tables + cut strategy + the F.1 lockstep SQL for the `MMT-ADR-0015` amendments (`kind` column, seam columns, `allowed_models`). | Phase E · 2026-06-04, amended F.1 · 2026-06-08 |
| 4 | `_wip/identity-foundation/identity-foundation-prd.md` | The **product layer** — personas (6), the three-axis age model, Path X (13+ load-bearing v1 / sub-13 built-but-gated), ICP-vs-persona distinction. | Phase B · 2026-06-02 (Part 10 ripple) |

### L2 — Decisions (the *why*: ADRs)

The identity-foundation decision trail. `docs/adr/MMT-ADR-0007…0016` plus the governing
meta-ADR `0000`.

| # | ADR | Role in the set | Status |
|---|---|---|---|
| 5 | `MMT-ADR-0000` — documentation layer model + decisions layer | The **governing meta-ADR**: the 5-layer model, the significance gate, the lockstep rule, §I.4 physical layout. **Incl. its two amendments** — memory↔canon boundary (2026-06-07) and `docs/registers/` L3 sibling (2026-06-08). | Accepted (Phase C) + 2 amendments |
| 6 | `MMT-ADR-0007` — core identity entity and role model | Entities + roles primitive. | Accepted · Phase D |
| 7 | `MMT-ADR-0008` — guardianship global edge, derived operation | Guardianship as a global edge, not a row attribute. | Accepted · Phase D |
| 8 | `MMT-ADR-0009` — durable transition scheduler, unified sweep | Age/consent transitions via a durable scheduler. | Accepted · Phase D |
| 9 | `MMT-ADR-0010` — family-join consolidation primitive | The family-join primitive. | Accepted · Phase D |
| 10 | `MMT-ADR-0011` — Phase-E data-model realization | The 2026-06-04 data-model **baseline**. | Accepted · Phase E |
| 11 | `MMT-ADR-0012` — one-time baseline reset | The pre-launch one-time migration collapse (clean-cut). | Accepted · Phase E |
| 12 | `MMT-ADR-0013` — policy-engine spine | Two-primitive model, regime taxonomy, knowledge axes, router key. The engine's *shape*. | Accepted · 2026-06-07 |
| 13 | `MMT-ADR-0014` — router runtime / vetting split | 3-param runtime router ⟂ 4-axis offline vetting; hard split; supersedes prior routing canon; fail-closed → `CircuitOpenError`; separately-routable tutor/judge roles. | Accepted · 2026-06-07 |
| 14 | `MMT-ADR-0015` — pre-baseline data-model amendments | Payer sub-field, Sub-admin-as-profile-mgmt, charge terminology + G-3/G-4/G-6, `AgeBracket` 'child', knowledge assertions, `allowed_models`. Amends `0011`. | Accepted · 2026-06-07 |
| 15 | `MMT-ADR-0016` — safety & judge architecture | **Repurposed 2026-06-08** to judgment-based safety (no app-owned denylist) + a vendor-independent, non-reasoning judge. Model picks moved *out* to the register. | Accepted · 2026-06-06, re-scoped 2026-06-08 |

### L3 — Operational (registers; supporting specs)

| # | Artifact | Role in the set | Note |
|---|---|---|---|
| 16 | `docs/registers/` (README + `llm-models/master.md` + `llm-models/vetting/2026-06-06-launch-set-iteration-1.md`) | The **vetted-model master + immutable provenance trail**, backing `MMT-ADR-0014`. Type-named L3 sibling added to §I.4 by the 2026-06-08 ADR-0000 amendment. | **NOT canon** — canon points *at* it; DB-is-master image. Confirmed *as a member by reference* (the register pattern), not as canon. |
| — | `docs/specs/2026-06-06-llm-routing-and-judge-architecture.md`, `docs/specs/2026-06-06-llm-routing-gpt-oss-cerebras-build.md` | The concrete provider/model picks + build spec; **supersede `R-5`'s abstract sketch**. | **Supporting L3, not canon.** Named so H knows they exist; they are not lens members. |

### Audit-trail (provenance, immutable)

| # | Artifact | Role in the set | Lifecycle |
|---|---|---|---|
| 17 | `_wip/identity-foundation/2026-06-XX-a-vs-b-decision-capture.md` | The **A-vs-B decision-capture memo** — the 25 ratified decisions from the 2026-06-06 grilling session, in their strongest defensible form, tagged against prior canon. The **provenance/audit trail** behind ADRs `0013`–`0016`. | **Option III grilling record** — preserved as a tagged commit, **not updated**. Current truth lives in the ADRs; the memo is the audit trail. |

---

## Memo sign-off (recorded here, per Option III)

The memo's `§9` carries the sign-off **block** (the 25 decisions, who signs which
sections). Its header status line still reads *"pending PM sign-off"* — that line is
**stale by design**: the memo's own §8 Option-III lifecycle says the artifact is
"preserved as a tagged commit, **not updated**," so the header is frozen at draft
time and must not be edited.

**PM sign-off is hereby confirmed at Phase G (2026-06-08).** The §6/§7 decision lists
the memo asks the PM to sign are ratified; the architect's §4/§5 routing+vetting
decisions are ratified (and have since been carried into `MMT-ADR-0014`/`0016`).
This confirmation — in the *live* canonical-set doc — is the system-of-record for the
sign-off; the frozen memo header is superseded by it. (Counsel's `R-1` ruling remains
the only outstanding signature — **HW-2**, a tracked contingency, not launch-blocking.)

---

## Watch-outs the lens carries (for L and H)

- **Stale `.claude/memory/` "Strictly 11+" constraint.** Superseded by **Path X**
  (13+ consent-capacity floor; sub-13 built-but-gated). It is a **Phase-J cleanup
  target** — do **not** treat it as canon. Not a member of this set.
- **Deep provenance citations resolve by name, not path.** Citations inside the
  ratified `identity-ontology.md` / `identity-foundation-prd.md` point at files now
  moved to `archive/` or `_research/`. They resolve by name-search; do not assume the
  literal path is live.
- **`MMT-ADR-0016` is the repurposed one.** Anything citing 0016 for *model picks* is
  reading the pre-2026-06-08 scope — picks now live in `docs/registers/llm-models/`.

---

## Status

**Phase G canonical set: LOCKED 2026-06-08.** Membership is closed at 17 entries
(15 canon L1/L2 + 1 register-by-reference + 1 audit-trail memo; 2 supporting specs
named-but-not-members). This is the lens for Phase L and the citation boundary for
Phase H. Changes to the set after this point are themselves ADR-class events.
