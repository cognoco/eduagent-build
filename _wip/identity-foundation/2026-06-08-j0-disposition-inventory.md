---
title: Phase J0 — Canon-Shape Disposition Inventory (Task T1)
date: 2026-06-08
phase: J0
plan: docs/plans/2026-06-08-identity-foundation-canon-shape-scrub.md
status: draft — awaiting architect ratification of §Open Decisions
---

# Phase J0 — Disposition Inventory

**What this is.** Task **T1** of the canon-shape scrub plan: a section-by-section disposition
map for the four identity-foundation domain docs scheduled to graduate `_wip/identity-foundation/`
→ `docs/canon/`. Each section gets exactly one disposition; non-canon material gets a named
destination; standing rules trapped in working-state get flagged for rescue. **No document is
edited yet** — this inventory is the input the architect ratifies before any scrub/move runs.

**Disposition rule (one per section):**
- **KEEP-L1** — standing rule (the *what*: contract / invariant / target model / vocabulary).
- **MOVE-L3** — plan/spec/runbook/register: open queues, deferred decisions, handoffs, sequencing.
- **MOVE-AUDIT** — decision history, ratification/counsel ledgers, sign-off, "why this changed" already backed by ADRs.
- **STALE** — archive/delete: obsolete draft state, temp stage codes, resolved scaffolding, duplicated status.

---

## The headline finding — trapped canon (graduation blocker)

The scrub plan assumes the four docs need *material removed* before they graduate. That holds for
three of them. The **PRD is the exception**: its Parts 1–9 are clean KEEP-L1, but **Part 10
("Decision Queue") + the appended counsel/grilling registers carry ~23 standing rules that exist
*only* there.** Routing Part 10 to audit as-is would *delete live canon*. These must be **lifted
into the canon body first** — which is authoring work, not scrubbing, and is the single biggest
scope question for J0 (see Open Decision 1).

The three smaller docs have the same disease in miniature: a handful of standing rules carry
opaque session codes (`I-PB-B2b`, `F1-BT-a`, `Path X`, `T3`) that must be expanded/renamed in
place — keep the rule, strip the code.

---

## Cross-doc disposition policy (recommended defaults — ratify in Open Decision 2)

These patterns recur across all four docs. Proposed uniform handling:

| Pattern | Where it appears | Recommended disposition |
|---|---|---|
| **Status banners / amendment stamps / "Next:" lines / decision-legends** | every preamble | STRIP (do not graduate); the *facts* live in ADRs/§R |
| **"What this is / What this is NOT" scope box** | every preamble | **KEEP-L1** — becomes the graduated doc's own header |
| **Ratification logs, decision ledgers** (ontology §R, domain §8, data §8) | all | MOVE-AUDIT — ADRs are the system of record |
| **Resolved agenda/index tables** (ontology §0 grill agenda, all `✅ RATIFIED`) | ontology | STALE — served its purpose; outcomes live in the bodies |
| **Opaque session codes inside standing rules** (`I-PB-*`, `F1-BT-a`, `T3`, `Path X`, `RC-*`, `ORG-*`, `CC-*`, `G7`) | ontology §1–§4, data §2A/§4/§5/§6 | KEEP rule, **replace code with plain-English expansion** |
| **`file:line` code citations / "vs-legacy" diff bullets** | ontology §7, data §4.x + §9, PRD Part 9 | MOVE-L3 (they rot at clean-cut); keep *conceptual* crosswalk only |
| **Handoff-to-Phase-X / open-legal lists** (domain §7, data §7) | all | MOVE-L3 |
| **Deferred-decision queues** (ontology §6, §8 flags) | ontology | MOVE-L3; ruled sub-items → MOVE-AUDIT |
| **Transition identifiers `T1`–`T6`** (domain §5) | domain-model | KEEP-L1 — these are *domain vocabulary*, not stage codes (do NOT scrub) |

---

## Per-doc section maps

### 1. `identity-ontology.md` (780 lines)

| Section | Disposition | Target | Note |
|---|---|---|---|
| Preamble (status/amendments/sources/legend) | STRIP + extract | header | extract "what this is/NOT" + the one-rule; drop the rest |
| §R — Ratification log | MOVE-AUDIT | `_history/` | pure decision trail, ADR-backed |
| §0 — Hot conflicts (grill agenda) | STALE | delete | all `✅ RATIFIED`; duplicate status |
| §1 Entities (§1.1–§1.5) | KEEP-L1 | canon | strip code cites (`profiles.ts:*`, `RC-01`, `ORG-04`, `inert/T1`) |
| §2 Edges (§2.1–§2.4) | KEEP-L1 | canon | §2.4 Payer: move `[DEFER]` B2B rider → MOVE-L3 |
| §3 Axes (§3.1–§3.5) | KEEP-L1 | canon | strip `[FOLDED]`/`[ALIGNED]` heading tags, `CC-06` cite |
| §4 Invariants (A–H, inv 1–30) | KEEP-L1 | canon | strip pointer parentheticals (`FLAG-2`, `E3/§6`, `PPA-R11`) from inv bodies |
| §5 Standard-model crosswalk | KEEP-L1 | canon | standing adopt/diverge table |
| §6 Deferred decisions | MOVE-L3 | open-decisions | ruled sub-items (D1/scheduler/invite-flow) → MOVE-AUDIT |
| §7 Current-code crosswalk | MOVE-L3 | impl notes | file:line cites rot at clean-cut |
| §8 Carried requirements & cleanup flags | MOVE-L3 | open-items | FLAG-3 is `[RESOLVED]` → STALE |
| §9 Supported use cases (UC-1) | MOVE-L3 | PRD personas | labelled "carry to PRD" |

### 2. `domain-model.md` (250 lines)

| Section | Disposition | Target | Note |
|---|---|---|---|
| Preamble | STRIP + extract | header | keep scope box; drop ratification stamp |
| §1 Entity–relationship model | KEEP-L1 | canon | clean |
| §2 Roles, capacities, authority model | KEEP-L1 | canon | clean |
| §3 Consent model | KEEP-L1 | canon | prose-ify `E4/REQ-2` + `FLAG-2` open-seam tokens |
| §4 Tenancy & governance | KEEP-L1 | canon | clean |
| §5 Transition lifecycle & scheduler | KEEP-L1 | canon | `T1`–`T6` are domain vocab — keep |
| §6 v1 family-join primitive | KEEP-L1 | canon | deferred-scope bullets = v1 boundary, keep as scope annotation |
| §7 Handoff to Phase E + open legal | MOVE-L3 | Phase-E/F spec | operational |
| §8 Decisions ledger | MOVE-AUDIT | ADRs | 3 ADR-less rows are open items → MOVE-L3 |

### 3. `data-model.md` (512 lines)

| Section | Disposition | Target | Note |
|---|---|---|---|
| Preamble (status/provenance/lockstep/out-of-scope) | STRIP + extract | header | keep "what this doc is" box |
| §1 The cut | KEEP-L1 | canon | append-only-forever rule |
| §2 Entity table inventory | KEEP-L1 | canon | relabel `Replaces (T1, inert)` column |
| §2A Pre-baseline amendments (.1–.5) | KEEP-L1 | canon | strip dated-sweep narrative + `I-PB-B2b` from headings; keep DDL |
| §3 Edge diagrams (.1–.2) | KEEP-L1 | canon | strip `ward→charge` sweep parenthetical |
| §4 Per-table rationale (.1–.9) | KEEP-L1 | canon | **expand `F1-BT-a`, `Path X`, `I-PB-*`, `I-C1` codes**; "vs-legacy" bullets → Open Decision 3 |
| §5.1 Scope (RLS, T3) | KEEP-L1 | canon | replace `T3` → "RLS rollout obligation" |
| §5.2 Migration sequencing | MOVE-L3 | runbook | explicit re-derivation aide |
| §5.3 Backwards compatibility | KEEP-L1 | canon | trim "launch-window luxury" framing |
| §5.4 Idempotency | KEEP-L1 | canon | clean |
| §6 Failure modes (.1–.5) | KEEP-L1 | canon | expand `I-C1`/`I-PB-B2b`/`I-E3` heading codes |
| §7 Handoff to Phase F + open legal | MOVE-L3 | Phase-F spec | operational |
| §8 Decisions ledger | MOVE-AUDIT | ADRs | findings-satisfaction table → Open Decision 4 |
| §9 Cross-references | MOVE-AUDIT | ADRs | drop file:line defect cites (rot) |

### 4. `identity-foundation-prd.md` (2426 lines)

| Section | Disposition | Target | Note |
|---|---|---|---|
| Preamble (`Status: DRAFT` + anchor key) | STRIP banner / KEEP anchor key | header | flip DRAFT→RATIFIED; keep navigation legend |
| **Part 1–9** (Principles, Entities, Capability, Consent/Age, Independence, Lifecycle, Required flows R1–R13, Definition-of-done, Crosswalk) | **KEEP-L1** | canon | clean except 4 embedded anomalies (§4.4 vendor tail; Part 8 `[P pending]` design note; §4.4/Part 5 footnotes; Part 9 open-call note) |
| **Part 10 — Decision Queue** + §A–§I appendices, counsel registers, Segments 2–5, code-verification logs, Phase-E fillers | **MOVE-AUDIT / MOVE-L3** — *after* lifting trapped rules | `_history/` + `docs/compliance/` | **see trapped-canon list below — DO NOT move before rescue** |
| Part 10 fully-ruled product params (§I-P1, §I-L1–L5, §I-P5/P6) | KEEP-L1 (lift) | canon body | locked numeric params w/ counsel basis — promote to Parts 4/6/7/8 |

---

## Trapped canon — rescue list (lift to body BEFORE routing Part 10 to audit)

These are load-bearing rules currently living ONLY in PRD Part 10 / registers. Each must be lifted
to a named canon-body home. (Line numbers are pre-scrub PRD positions.)

| # | Rule (telegraphic) | Now at | Lift to |
|---|---|---|---|
| 1 | Credentialed charge allowed; invite-flow is the only coherent mechanism | §D1 / §H | Part 5 / Part 7 |
| 2 | Consent holding-state preview must remain no-AI / no-collection | §D2 | Part 4 §4.3 |
| 3 | Stricter-wins: stricter of self-declared vs platform Age-Signal | §D4 | Part 4 §4.1 |
| 4 | No product block on store-mediated under-18 payment; "Notify Parent" for managed child | §E0 | Part 3/5 |
| 5 | Consent-age crossing: visibility → opt-in default-off, never auto-on | §E1 | Part 6 / R9 |
| 6 | Declared residence is source of truth; location/VPN never re-gates | §E2 | Part 4 §4.2 |
| 7 | De-credential disallowed; manual-ops-only | §E10 | Part 7 (negative req) |
| 8 | Minor may not nominate own consent authority (ban minor-initiated Guardianship) | §E13 | Part 7 / Part 3 |
| 9 | Managed ≠ consent-gated: capable managed person's export/delete routes to self | §E5 | Part 5 / Part 6 |
| 10 | Reaching consent age does NOT graduate teen out of child protection (flat-18 pole) | §I-0.1 | Part 4 §4.1 |
| 11 | All minors pinned to one papered LLM endpoint; guard test required | §I-A1-GATE1 | Part 8 / launch |
| 12 | `lawfulBasis`/`termsAccepted` field required in data model | §I-A2 | Part 8 / Part 9 + data-model |
| 13 | No emotion/intention inferred from biometrics; voice = transcription only | §I-E1bis master AC | Part 3 / Part 8 |
| 14 | Internal-state vocabulary functional-only; CI static-analysis guard | §I-E1bis | Part 8 / Part 3 |
| 15 | Two OSA forward-only guards (no verbatim learner-quote in guardian schema; dated OSA note) | §I-E2 | Part 8 |
| 16 | S1–S8 survivor table + `legal_hold` flag blocks every delete path | §I-C1 | Part 6 / Part 8 + data-model |
| 17 | Retain-tier write captured at event-time, not delete-time | §I-C1 | Part 6 |
| 18 | 8 conditions for lawful guardian-initiated child delete | §I-C2 | Part 7 R6 / Part 8 |
| 19 | Scheduler runs at profile granularity for child profiles; sub shield ≠ blanket cover | §I-C3 | Part 6 / Part 8 |
| 20 | Re-point control in place, never fork; claim existing person, no parallel duplicate | §I-C4 | Part 6 / Part 7 R4 |
| 21 | Disclose profiling as present & lawful (Art 13(2)(f)); never claim ADM engineered-out | §I-A1-GATE2 | Part 4 §4.3 |
| 22 | AI-training toggle must not render for minor profiles | §I-A3 | Part 4 / Part 8 |
| 23 | DPIA-complete-before-first-real-child launch gate; DPO appointment mandatory | §I-E5 | Part 8 / launch |

Plus the locked product parameters in §I-P1–P6 / §I-L1–L5 (signup floor 13+, retention periods,
dormancy 24mo/30d-notice, moved-country grace, boundary-crossing verification methods, co-guardian
one-of/all-of) — these are KEEP-L1 and should be promoted to Parts 4/6/7/8 as canon, with the
counsel deliberation behind them routed to audit.

Smaller trapped rules in the other docs: ontology §6 ruled sub-items; domain §3 open-seam tokens
(`E4`/`FLAG-2`) need prose-ification not deletion.

---

## Resolved Decisions (ratified 2026-06-08)

All Open Decisions are ruled. J0 executes against these.

1. **Trapped-canon scope** → **J0 owns the full scrub + rescue + graduation**; the PM reviews the draft before it lands. The ~23 PRD Part-10 rules are lifted before Part 10 routes to audit.
2. **Disposition policy** → **adopted** as the uniform rubric, with the lone carve-out: keep `data-model.md` §8's invariant→table cross-check (condensed). All other §8 decision ledgers → audit (ADRs are SoR).
3. **"vs-legacy" / `file:line` cites** → **ship canon clean**; rot-prone cites + vs-legacy diffs → Phase-F migration runbook. Keep only the conceptual crosswalk (PRD Part 9).
4. **Compliance vs product split of the rescued rules** → product/architecture rules → PRD body; the ~10 compliance rules (EU AI Act, OSA, DPIA, COPPA toggle, retention survivors) → **`docs/compliance/`**.
5. **Canon layout** → **Option C**: graduate to **`docs/canon/identity/`** (`ontology.md`, `domain-model.md`, `data-model.md`, `prd.md`). Requires the ADR-0000 §I.4 amendment (drafted below).

## Rename: `mentor` → `supporter` (rides J0 — task T8)

Definitions are unchanged; **only the names swap.** Nothing from `docs/glossary.md` is authority here.

| Old | New | Role | Notes |
|---|---|---|---|
| `mentor` *(human capacity)* | **`supporter`** | Layer-2 helper edge-end | our Layer-2 definition stands verbatim |
| `mentee` | **`supportee`** | far end | |
| `mentorship` / `mentorship` table | **`supportership`** | the Layer-2 edge | data-model table + diagrams |
| `mate` *(AI)* | **`mentor`** | the AI entity | `mentor` is the formal/canon term; `mate` = product synonym **noted only in `CONTEXT.md`**, never used in canon |

Unchanged (ours wins, names and all): **guardian / charge / owner(dissolved) / admin / Payer / Guardianship**. Surfaces to edit: the four docs, `CONTEXT.md`, `MMT-ADR-0007`/`0008` (edited directly — ADRs mutable until ~Phase M), `identity-model-diagrams.html`, memory. The previously-planned AI `mentor`→`Mate` ~70-string code sweep is **cancelled** (AI stays `mentor`).

## `docs/glossary.md` — rogue artifact, being dismantled

Reverse-engineered from drifted code; **not canon** (status banner applied 2026-06-08). It is dismantled to proper homes, then **deleted after the bucket-2 design activity consumes it** (it is that activity's primary input — the term→code map + trap warnings). Three-bucket classification:

| § | Section | Bucket | Destination |
|---|---|---|---|
| 1 | Actors | **1 — ours wins** | discarded; CONTEXT.md/ontology own it. Harvest 3 drift-evidence items (shipped-copy `mentor`=AI cites; `isOwner` drift cite; "15-yo can be supporter" age-agnosticism) into the ontology current-code crosswalk |
| 2,3,4,5,8 | Naming convention · structure terms · notes taxonomy · learning-loop · modes | **2 — design** | **new learning-domain canon stream** (sibling to Stream 2, NOT its drain). §3 structure terms may ride Stream 2 into `architecture.md`; §4/§5/§8 need a real design pass. `app mode`/`proxy mode` already homed in `CLAUDE.md`/`audience-matrix.md` |
| 6,7 | Cards · Celebrations | **3 — peripheral** | Stream 2: principles → `ux-design-specification.md`; terms → a product-owned per-area `CONTEXT.md`; inventories → L3 register. No competing standalone glossary |

## Drafted: ADR-0000 §I.4 amendment (for ratification — task T10)

The current §I.4 layout line lists canon flat (`canon/ — architecture.md, prd.md, ux-design-specification.md, principles.md`). Proposed amendment (lockstep edit to `MMT-ADR-0000`, apply before the move):

> **Amendment (2026-06-08) — domain-canon sub-layout under `docs/canon/`.** The **estate spine** (`architecture.md`, `PRD.md`, `ux-design-specification.md`, `principles.md`) lives at the **`docs/canon/` root**. A **stream's domain canon** lives in a per-domain subfolder **`docs/canon/<domain>/`** (first instance: `docs/canon/identity/`). Stream domain canon is **standing peer canon**, indexed by `principles.md` / `docs/INDEX.md` — it is **not** merged into the spine docs, and the spine is the cross-cutting index over it, not its container. Filenames inside a domain folder drop the domain prefix (the folder supplies scope). This refines the §I.4 physical-layout rule; it does not change the five-layer model.

---

## Acceptance-check status (plan §Acceptance Checks)

Not yet run as pass/fail — the scrub has not executed. The stale-token scans were run as *discovery*
(results folded into the per-doc maps above). The plan's two `rg` gates become the exit check **after**
the scrub edits land; right now they still report the pre-scrub hits by design.
