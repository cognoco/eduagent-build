---
title: Phase H — architecture.md Identity-Foundation Carve-out — Implementation Plan
date: 2026-06-08
profile: design
spec: _wip/identity-foundation/ROADMAP.md (Phase H); _wip/identity-foundation/CANONICAL-SET.md (the lens)
status: draft
---

# Phase H — architecture.md Identity-Foundation Carve-out — Implementation Plan

**Goal:** Author one authoritative **Identity Foundation** section in
`docs/architecture.md` — the target identity / tenancy / role / consent / policy-engine
model — stated as *outcomes* (per `MMT-ADR-0000` §I.2), every claim cited to a
**Phase-G canonical-set member** (an ADR or a `data-model.md` §), superseding the
legacy as-is identity prose without yet line-editing it.

**Approach:** Read-only against the canonical set (the lens locks what H may cite).
Author the new section from the ADRs + `data-model.md`; mark the stale anchors as
superseded (full rewrite = Phase I); add a bounded canon-authorship preamble that
resolves the in-document `0016`↔`0000` root cause (architecture.md conflating canon
with decisions). No ADRs are edited — H *promotes rules up* and cites back.

## Why this is a `design`-profile plan
Canon authoring → "design-doc + acceptance criteria," not red-green TDD (repo
Planning Discipline). Each task's `done when:` is an **acceptance criterion** — the
content authored + the citation discipline satisfied — not a test.

## The citation boundary (hard)
H may cite **only** Phase-G canonical-set members (`CANONICAL-SET.md`, the corrected
**19-member** set): ADRs `MMT-ADR-0001, 0002, 0007–0016, 0000` and the four domain
docs. Anything not in the set is
**not** load-bearing. Domain-doc citations use current `_wip/identity-foundation/`
paths; **Phase J(0) rewrites them** to `docs/canon/` (accepted cost of front-of-J).

---

## Scope

In scope (H edits exactly these):
- `docs/architecture.md` — the new `## Identity Foundation` section; supersession
  markers at the legacy anchors; the canon-authorship preamble note.
- `docs/plans/2026-06-08-phase-h-architecture-identity-carveout.md` — this plan.
- `_wip/identity-foundation/_handoffs/2026-06-08-phase-h-close.md` — close handoff +
  the Phase-I worklist (the stale anchors H marked but did not rewrite).

Out of scope (must not change):
- The four domain docs + all ADRs — **read-only** (cited, not edited).
- `docs/specs/epics.md` — the frozen `ARCH-N` register; promotion/supersession of
  identity `ARCH-N` entries is **Phase I**.
- Line-by-line rewrite of legacy identity prose elsewhere in `architecture.md` —
  **Phase I** (H marks, I rewrites).
- The `_wip/` → `docs/canon/` move and the citation rewrite — **Phase J(0)/J(c)**.
- Estate-wide canon-authorship process consolidation — **Phase I / Stream 2** (H does
  only the in-`architecture.md` slice).

---

## File map (§3)

| File | H's one responsibility |
|---|---|
| `docs/architecture.md` | Add `## Identity Foundation` (the carve-out, T1–T5); add supersession markers (T6); add the canon-authorship preamble (T7). |
| `…/_handoffs/2026-06-08-phase-h-close.md` | Record the close + the Phase-I stale-anchor worklist + the J(0) citation-rewrite reminder (T8). |
| `docs/plans/2026-06-08-…carveout.md` | This plan. |

**Placement of the new section:** immediately **after** `## Core Architectural
Decisions` (architecture.md:307), as a new top-level `## Identity Foundation`. It does
not renumber existing sections (they are name-keyed `##`, not numbered).

---

## The carve-out outline + citation matrix (the decision)

Each subsection states the rule as an outcome and cites its member(s). This matrix
*is* the plan's core decision — it fixes what goes where and what backs it, so the
author does not re-derive.

| Subsection | Rule stated (outcomes only) | Cites |
|---|---|---|
| **H.a Identity model & tenancy** | **We own the identity/tenancy graph; Clerk = auth only**; `person` ≠ `login`; `organization` / `membership`; role primitive (vs capacities); **org & membership re-derived, not inherited**; org-of-one → family; scoping = the future RLS surface (`T3`). | `MMT-ADR-0001`, `MMT-ADR-0007`; `data-model.md` §2, §4.1–4.4, §5.1; `domain-model.md` |
| **H.b Capability split (Guardian / Mentor / Payer)** | **Guardian = consent only**; **Mentor = data-access only**; Payer = subscription **sub-field** (1 primary + ≤1 secondary, secondary = view+update PM); **charge** terminology (not "ward"); G-3 (exactly 1 Guardian/charge), G-4 (explicit-qualification ENUM), G-6 (explicit takeover on `charges.has_own_account`). | `MMT-ADR-0008`, `MMT-ADR-0002`, `MMT-ADR-0015`; `data-model.md` §2A.4, §4.6–4.7 |
| **H.c Consent & age model (Path X)** | Three-axis age model; **13+ consent-capacity floor**; **sub-13 built-but-gated** (Path X: v1 closes 13+ load-bearing, v1.1 closes sub-13); `consent_grant`; `AgeBracket 'child'`; age × residence `regimes`. **The legacy "11-15" framing is superseded.** | `MMT-ADR-0015`; `data-model.md` §4.8, §2A.5; `identity-foundation-prd.md` (age model); `domain-model.md` (consent) |
| **H.d Policy-engine spine, router/vetting, safety/judge** | Two-primitive engine (prohibition-floor + …) + regime taxonomy + knowledge axes + router key; **policy tables as data** (`regimes`/`policy_cells`/`policy_rules`), **DB-is-master**; **3-param runtime router ⟂ 4-axis offline vetting, hard split**; fail-closed → `CircuitOpenError`; separately-routable tutor/judge; **judgment-based safety (no app-owned denylist) + vendor-independent non-reasoning judge**; `allowed_models` + the `docs/registers/llm-models/` master (not canon — canon points at it). | `MMT-ADR-0013`, `MMT-ADR-0014`, `MMT-ADR-0016`; `data-model.md` §2A.1–2A.3; `docs/registers/README.md` |
| **H.e Lifecycle & clean-cut posture** | Durable transition scheduler + unified sweep; family-join **consolidation primitive** + `migration-pending` interim; **one-time baseline reset**, pre-launch clean cut (no flag, no backfill, no V0/V1 parallel run). | `MMT-ADR-0009`, `MMT-ADR-0010`, `MMT-ADR-0012`; `data-model.md` §5.2, §6.4 |

---

## Tasks

- [ ] **T1: Author H.a — Identity model & tenancy.** Write the subsection per the
  matrix row H.a. — done when: every claim is an outcome (no *why*-prose; rationale
  left to the cited ADR), and each claim carries an inline cite to `MMT-ADR-0001`,
  `MMT-ADR-0007`, or a `data-model.md` § from the H.a row; own-the-graph/Clerk-auth-only,
  org/membership-re-derived, and the `T3` scoping surface are all present.

- [ ] **T2: Author H.b — Capability split.** Write per matrix row H.b. — done when:
  Guardian-consent-only, Mentor-data-access-only, Payer sub-field (1+≤1), charge
  terminology, and G-3/G-4/G-6 are each stated and cited to `0008`/`0002`/`0015` or
  `data-model.md` §2A.4/§4.6–4.7; the deprecated "ward" term appears only as a
  "(was: ward)" supersession note.

- [ ] **T3: Author H.c — Consent & age model (Path X).** Write per matrix row H.c. —
  done when: the three-axis model, the **13+ floor**, **sub-13 built-but-gated**,
  `consent_grant`, `AgeBracket 'child'`, and age×residence regimes are stated and
  cited; an explicit sentence marks the legacy **"11-15"/"Strictly 11+"** model
  superseded by Path X (cite `MMT-ADR-0015` + PRD).

- [ ] **T4: Author H.d — Policy engine, router/vetting, safety/judge.** Write per
  matrix row H.d. — done when: the two-primitive engine, DB-is-master policy-tables,
  the 3⟂4 hard split, `CircuitOpenError`, the judgment-based-safety + vendor-independent
  judge, and the `allowed_models`/register-is-not-canon relationship are each stated
  and cited to `0013`/`0014`/`0016` + `data-model.md` §2A.1–2A.3 + `registers/README.md`.

- [ ] **T5: Author H.e — Lifecycle & clean-cut posture.** Write per matrix row H.e. —
  done when: the durable scheduler/unified sweep, the family-join primitive +
  `migration-pending` interim, and the no-flag/no-backfill clean cut are each stated
  and cited to `0009`/`0010`/`0012` + `data-model.md` §5.2/§6.4.

- [ ] **T6: Mark the legacy anchors superseded (do NOT rewrite).** At each principal
  stale identity statement in `architecture.md` — the "Ages 11-15"/COPPA-adjacent
  rows (≈66, 1648), "Family accounts… multi-tenancy" (≈96), "RBAC on profile metadata
  (parent, teen, learner)" (≈373), the `consent_state` enum example (≈573) — insert a
  one-line marker: `> **Superseded** by § Identity Foundation (MMT-ADR-00NN); rewrite
  tracked for Phase I.` — done when: a grep for the five legacy statements shows each
  carries a marker pointing to the carve-out + the responsible ADR; **no surrounding
  prose is rewritten** (that is I); every marked line is logged to the T8 Phase-I
  worklist.

- [ ] **T7: Add the canon-authorship preamble (the in-document `0016`↔`0000` fix).**
  Near the top of `architecture.md` (under the H1, before `## Project Context
  Analysis`), add a short note: this document is **L1 canon — outcomes, not whys**
  (`MMT-ADR-0000` §I.2); the *why* lives in ADRs and moves **lockstep** (§II.2); the
  `ARCH-1…ARCH-26` register is **frozen** and draining to ADRs (Part III, register in
  `docs/specs/epics.md`); authoring guide = `docs/adr/README.md`. — done when: the note
  exists and resolves the title's canon/decision conflation by stating the doc's role;
  it **only points to** existing `MMT-ADR-0000` (no ADR edit, no new ADR — this is
  promotion-by-pointer of an already-ratified rule, `0000` §II.3); a sentence scopes
  the **estate-wide** process consolidation **out** (→ Phase I / Stream 2).

- [ ] **T8: Self-review + Phase-I/J handoff.** Run the §6 self-review passes; write the
  close handoff. — done when: (1) **citation audit** — every claim in H.a–H.e traces
  to a canonical-set member, and **no** claim cites a non-member (spot-grep the
  inline cites against `CANONICAL-SET.md`); (2) **contradiction check** — no carve-out
  statement contradicts the locked set; (3) the handoff records the **Phase-I worklist**
  (every anchor T6 marked) **and** the **J(0) reminder** (rewrite the `_wip/` domain-doc
  cites to `docs/canon/`); (4) name/term consistency — "charge" not "ward", "Guardian
  edge", "policy-engine spine" used consistently across H.a–H.e.

---

## Self-review checklist (run before declaring the plan executed — §6)
1. **Coverage:** every canonical-set member that states an identity rule maps to a
   matrix row (the ADRs `0001`,`0002`,`0007`–`0010`,`0012`–`0016` + the four domain docs
   are each cited by some subsection; `0011` is the data-model baseline cited
   transitively via `data-model.md`; `0000` is cited by T7).
2. **Deferred-decision scan:** no "TBD"; the matrix fixes every subsection's content +
   cites; placement (after Core Architectural Decisions) and the process-note location
   (top preamble) are both decided here.
3. **Name/type consistency:** `person`/`login`/`organization`/`membership`/
   `subscription`/`guardianship`/`mentorship`/`consent_grant` spelled per `data-model.md`;
   `CircuitOpenError`, `allowed_models`, `regimes`/`policy_cells`/`policy_rules`,
   `AgeBracket 'child'` spelled per the ADRs.

## Open decisions for the approver (resolve before T1)
1. **T7 placement** — recommend the in-document preamble note (above). Alternative:
   put the canon-authorship clarification in `docs/adr/README.md` (the operating guide)
   instead of `architecture.md`. Recommendation: **architecture.md preamble** — it
   fixes the conflation *where the title embodies it*; the README already covers ADRs.
2. **T7 in H vs I** — ROADMAP says "Phase H/I." Recommend **keep in H** (you are
   authoring into the doc; establish its role as you do). Movable to I if you'd rather
   H be carve-out-only.
