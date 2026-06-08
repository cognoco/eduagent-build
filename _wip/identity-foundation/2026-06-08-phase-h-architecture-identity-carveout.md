---
title: Phase H — architecture.md Identity-Foundation Carve-out — Implementation Plan
date: 2026-06-08
profile: design
spec: _wip/identity-foundation/ROADMAP.md (Phase H); _wip/identity-foundation/CANONICAL-SET.md (the lens)
status: done
---

> **Executed 2026-06-08.** All tasks T1–T7 complete. The `## Identity Foundation`
> section is authored in `docs/architecture.md` with transitional markers; self-review
> (citation audit) clean. Close handoff: `_handoffs/2026-06-08-phase-h-close.md`.

# Phase H — architecture.md Identity-Foundation Carve-out — Implementation Plan

**Goal:** Author one authoritative **Identity Foundation** section *into the single
`docs/architecture.md`* — the target identity / tenancy / role / consent / policy-engine
model, stated as *outcomes* (`MMT-ADR-0000` §I.2), every claim cited to a **Phase-G
canonical-set member** — and mark the document's transitional state so new ratified
canon is unambiguously distinguishable from legacy-pending content.

**Approach (plop-and-defer).** Author the carve-out as a clean, **target-idiom,
self-contained, relocatable** section — the *beachhead* of the eventual rebuilt
`architecture.md`. Do **not** restructure the rest of the doc: the full
structural rebuild + `ARCH-N` reverse-engineering is **Stream 2** (its inputs come
from K–P). Leave **temporary, greppable transitional markers** so the doc is honest
about what's new-canon vs legacy until Stream 2 strips them. No ADRs are edited — H
*promotes rules up* and cites back.

**Why plop-and-defer, not rebuild-now:** content-readiness and structure-readiness are
out of phase. The identity *content* is ratified now; the whole-doc *structure* can't
be authored well until the audits (K) + gap analysis (L) exist. So author the content
now and let the structure be decided in Stream 2 — plopping is *relocate-later*,
rebuilding-now is *rebuild-twice at the point of least information*. Single doc
throughout (no parallel architecture document — explicit constraint).

## Why this is a `design`-profile plan
Canon authoring → "design-doc + acceptance criteria," not red-green TDD (repo
Planning Discipline). Each task's `done when:` is an **acceptance criterion**.

## The citation boundary (hard)
H may cite **only** Phase-G canonical-set members (`CANONICAL-SET.md`, the corrected
**19-member** set): ADRs `MMT-ADR-0001, 0002, 0007–0016, 0000` and the four domain
docs. Anything not in the set is **not** load-bearing. Domain-doc citations use current
`_wip/identity-foundation/` paths; **Phase J(0) rewrites them** to `docs/canon/`.

---

## Scope

In scope (H edits exactly these):
- `docs/architecture.md` — the new `## Identity Foundation` section (T1–T5) + the
  transitional markers (T6). **No other section's prose is restructured.**
- `_wip/identity-foundation/2026-06-08-phase-h-architecture-identity-carveout.md` — this plan.
- `_wip/identity-foundation/_handoffs/2026-06-08-phase-h-close.md` — close handoff +
  the Phase-I worklist + the J(0) reminder.

Out of scope (must not change):
- The four domain docs + all ADRs — **read-only** (cited, not edited).
- Line-by-line rewrite of legacy identity prose elsewhere in `architecture.md` —
  **Phase I** (H *marks*, I *rewrites*).
- `docs/specs/epics.md` — the frozen `ARCH-N` register; identity-`ARCH-N`
  promotion/supersession is **Phase I**; the registry-wide drain is **Stream 2**.
- **Canon-authorship process + the `0016`↔`0000` reconciliation** — **Phase I** owns
  this (ROADMAP I-row (c)); H does not author it.
- **Full `architecture.md` structural rebuild + `ARCH-N` reverse-engineering** —
  **Stream 2** (sequenced by the master plan, O).
- The `_wip/` → `docs/canon/` move + citation rewrite — **Phase J(0)/J(c)**.

---

## Transitional marker convention (the new-vs-legacy requirement)

Until the Stream-2 rebuild, the doc carries **temporary, visible, greppable** markers
on three stable tag tokens so any reader/agent can tell ratified-new from legacy at a
glance — and so Stream 2 can `grep` and strip them cleanly:

- **`[TRANSITIONAL — DOC STATE]`** — one banner at the top of `architecture.md` (under
  the H1). States: the doc is mid-refresh; the **Identity Foundation** section is
  **new, ratified canon**; **every other section is legacy** (pre-refresh setup-record
  content, pending the Stream-2 rebuild); where legacy conflicts with Identity
  Foundation, Identity Foundation wins.
- **`[CANON-NEW · ratified]`** — one banner directly under `## Identity Foundation`.
  States: authored Phase H from the locked canonical set; outcomes-only
  (`MMT-ADR-0000` §I.2); relocatable unit (Stream-2 re-homes it intact).
- **`[LEGACY-REVIEW]`** — a one-line marker at each identity-*contradicting* legacy
  anchor (the direct conflicts a reader could be misled by). Points to the superseding
  section + ADR; rewrite tracked → Phase I.

The doc-level banner makes the binary unambiguous (Identity Foundation = new; all else
= legacy) **without** exhaustively tagging every legacy section — per-section legacy
review is Phase I / Stream 2, not H.

---

## File map (§3)

| File | H's one responsibility |
|---|---|
| `docs/architecture.md` | Add `## Identity Foundation` (carve-out, T1–T5); add the three transitional markers (T6). |
| `…/_handoffs/2026-06-08-phase-h-close.md` | Close + Phase-I worklist (marked anchors) + J(0) citation reminder (T7). |
| `_wip/identity-foundation/2026-06-08-…carveout.md` | This plan. |

**Placement:** new top-level `## Identity Foundation`, immediately **after** `## Core
Architectural Decisions` (architecture.md:307). Existing sections are name-keyed `##`
(not numbered) — no renumbering. The section is self-contained so Stream 2 relocates it
as one unit.

---

## The carve-out outline + citation matrix (the decision)

Each subsection states the rule as an outcome and cites its member(s). This matrix
*is* the plan's core decision — it fixes content + backing so the author does not
re-derive, and it pins the section's internal structure to the **canonical set**, not
to `architecture.md`'s legacy shape (the anchoring insulation).

| Subsection | Rule stated (outcomes only) | Cites |
|---|---|---|
| **H.a Identity model & tenancy** | **We own the identity/tenancy graph; Clerk = auth only**; `person` ≠ `login`; `organization` / `membership`; role primitive (vs capacities); **org & membership re-derived, not inherited**; org-of-one → family; scoping = the future RLS surface (`T3`). | `MMT-ADR-0001`, `MMT-ADR-0007`; `data-model.md` §2, §4.1–4.4, §5.1; `domain-model.md` |
| **H.b Capability split (Guardian / Mentor / Payer)** | **Guardian = consent only**; **Mentor = data-access only**; Payer = subscription **sub-field** (1 primary + ≤1 secondary, secondary = view+update PM); **charge** terminology (not "ward"); G-3 (exactly 1 Guardian/charge), G-4 (explicit-qualification ENUM), G-6 (explicit takeover on `charges.has_own_account`). | `MMT-ADR-0008`, `MMT-ADR-0002`, `MMT-ADR-0015`; `data-model.md` §2A.4, §4.6–4.7 |
| **H.c Consent & age model (Path X)** | Three-axis age model; **13+ consent-capacity floor**; **sub-13 built-but-gated** (Path X: v1 closes 13+ load-bearing, v1.1 closes sub-13); `consent_grant`; `AgeBracket 'child'`; age × residence `regimes`. **Legacy "11-15" framing superseded.** | `MMT-ADR-0015`; `data-model.md` §4.8, §2A.5; `identity-foundation-prd.md` (age model); `domain-model.md` (consent) |
| **H.d Policy-engine spine, router/vetting, safety/judge** | Two-primitive engine (prohibition-floor + …) + regime taxonomy + knowledge axes + router key; **policy tables as data** (`regimes`/`policy_cells`/`policy_rules`), **DB-is-master**; **3-param runtime router ⟂ 4-axis offline vetting, hard split**; fail-closed → `CircuitOpenError`; separately-routable tutor/judge; **judgment-based safety (no app-owned denylist) + vendor-independent non-reasoning judge**; `allowed_models` + the `docs/registers/llm-models/` master (not canon — canon points at it). | `MMT-ADR-0013`, `MMT-ADR-0014`, `MMT-ADR-0016`; `data-model.md` §2A.1–2A.3; `docs/registers/README.md` |
| **H.e Lifecycle & clean-cut posture** | Durable transition scheduler + unified sweep; family-join **consolidation primitive** + `migration-pending` interim; **one-time baseline reset**, pre-launch clean cut (no flag, no backfill, no V0/V1 parallel run). | `MMT-ADR-0009`, `MMT-ADR-0010`, `MMT-ADR-0012`; `data-model.md` §5.2, §6.4 |

---

## Tasks

- [ ] **T1: Author H.a — Identity model & tenancy.** Write the subsection per matrix
  row H.a, in target-canon idiom (outcomes-only; do **not** match the surrounding
  setup-log voice). — done when: each claim is an outcome with an inline cite to
  `MMT-ADR-0001`, `MMT-ADR-0007`, or a `data-model.md` § from the row;
  own-the-graph/Clerk-auth-only, org/membership-re-derived, and the `T3` scoping
  surface are all present.

- [ ] **T2: Author H.b — Capability split.** Per matrix row H.b. — done when:
  Guardian-consent-only, Mentor-data-access-only, Payer sub-field (1+≤1), charge
  terminology, and G-3/G-4/G-6 are each stated and cited to `0008`/`0002`/`0015` or
  `data-model.md` §2A.4/§4.6–4.7; "ward" appears only as a "(was: ward)" note.

- [ ] **T3: Author H.c — Consent & age model (Path X).** Per matrix row H.c. — done
  when: three-axis model, **13+ floor**, **sub-13 built-but-gated**, `consent_grant`,
  `AgeBracket 'child'`, age×residence regimes stated and cited; an explicit sentence
  marks the legacy **"11-15"/"Strictly 11+"** model superseded by Path X (cite `0015` +
  PRD).

- [ ] **T4: Author H.d — Policy engine, router/vetting, safety/judge.** Per matrix row
  H.d. — done when: two-primitive engine, DB-is-master policy-tables, the 3⟂4 hard
  split, `CircuitOpenError`, judgment-based-safety + vendor-independent judge, and the
  `allowed_models`/register-not-canon relationship are each stated and cited to
  `0013`/`0014`/`0016` + `data-model.md` §2A.1–2A.3 + `registers/README.md`.

- [ ] **T5: Author H.e — Lifecycle & clean-cut posture.** Per matrix row H.e. — done
  when: durable scheduler/unified sweep, family-join primitive + `migration-pending`
  interim, and the no-flag/no-backfill clean cut are each stated and cited to
  `0009`/`0010`/`0012` + `data-model.md` §5.2/§6.4.

- [ ] **T6: Apply the transitional markers (new-vs-legacy).** Per the marker convention
  above, add: (a) the `[TRANSITIONAL — DOC STATE]` banner at the top of
  `architecture.md`; (b) the `[CANON-NEW · ratified]` banner under `## Identity
  Foundation`; (c) a `[LEGACY-REVIEW]` marker at each identity-contradicting anchor —
  the "Ages 11-15"/COPPA rows (≈66, 1648), "Family accounts… multi-tenancy" (≈96),
  "RBAC on profile metadata (parent, teen, learner)" (≈373), the `consent_state` enum
  example (≈573) — each pointing to § Identity Foundation + the responsible ADR. — done
  when: `grep -n 'TRANSITIONAL — DOC STATE\|CANON-NEW\|LEGACY-REVIEW' docs/architecture.md`
  shows the doc banner once, the section banner once, and a marker at each of the five
  anchors; **no legacy prose is rewritten** (that is Phase I); every `[LEGACY-REVIEW]`
  anchor is logged to the T7 Phase-I worklist.

- [ ] **T7: Self-review + Phase-I/J handoff.** Run the §6 passes; write the close
  handoff. — done when: (1) **citation audit** — every claim in H.a–H.e traces to a
  canonical-set member, and **no** claim cites a non-member (spot-grep inline cites vs
  `CANONICAL-SET.md`); (2) **contradiction check** — no carve-out statement contradicts
  the locked set; (3) the handoff records the **Phase-I worklist** (every
  `[LEGACY-REVIEW]` anchor + the deferred canon-authorship/`0016`↔`0000` process work)
  **and** the **J(0) reminder** (rewrite `_wip/` domain-doc cites → `docs/canon/`);
  (4) term consistency — "charge" not "ward", "Guardian edge", "policy-engine spine"
  across H.a–H.e.

---

## Self-review checklist (run before declaring the plan executed — §6)
1. **Coverage:** every canonical-set member stating an identity rule maps to a matrix
   row (ADRs `0001`,`0002`,`0007`–`0010`,`0012`–`0016` + the four domain docs each
   cited; `0011` is the baseline cited transitively via `data-model.md`). `0000` is
   *not* H-authored — its in-doc application (canon-authorship preamble) is Phase I.
2. **Deferred-decision scan:** no "TBD"; the matrix fixes every subsection's content +
   cites; section placement and the marker convention are both decided here.
3. **Name/type consistency:** `person`/`login`/`organization`/`membership`/
   `subscription`/`guardianship`/`mentorship`/`consent_grant` per `data-model.md`;
   `CircuitOpenError`, `allowed_models`, `regimes`/`policy_cells`/`policy_rules`,
   `AgeBracket 'child'` per the ADRs.

## Resolved framing decisions (no open forks)
- **Host:** single `architecture.md` (no parallel doc). ✔
- **Structural rebuild:** deferred to **Stream 2** (not H, not now). ✔
- **Canon-authorship process / `0016`↔`0000`:** moved to **Phase I** (ROADMAP I-row (c)). ✔
- **New-vs-legacy clarity:** the transitional marker convention (T6). ✔
