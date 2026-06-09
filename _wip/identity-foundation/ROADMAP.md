# Identity Foundation — Pre-Implementation Roadmap

**Scope:** the thinking/decision runway only — drift map → product intent → doc strategy →
architecture (domain + data model + the policy-engine/router spine) → the firming, classification, and
planning runway → the **"ready to start implementation" gate (the exit of Phase P)**. This file is
**not** an implementation plan, and **no Cosmo work items are created until Phase P slices them.**

**Tracking:** repo-only; this file is the single source. Deliverables land as sibling docs (see
README index).

**Status: 2026-06-09.** Phases **A–J complete** — G locked the canonical set (`CANONICAL-SET.md`, initially **19 members** after the 0001/0002 correction; **20 after J0 added the compliance register**) + seeded the documentation index (`docs/INDEX.md`); **H authored the `## Identity Foundation` carve-out** into `docs/architecture.md` (plop-and-defer, relocatable, cited to the set + `data-model.md`, transitional markers applied); **I closed the sub-gated pass** (I-a legacy `architecture.md` anchors resolved; I-b identity `ARCH-N` dispositions — `ARCH-8`→`MMT-ADR-0017`, `ARCH-9` superseded, `ARCH-7` stands; I-c canon-authorship process + the `MMT-ADR-0000` "no document is the sole system of record" guard / `0016`↔`0000`). **J0 graduated the identity domain canon to `docs/canon/identity/`, rescued compliance obligations to `docs/compliance/identity-compliance-register.md`, and completed the human `mentor`→`supporter` rename.** **Phase J complete 2026-06-09** — J1 (memory-pointer alignment) + J2 (agent-doctrine + routing-doctrine repoint) + J3 (docs-tree conformance: zero moves, remainder deferred to Stream 2). **K+L are now in flight** (🟡, started 2026-06-09) — running *together* via the `identity-foundation-k-l-consolidation.js` workflow (run `wf_875e3fa8-4bf`); output not yet landed, see the K/L rows. Phase E ratified the data model
(`docs/canon/identity/data-model.md`) + 2 ADRs (`MMT-ADR-0011` data-model realization · `MMT-ADR-0012` one-time baseline
reset); ontology + `domain-model.md` + `CONTEXT.md` moved in lockstep. The 8 tables + structural
`person_retain` set are a fresh create-from-empty baseline; from it forward, append-only migrations
are absolute.

**Since the 2026-06-04 data-model lock, the runway grew.** A v1 launch-scope investigation — *does v1
serve sub-consent-age minors, or defer them to v2?* (the **"A-vs-B" decision**) — ran 2026-06-01→06-05
and surfaced work we did **not** previously know the runway owed: two new load-bearing architectural
lanes (a **policy / business-rules engine** and a **model router**), a persona-set refinement (5→6),
a capability split (Payer / Guardian / Supporter / Subscription-administrator), a charge-terminology
change ("ward" → "charge"), and the 13+ launch floor / sub-13 built-but-gated posture, see threads.
All of it is captured and **signed** in the decision-capture memo (`2026-06-XX-a-vs-b-decision-capture.md`,
ratified 2026-06-06; the PM has since confirmed sign-off). That memo enumerated **ten work packages**
("WP-1".."WP-10"); this roadmap folds them into the phases below, referencing each by its memo ID in
parentheses so the working terms stay traceable.

**Where this leaves the phase structure.** Phase **F** now carries a **spine sub-phase (F.1)** — the
policy-engine + router decisions and their decision records — that must close before the deep
architecture authoring (Phase H) can cite them. Phases **G–P** keep their shape but inherit the new
content (consent-category model, engine, router, personas, charge terminology, the age-floor split) as
*inputs*. The roadmap's single end-state is unchanged: *"ready to start implementation"* = the exit of
Phase P (master plan signed + Cosmo work packages sliced). The execution phase starts after P; its
naming is Cosmo's, not the roadmap's.

---

## Operating principles (read with README guardrails)

- **Product intent FIRST; the model is derived from it** — never the reverse.
- **Archived plans = discussion input only** — re-derive, don't carry forward.
- **Pilot, not commitment.** The chunked-doc structure is being *trialed* in this folder. Every
  structural choice here is **reversible until Phase C ratifies it** — don't let the pilot's shape
  silently lock the repo-wide decision, and don't paint us into a corner with calls made before the
  full picture exists.
- **No premature categorization.** What counts as "identity-coupled" depends on the clean-cut
  target's *shape* — classify things (incl. the sibling plans) **after** the domain model exists.
- **Consent/COPPA under own-logins is load-bearing** — needs a functional spec + likely a legal
  check before any code touches it.

---

## Phases


| #     | Phase                                                   | Deliverable                        | Owner                       | Status | Depends on                   | Exit gate                                                                                          |
| ------- | --------------------------------------------------------- | ------------------------------------ | ----------------------------- | -------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **A** | Drift map (+ audit re-triage + sibling provisional-tag) | `_research/drift-map.md`                     | Claude                      | ✅     | —                           | drift quantified across intent / canonical docs / code; PM has concrete input                      |
| **B** | Product intent                                          | `product-intent.md`                | **PM** (Claude facilitates) | ✅     | A                            | Part 10 resolved +**dual sign-off** (B-tech ✓ 2026-06-02; B-product P✓ 2026-06-02; **4 ripples re-confirmed `T✓` 2026-06-03 — Part 10 §H**) |
| **C** | Doc-strategy decision (pilot)                           | **`MMT-ADR-0000`** (in `docs/adr/`) | You + Claude                | ✅     | A informs; piloted via B/D/E | **DONE 2026-06-03** — decisions layer ratified; convention + ratchet + 3 seed ADRs shipped; backfill deferred (Stream 2) |
| **D** | Domain model                                            | `domain-model.md` + ADR(s)         | Claude (you ratify)         | ✅     | B                            | **DONE 2026-06-03** — entities / roles /**consent model** / tenancy locked; org/membership **re-derived**, not inherited; 4 ADRs (MMT-ADR-0007–0010) placed |
| **E** | Data model                                              | `data-model.md` + ADR(s)           | Claude (you ratify)         | ✅     | D                            | target schema + cut strategy locked                                                                |
| **F** | Ready-to-plan gate (planning *for* the planning) **+ the policy-engine/router spine (F.1)** | — (F.1 deliverables: 3 ADRs + vetting runbook + memory/handoff — see Phase F.1 detail) | You (F); Claude drafts F.1 | ✅ | B, D, E + threads | **DONE 2026-06-08** — G–P shape ratified; `inv 17` rephrased; sibling-plan re-triage scoped; F.1 closed (spine ADRs ratified, `data-model.md` lockstep SQL written, vetting runbook drafted, memo/handoff/memory landed); gap analysis deferred to L; master plan deferred to O |
| **G** | Lock the canonical set for the identity-foundation carve-out | `CANONICAL-SET.md` + seeded `docs/INDEX.md` | You + Claude                | ✅     | F                            | **DONE 2026-06-08** — canonical set **locked** in `CANONICAL-SET.md` (current membership/count lives there), each role named, memo sign-off recorded (Option III); the **documentation index** seeded at `docs/INDEX.md` (identity-foundation canon fully indexed; estate-wide = Phase J/Stream 2) + wired from `CLAUDE.md`/`AGENTS.md`. Set is the lens for the gap analysis (L) and the citation boundary for H |
| **H** | Author the `architecture.md` identity-foundation carve-out | `## Identity Foundation` section in `docs/architecture.md` | Claude (you ratify)         | ✅     | G                            | **DONE 2026-06-08** — `## Identity Foundation` authored (plop-and-defer: single doc, target-idiom, **relocatable**): 5 subsections (identity/tenancy · capability split · consent/age model · policy-engine spine + router/vetting + safety/judge · lifecycle/clean-cut), outcomes-only, cited to the 19-member set + `data-model.md` §s. **Transitional markers** applied (doc banner + section banner + 5 `[LEGACY-REVIEW]` anchors). Self-review: citation audit clean (13 ADRs, all members). Canon-authorship/`0016`↔`0000` **moved to I**; legacy-anchor rewrites = **Phase I**; full rebuild = **Stream 2**. Handoff: `_handoffs/2026-06-08-phase-h-close.md` |
| **I** | Sub-gated pass on the rest of `architecture.md` + `ARCH-N` touch (identity-foundation domain) | edited `architecture.md` + `docs/adr/` promotion/supersession | Claude (you ratify)         | ✅     | H                            | **DONE 2026-06-08** (branch `identity-foundation-phase-i`; handoff `_handoffs/2026-06-08-phase-i-close.md`). **I-a** ✓ 5 `[LEGACY-REVIEW]` anchors resolved + banner/title/preamble/frontmatter — `architecture.md` now self-IDs as L1 canon. **I-b** ✓ `ARCH-9` superseded (→ `MMT-ADR-0014`/`0016`); `ARCH-8` promoted (→ new `MMT-ADR-0017`, citations migrated); `ARCH-7` stands (scope-key note). **I-c** ✓ "How canon is authored" in `adr/README.md` + `MMT-ADR-0000` "no document is the sole system of record" guard (the lasting `0016`↔`0000` reconciliation) |
| **J** | **Four-gate canon/memory/docs alignment** — full alignment activity, split to avoid overloading | J0 scrub/move plan + memory-disposition inventory + pointer-layer agent docs + docs-tree conformance decisions | Claude (you ratify)          | ✅     | I **+ the documentation index + the ratified memory↔canon rule** | **J0 DONE 2026-06-08** — canon-shape scrub + domain-canon graduation + compliance-register rescue + human `mentor`→`supporter` rename. **J1 DONE 2026-06-09** — memory pointer alignment (1 delete, 3 repoints, 1 keep; `2026-06-09-j1-memory-disposition-inventory.md`). **J2 DONE 2026-06-09** — agent-doctrine + `docs/project_context.md` routing-doctrine repoint (5 routing repoints → `MMT-ADR-0014`/`0018` + model register; clause (a) empty; `ARCH-9` already absent; `2026-06-09-j2-doctrine-routing-disposition.md`). **J3 DONE 2026-06-09** — docs-tree conformance: identity surface already §I.4-conformant + no mislocated-citation defect → **zero moves**; all nonconformant loose-canon / nonstandard-dirs deferred to Stream 2 with named reasons; `audience-matrix.md` + `glossary.md` explicitly ruled (`2026-06-09-j3-docs-tree-disposition.md`). **Phase J complete.** Estate-wide drains remain Stream 2 unless explicitly pulled into J3 |
| **K** | **Consolidation activity** — produce the consolidated-audit document (includes canon-contradiction check) | `docs/audit/2026-05-29-full-audit/RECONCILED.md` (or similar) | Claude (you ratify)         | 🟡 **IN PROGRESS** (2026-06-09) — K+L running **together** via the `identity-foundation-k-l-consolidation.js` workflow (session `a3565d5c`, run `wf_875e3fa8-4bf`, task `wyz4c5mgf`); ~45–60 min run; output not yet landed (no `RECONCILED.md`/gap doc on disk, no branch yet) | J                            | see the *K exit gate* below |
| **L** | Unified gap analysis                                    | a single delta document            | Claude                      | 🟡 **IN PROGRESS** (2026-06-09) — see K; the same workflow run produces L's delta doc in the same pass (classify→verify lane over ~170 rows) | K                            | one row per finding, tagged `(source-audit, source-finding-id, domain, classification, in-scope?, defer-to-which-workstream?, execution-blocking-if-deferred?, canonical-set-source)`; reads the consolidated-audit (K's output) + the canonical set (G–J) + the as-is. The `execution-blocking-if-deferred?` tag feeds the **N.0** Stream-2 pull-forward gate |
| **M** | Four-bucket triage                                      | the triage outcome, folded into the delta doc | You + Claude                | ⬜     | L                            | every finding lands in one of: (1) already handled in identity-foundation; (2) clear in for master plan; (3) clear out for master plan (named workstream); (4) defer (no workstream yet, or the workstream isn't mature enough) |
| **N** | Sequencing                                              | the dependency map + critical path, folded into the master plan | Claude (you ratify)         | ⬜     | M                            | **N.0** first rules the Stream-2 pull-forward partition (see *Phase N — detail*); then sequencing proper: a sequenced set of work packages with dependencies and bundles; the identity-foundation workstream is sequenced *first* (dogfood) |
| **O** | Remediation plan (the master plan)                     | a single document                   | Claude (you sign off)       | ⬜     | N                            | scope (in-scope work packages); out-of-scope workstreams (named, with rationale); sequenced work packages; dependency map; bundle grouping; Cosmo-enablement interface (B+/C− posture; identity-foundation as first dogfood) |
| **P** | Hand off to execution (Cosmo work-package slicing)     | the Cosmo WIs (sliced from O)       | You + Claude                | ⬜     | O                            | every work package is a Cosmo work item (or grouped into a Cosmo work package); the Cosmo top-down process enablement is the precondition (parallel workstream) |

---

## Phase F.1 — the policy-engine + router spine (the "A-vs-B" outcome)

**What F.1 is.** The v1 launch-scope investigation (the **"A-vs-B" decision** — serve sub-consent-age
minors at launch, or defer to v2) did not just answer that question; it surfaced two **new
load-bearing architectural lanes** the earlier runway never accounted for. F.1 is the sub-phase that
**captures those decisions as decision records (ADRs)** so the deep architecture authoring (Phase H)
has something to cite. It is *decision-capture for decisions already made*, not new architecture
authoring — that is why it sits under F ("planning for the planning"), not in the G–P authoring
runway.

**The decisions F.1 records** (all signed in `2026-06-XX-a-vs-b-decision-capture.md`, 2026-06-06):

- **A policy / business-rules engine**, living *inside* identity-foundation. It maps
  `(age × residence × known/unknown)` → policy. Its output is the union of **two primitives**: a
  **prohibition-floor** (rules that bind regardless of consent — e.g. a platform's under-18 closure)
  and a **consent-edge** (rules unlockable by guardian/user consent — e.g. GDPR Art 8 with
  reasonable-efforts verification). "Known/unknown" is **two independent axes** (known-age,
  known-residence), each with a determination method + confidence; **unknown defaults to
  most-restrictive**.
- **A model router**, provider-and-model-agnostic at the architecture level, sitting *downstream* of
  the engine: it reads a vetted `allowed-models` table, filtered by the engine's eligibility output.
  **Vetting and routing are a hard split** (different code, different schemas, different cadences,
  different owners) — the runtime picker never re-evaluates compliance.
- **A persona-set refinement (5→6)** and a **capability split**: the Payer field grants billing
  access only; the **Guardian** edge grants consent authority only; the **Mentor** edge grants data
  access only; **profile management** bundles with the Subscription-administrator role. The "full
  parent" is one human wearing all four hats.
- **The age-floor posture ("Path X").** v1's floor is **13+** as the *consent-capacity* floor (one of
  three independent axes — consent capacity 13–16 per-market, contract capacity 18, content level a
  continuous gradient that never gates). Sub-13 is **built but front-end-gated**; the US is excluded
  from sub-13 entirely in v1 to avoid COPPA. The **"Path X" split**: v1 closes the 13+ load-bearing
  gaps and future-proofs the schema in the pre-baseline window; **v1.1** closes the sub-13-specific
  gaps and ungates (demand-triggered, three preconditions). See the cross-cutting thread.

**The walkthrough (runs in parallel; results assumed back soon).** The policy-engine spine walkthrough
(`_walkthroughs/policy-engine-spine-walkthrough/`, package tightened + reconciled with the memo 2026-06-07) is a
90–120-min PM + **live legal counsel** + architect session that ratifies the *shape* of the engine via
six rulings: **R-0** two-primitive model · **R-1** the one COPPA legal call (does the
parent-operated, no-child-login path trip COPPA?) · **R-2** the regime-taxonomy enum · **R-3** the
knowledge axes · **R-4** the router key · **R-5** the launch-set *shape* (the provider names are
illustrative; the vetting workstream produces the actual set). **R-1 is the contingent fork** that
decides the sub-13-US branch below.

**Why planning proceeds without waiting for the walkthrough.** The memo already *signed* these
decisions; the walkthrough is **confirmatory** for R-0/R-3/R-4 and **fills enum values** (R-2/R-3) that
are inputs to the **ADR bodies**, not to the roadmap's structure. The roadmap is built from work-package
existence, sequence, and dependencies — stable regardless of the enum values. The **only** things the
walkthrough can move are (a) the R-1 contingent branch, encoded explicitly below, and (b) the
low-probability tail risk that R-0 is rejected (memo-ratified, so unlikely) — which would change the
ADR *bodies*, not the phase sequence. Net: F.1's planning is done now; F.1's *closure* waits only on
the walkthrough rulings + the ADR authoring (which is execution, downstream of this roadmap anyway).

### F.1 work packages (folded from the decision-capture memo; memo IDs in parentheses)

| Seq | Work package | Memo ID | Inputs / blocked by | Owner | Status |
|---|---|---|---|---|---|
| 1 | **Decision-capture memo** — the 25 signed A-vs-B decisions | (the memo) | — | Claude drafts / PM signs | ✅ signed 2026-06-06 |
| 2 | **Tighten the walkthrough package** — reconcile to the memo (WP namespace, R-5 framing, supersedes list, de-stale legal corpus) | — | the memo | Claude | ✅ 2026-06-07 |
| 3 | **Run the policy-engine spine walkthrough** — six rulings R-0..R-5 | (the walkthrough) | tightened package | facilitator-run (PM + architect; **no live counsel**) | ✅ **DONE** (landed via pull) — R-0/2/3/4 **LOCKED**, R-5 **REFINEMENT** (launch-set *shape* → `MMT-ADR-0014`; actual set → `docs/registers/llm-models/` master), R-1 **UNCLEAR-with-posture**; ledger filled. **Caveat: real counsel sign-off still owed (HW-2)** — not launch-blocking |
| 4 | **Policy-engine spine decision record** (`MMT-ADR-0013`, keystone ADR) — two-primitive model + regime taxonomy + two-axis knowledge model + engine→router flow | (**WP-1**) | memo §3; enum *seeds* from walkthrough R-0/R-2/R-3 | Claude drafted / architect ratified | ✅ **ratified 2026-06-07**; walkthrough enum seeds landed as DB-mastered inputs |
| 5 | **Data-model amendment decision record** (`MMT-ADR-0015` — a *new* ADR that amends `MMT-ADR-0011`, not an in-place edit) — prohibition-floor primitive, two-axis knowledge tables, `regimes` lookup table, Payer sub-field (primary + ≤1 secondary), Guardian=consent-only / Mentor=data-access / Sub-admin=profile-mgmt, charge terminology, `AgeBracket` 'child' | (**WP-2**) | `MMT-ADR-0013` | Claude drafted / architect ratified | ✅ **ratified 2026-06-07**; `data-model.md` lockstep SQL written 2026-06-08 |
| 6 | **Router decision record** (`MMT-ADR-0014`) — 3-param runtime / 4-param vetting split, hard split, tested do-not-do lists, tiered v1 fallback; **supersedes** "Family standard = Gemini-only" + **re-specs** GATE-1 minor-routing | (**WP-3**) | memo §4–5; enum seed from walkthrough R-4/R-5 | Claude drafted / architect ratified | ✅ **shape ratified 2026-06-07** (vetted set DB-mastered in `allowed_models`) |
| 7 | **Vetting runbook (WP-4)** — reframed 2026-06-08 to its only remainder: a short, repeatable **vetting runbook** (criteria checklist — compliance: transfer mechanism / ZDR / age-closure; capability: eval-harness §6 battery) so future master changes are mechanical. The standing process + master + per-change records already exist (`MMT-ADR-0014` + `docs/registers/llm-models/`); iteration-1 **ratified**. | (**WP-4**) | — | PM (compliance) + eng (capability) | ✅ drafted at `docs/runbooks/llm-model-vetting.md` |
| 8 | **This roadmap update** — fold the spine + the ten work packages into the phases | (**WP-5**) | the memo | Claude / PM reviews | ✅ landed |
| 9 | **Handoff doc + thin memory *pointer*** — the distilled `_handoffs/` handoff (**WP-7**) + a **pointer-only** `.claude/memory/` signpost to the ratified ADRs (**WP-6, reframed** 2026-06-07: a pointer with cited provenance, **not** a content copy — per the memory↔canon principle). Full memory alignment is Phase J. | (**WP-6**, **WP-7**) | the memo (+ walkthrough rulings appended later) | Claude / PM reviews | ✅ landed |

**Folds into the G–P runway, not F.1:**

- The **spine cleanup sweep** — charge-terminology, 6-persona, capability split, 13+ launch floor / sub-13 gated posture, routing
  supersessions applied to `CLAUDE.md` / `AGENTS.md` / `docs/project_context.md` / `.claude/memory/` — is the memo's Phase-J
  expansion (**WP-8**); it is absorbed into **Phase J** (see the phases table).

**The R-1 contingent fork (encoded; resolves at the walkthrough):**

- If the COPPA call is **"does not apply"** or **"unclear-with-defensible-posture"** → counsel codifies
  the defensible posture in writing; the **US sub-13 parent-operator path opens** (**WP-9**).
- If the COPPA call is **"COPPA applies"** → a posture memo records it; the US sub-13 path **stays
  launch-blocked** (requires full verifiable-parental-consent) (**WP-9-alt**).
- **Either way**, the **sub-13 v1.1 ungating workstream** (**WP-10**) stays deferred — demand-triggered,
  three preconditions (demand signal + the EU verifiable-consent VPC vendor + end-to-end sub-13 policy
  cell verification). It is a *named future workstream*, not in-scope for G–P.

### F.1 exit gate

The 3 spine ADRs (`MMT-ADR-0013` engine · the `MMT-ADR-0011` amendment · the router ADR) are **drafted
and architect-ratified**; the model-vetting research workstream is **named with an owner**; the
memo + handoff + memory note have **landed**; and the **R-1 fork is resolved** (or explicitly carried
as a tracked contingency that does not block Phase H). Only then does **Phase F close** and **Phase G**
(canonical-set lock) begin.

---

### Phase J — detail (split remediation gates)

**J0 — Canon-shape scrub, trapped-canon rescue, rename, and domain-canon graduation.** Run the scrub plan
at `docs/plans/2026-06-08-identity-foundation-canon-shape-scrub.md`; the T1 disposition inventory
(`2026-06-08-j0-disposition-inventory.md`) is complete and its decisions are ratified (2026-06-08). J0 now
owns, in one pass (PM reviews the draft before it lands):
- **Scrub** — each section of `identity-ontology.md`, `domain-model.md`, `data-model.md`, `identity-foundation-prd.md` carries a recorded disposition (keep L1 / move L3 / move audit / stale); only standing rules graduate. `file:line` cites + vs-legacy diffs → Phase-F runbook (not canon).
- **Trapped-canon rescue** — the PRD's ~23 Part-10 standing rules are lifted into Parts 1–9 (product/architecture) or into **`docs/compliance/`** (the ~10 compliance rules) **before** Part 10 routes to audit.
- **`mentor`→`supporter` rename** (definitions unchanged; names only): `mentor`(human)→`supporter`, `mentee`→`supportee`, `mentorship`→`supportership`; AI = `mentor` (formal term), `mate` = product synonym in `CONTEXT.md` only. Edits the four docs + `CONTEXT.md` + `MMT-ADR-0007`/`0008` (ADRs mutable until ~Phase M) + diagrams + memory.
- **Graduation (Option C layout)** — move to **`docs/canon/identity/`** (`ontology.md`/`domain-model.md`/`data-model.md`/`prd.md`); rewrite citations; update `docs/INDEX.md`/`CANONICAL-SET.md`/the `architecture.md` carve-out banner. Gated on the **ADR-0000 §I.4 amendment** (per-domain `docs/canon/<domain>/` sub-layout; drafted in the inventory).

Exit gate: only standing canon in the graduated bodies; every non-canon section has a named destination; the four docs live at `docs/canon/identity/`; ADR-0000 §I.4 amended in lockstep.

**J1 — Memory pointer alignment.** Retained `.claude/memory/` identity-foundation entries become pointers
to `docs/INDEX.md`, `CANONICAL-SET.md`, ADRs, or the model register. Exit gate: every retained entry cites
one live canonical target; entries with uncertain provenance and no canonical link are culled or archived.

**J2 — Agent-doctrine and project-context reduction. DONE 2026-06-09** (`2026-06-09-j2-doctrine-routing-disposition.md`).
`CLAUDE.md` and `AGENTS.md` stay as pointer-layer
boot instructions, not identity-foundation canon copies; `docs/project_context.md` stays project-context,
not a shadow routing/identity canon. Exit gate: identity-foundation facts duplicated from canon are replaced
with pointers to `docs/INDEX.md` / `CANONICAL-SET.md`, while repo-wide engineering rules remain intact. The
same pass removes or repoints active-looking superseded routing doctrine (`ARCH-9`, Gemini-only / pinned
Gemini Flash/Pro wording) to `MMT-ADR-0014`, `MMT-ADR-0018` (LLM orchestrator — renumbered from 0017 on 2026-06-09), and `docs/registers/llm-models/` as appropriate.
**Outcome:** clause (b) = 5 routing repoints (4 in `project_context.md`, 1 in `CLAUDE.md`) → `MMT-ADR-0014`/`0018` + the model register, each superseded assertion now carries an explicit supersession flag (live router is mid V1→V2, register excludes Gemini / pins gpt-oss-120b). Clause (a) was **empty** — no identity-canon was ever inlined into agent-doctrine (interim-governance rule held); Profile Shapes is current-nav impl, kept + given a scope note. `ARCH-9` already absent; AGENTS.md needed no edit (pre-existing CLAUDE↔AGENTS divergence flagged, not fixed here).
**Scope note (post-QA 2026-06-09):** J2's routing sweep covered the **three doctrine files only** — `.claude/memory/` is **J1's surface**, never J2's. A QA pass found stale Gemini-only/GPT-5.4 wording still in 3 *active* memory files (`pricing_dual_cap.md`, `project_book_generation_pass.md`, `project_enduser_session_pass.md`): J1 had flagged+deferred `pricing_dual_cap` to the model-router workstream (which doesn't run in Phase J) and never surfaced the two non-identity-coupled runner memories. The coordinator repointed all three to `MMT-ADR-0014` + the register, **closing that J1 deferral** (post-review completion, not a J2 re-scope). The J2 artifact's earlier unscoped "every assertion" verification line is corrected to "in the three doctrine files" — see `2026-06-09-j2-doctrine-routing-disposition.md` § Post-QA reconciliation.

**J3 — Docs tree conformance. DONE 2026-06-09** (`2026-06-09-j3-docs-tree-disposition.md`).
Apply ADR-0000 §I.4 physical-tree decisions that are reachable from the
identity-foundation surface. Exit gate: loose canon and nonstandard docs dirs have per-file decisions
(move to `docs/canon/`, move to L3/audit/assets/archive, or defer to Stream 2 with a named reason).
**Outcome:** identity surface already §I.4-conformant (canon/identity/, compliance/, adr/, registers/ all
in sanctioned homes) **and no mislocated-citation defect** → **zero file moves**. Every nonconformant
loose-canon file (estate spine `architecture.md`/`PRD.md`/`ux-design-specification.md`, L3 operational
docs, assets) and nonstandard dir (`E2Edocs/ _scratch/ _vault/ analysis/ superpowers/ meetings/`) is
**deferred to Stream 2 with a named reason** (estate-canon drain / asset consolidation / dir
reconciliation — all explicitly Stream-2 per ADR-0000:200 + INDEX caveats #2/#3). Two identity-touching
files explicitly ruled: `audience-matrix.md` (defer + flag `prd.md:319` citation for update-on-move),
`glossary.md` (follows its existing cross-cutting-thread disposition — bucket 2 = new stream, bucket 3 =
Stream 2). **Phase J (J0–J3) complete.**

---

### Phase K — detail (the consolidation activity)

**Goal:** produce a single consolidated-audit document that consolidates and reconciles the 14 sub-audits of the `2026-05-29-full-audit/` cluster (plus the linked `.deepsec/` module) *and* cross-checks the drift map against the canonical set, so the gap analysis (L) has *one document* to read.

**Inputs (the corpus):**
- **6 in `deep-review/`** — `2026-05-29-arch-whole-repo`, `2026-05-30-agent-instructions`, `2026-05-30-errors-api`, `2026-05-30-l10n-a11y-mobile`, `2026-05-30-security-pii-api`, `2026-05-30-security-pii-inngest` (each with `REPORT.md` + `SUMMARY-prioritized.md` + sub-agent reports; the whole-cluster `META-REPORT.md` synthesizes them).
- **4 in `workflow-N/`** — `workflow-1/findings.md`, `workflow-2/findings.md`, `workflow-3/inventory.md`, `workflow-4/recommendations.md`. **`workflow-3` is an inventory and `workflow-4` is recommendations** — both are *meta-outputs* (input to the master plan's workstream discovery and prioritization), **not findings to classify** in K.
- **4 at the root** — `architecture-audit.md`, `improve-codebase-architecture.md`, `agent-skills-recommendations.md`, `deepsec-handover.md` (the deepsec handover — references the `.deepsec/` module).
- **`.deepsec/`** — the deepsec engagement itself, in the same codebase (not a separate codebase). Read alongside the `deepsec-handover.md` root-level sub-audit.

**Discarded:** the `claude/` (5 files) and `codex/` (3 files) trial reconciliations — not authoritative; *not* input to K's output; mentioned in the provenance section as "not used."

**L sub-tasks (executed in order, with each one a discrete, reviewable step):**

- **K.1 — Read the corpus + identify the 6 deep-review workstreams.** Use the 6 `deep-review/` runs as the workstream-discovery seed: architecture, agent-instructions, errors-api, l10n-a11y-mobile, security-pii-api, security-pii-inngest. Possibly 5 (if the two security workstreams merge) or 7 (if a `workflow-N/` finding doesn't fit). The 4 `workflow-1/2/findings.md` + the 4 root-level sub-audits cluster into the 6 (or 5–7) workstreams; the meta-outputs (`workflow-3/inventory.md` + `workflow-4/recommendations.md`) inform the master plan's workstream discovery, not L's findings-classification flow.

- **K.2 — Classify each finding (the 12 sub-audits that have findings).** For each finding, classify `(in-identity-foundation-scope, in-some-other-workstream's-scope, deferred)`. The "in-identity-foundation-scope" check uses the canonical set (G–J) as the lens. Discover the workstream assignments from the sub-audits' own clustering (K.1).

- **K.3 — Cross-check the drift map's §2.1–§2.7 against the canonical set.** The drift map was authored 2026-06-01; the canonical set was finalized 2026-06-04. The cross-check produces two outputs: (a) *live defects* (drift-map findings the canonical set didn't cover) and (b) *premature resolutions* (canonical-set conclusions the drift map didn't support).

- **K.4 — Author the consolidated-audit document.** A single document with three sections: (A) the 14 sub-audits' findings classified by workstream; (B) the canonical set's resolutions cross-referenced; (C) the drift map's as-is findings cross-checked against the canonical set. Section A is the *primary* output (the classification is what L consumes); sections B and C are the *secondary* output (they make K's classifications auditable and self-contained).

- **K.5 — Estimate the sizing of the *reconciliation* work.** This is the L sub-task the architect specifically called out. The classification (K.2) is the *light* part — assign each finding to a workstream. The *reconciliation* is the *deep* part — actually resolve the disagreements between sub-audits within each workstream. **K.5's output: a sizing estimate** — for each of the 5–7 workstreams, an estimate of (a) the number of contradictions / disagreements to reconcile within that workstream, (b) the estimated effort to reconcile (in session-counts or comparable units), (c) the dependency on canonical-set-building for that workstream, (d) the readiness to reconcile (e.g. does the workstream already have a partial canonical set, or is it starting from scratch?).

- **K.6 — Decision point: spin up a separate workstream to actually reconcile, or defer reconciliation entirely.** Based on K.5's sizing estimate + the architect's read on the value of reconciliation *now* (vs. reconciliation *later, when each workstream picks itself up*), the decision is: **spin up a separate workstream** to do the actual reconciliation (per-workstream: read the sub-audits' findings, resolve the contradictions, produce a per-workstream consolidated audit + a partial canonical set), or **defer reconciliation entirely** (let each workstream pick itself up in some future order; the consolidated-audit document K.4 produces is the *handoff*, not the reconciliation; each workstream's future activity does its own reconciliation as part of its own canonical-set-building). The decision criteria are: (a) the cost of doing reconciliation now (the K.5 sizing estimate) vs. the cost of doing it later (the duplicated effort across workstreams); (b) the value of having a *single reconciled audit* as the input to L (vs. the value of having the per-workstream reconciliations done in each workstream's own context); (c) the architect's call on whether the current *one-person bandwidth* can absorb the reconciliation work alongside the G–K firming work. **K's exit gate is the architect's ruling on this decision** (the architect picks spin-up or defer, with a written rationale).

---

### Phase N — detail (sequencing + the Stream-2 pull-forward gate)

**N.0 — Stream-2 pull-forward gate (decision point).** Before sequencing the in-scope set, rule the Stream-2 partition. **Inputs:** M's triaged findings + the L `execution-blocking-if-deferred?` tag. **The ruling:** partition every finding assigned to Stream 2 (M buckets 3/4) into **(a)** a *pull-forward prerequisite subset* — documentation-remediation that, left deferred, would block clean implementation execution (e.g. an in-scope work package must cite an `architecture.md` section still in its legacy/wrong state, or slicing a Cosmo WI requires canon that does not yet exist) — and **(b)** the *deferred remainder*, which runs in parallel with or after execution. **Default is defer; pull forward only on a demonstrated, named blocking dependency** (the conservative posture this runway uses elsewhere). Implementation execution is **never gated on Stream 2 *completion*** — only on this minimal, evidence-justified prerequisite subset. The pull-forward subset is sequenced in **Phase O** as pre-execution work and is coordinated under this roadmap's umbrella (see the *Stream 2 commencement* cross-cutting thread); the remainder stays Stream 2. **Relationship to K.6:** if K.6 deferred audit reconciliation, the pull-forward evidence is thinner — N.0 must mark any pull-forward call that rests on an unreconciled finding as lower-confidence. **Exit gate:** every Stream-2-assigned finding is labelled *pull-forward* or *deferred*, each pull-forward carrying a one-line dependency rationale; the pull-forward subset is handed to N.1.

**N.1 — Sequencing proper.** The dependency map + critical path over the in-scope set (including N.0's pull-forward subset); the identity-foundation workstream is sequenced *first* (dogfood).

---

## Execution model — parallel tracks  *(2026-06-02)*

With **B-tech complete**, the dependency "D depends on B" refines to **D depends on B-*tech* (locked); B-*product*
reaches D only via the ripple rule.** So C and D no longer wait on the PM pass. Two tracks run in parallel:

- **Track 1 — Product (PM, architect alongside):** Phase **B-product** — the open product/UX items + P-tails +
  PM-coordinated legal. **Front-load the ripple-prone items** (E5 last-guardian/custody; any *new* persona or
  journey) so a structural surprise surfaces early.
- **Track 2 — Architecture (Claude; architect ratifies):** **C first** (doc-strategy sets the container for D/E
  output — decide it before generating more docs), then **D in parallel**, then **E** after D's core is stable.
  Truly-independent sibling plans may proceed anytime.

**The rule that makes parallel safe — synchronize on *ratification gates*, not work-start:**

- Do D's work in parallel, but **lock D's exit gate only after B-product clears** (ripple insurance). E follows
  D; F still gates on B, D, E.
- **Track 2 stays product-neutral on unresolved P-tails** — model *both* options (e.g. E6 unified-vs-split
  surface), never silently pick a product call to unblock itself.
- A ripple finding (PM adds/changes a persona or journey) reopens the affected `T✓` for the architect *before*
  D ratifies.

Gate order is unchanged (B-product → D-ratify → E-ratify → F); only the *work* is parallelized.

## Cross-cutting threads

- **`docs/glossary.md` reconciliation + the `mentor`→`supporter` rename (raised 2026-06-08).** A separate PM
  activity produced `docs/glossary.md` by reverse-engineering the (drifted) code — a **rogue, non-canonical
  drift-map** that inverts our actor vocabulary (`mentor`=AI, `guardian` retired, `owner` kept). Marked
  non-canon 2026-06-08. Disposition: **our canon wins on every definition**; the doc is dismantled to proper
  homes and **deleted after bucket-2 consumes it**. Three buckets: **(1) identity actors** → discarded, canon
  owns it (rides J0/J1, harvest drift-evidence into the ontology crosswalk); **(2) naming-convention / structure
  terms / notes taxonomy / learning-loop / modes** → a **new learning-domain canon design stream, sibling to
  Stream 2** (not its drain — design, like identity-foundation was; glossary is its primary input); **(3) cards /
  celebrations** → **Stream 2** (principles → `ux-design-specification.md`; terms → a product-owned per-area
  `CONTEXT.md`; inventories → L3 register). A ratified **product decision** also swaps `mentor`(human)→`supporter`
  (+ `mentee`→`supportee`, `mentorship`→`supportership`; AI keeps `mentor`, `mate`=product synonym) — **definitions
  unchanged, names only**; **executed in J0** (see Phase J0 detail). ⬜ *(bucket 2 = new stream; bucket 3 = Stream 2)*
- **Policy-engine + router spine (Phase F.1)** — the two new architectural lanes from the "A-vs-B"
  decision (the engine + the router). Full detail in the **Phase F.1** section above; spine ADRs
  (`MMT-ADR-0013` engine · `MMT-ADR-0015` data-model amendment · `MMT-ADR-0014` router) closed before
  Phase H. ✅
- **Vetting runbook (WP-4).** Reframed 2026-06-08 to its only remainder: a **short, repeatable vetting
  runbook** — the criteria checklist for a vetting pass (compliance: transfer mechanism / ZDR / age-closure;
  capability: eval-harness §6 battery). The *standing process* it documents **already exists** —
  `MMT-ADR-0014` (vetting/routing split + admission gate) + `docs/registers/llm-models/` (master + immutable
  per-change records). **Iteration-1 (launch set) is recorded and ratified** (`2026-06-06-launch-set-iteration-1.md`,
  approved 2026-06-08). Owners: compliance half PM/legal, capability half eng. Off the F→P critical path. ✅
- **Persona / capability / charge-terminology refinement** — the "A-vs-B" decisions refine the persona
  set 5→6, split capabilities (Payer = billing only · Guardian = consent only · Supporter = data access
  only · profile-mgmt = Subscription-administrator), and rename "ward" → **"charge"**. These ripple into
  the data-model amendment (F.1 WP-2), the architecture carve-out (Phase H), and the cleanup sweep
  (Phase J / WP-8). 🟡
- **Age-floor posture — 13+ launch floor / sub-13 gated (supersedes the old "11" thread).** v1's floor is **13+ as the
  *consent-capacity* floor** — one of three independent axes (consent capacity 13–16 per-market;
  contract/payment capacity 18; content level a continuous gradient that **never gates**). The strictly-
  11+ heritage (`birthYearSchema`, `packages/schemas/src/profiles.ts:38-50`) is **not** a legal line
  (counsel: no legal usage floor) and is **superseded** by the three-axis model. The
  v1/v1.1 split is: v1 closes the 13+ load-bearing gaps (router age gate, crisis/human-in-the-loop
  escalation, under-18 PII scrubbing, the `AgeBracket` "child" value, the prohibition-floor primitive)
  and future-proofs the schema with sub-13 cells in the pre-baseline window; **v1.1** closes the
  sub-13-specific gaps (output classifier, sub-13 retention TTLs, AI-disclosure UX, EU "reasonable-
  efforts" flows, the VPC vendor) and ungates — demand-triggered, three preconditions. Sub-13 is
  **built but front-end-gated**; **US sub-13 is excluded in v1** pending the R-1 COPPA fork. The
  birth-year floor must still ship **with a documented rationale in the same change** (likely a UK
  Crime & Policing Act 2026 statutory expectation). Product + counsel owned; lands in the H carve-out
  for completeness. ⬜
- **Canon-authorship process + ADR ↔ `architecture.md` ↔ `ARCH-N` relationship — RESOLVED in Phase I-c
  (2026-06-08).** The `MMT-ADR-0016`↔`MMT-ADR-0000` divergence *instance* was already gone (the offending
  "ADRs are the sole decision system of record" line was removed at the `0016` repurpose); the surviving **root
  cause** — the canon-authorship *process* was never written down, so two ADRs *could* disagree on what canon
  *is* — is now closed: (a) how content enters `architecture.md`, (b) how an ADR relates to the canon it changes,
  and (c) how both relate to the frozen `ARCH-N` register are stated in one place in **`docs/adr/README.md` §
  "How canon is authored (ADR ↔ canon ↔ ARCH-N)"**, and the recurrence guard — **"no document is the sole system
  of record"** — is recorded as an amendment to **`MMT-ADR-0000`**. `architecture.md` also now self-identifies as
  L1 canon (title + preamble), no longer "Architecture Decision Document". ✅ *(raised 2026-06-07; resolved 2026-06-08, Phase I-c)*
- **Documentation index — the boot-flow linchpin.** The intended agent boot-flow is
  `CLAUDE.md`/`AGENTS.md` (pointer layer) → `docs/INDEX.md` → the layered canon. Per-layer indexes
  exist (`docs/adr/README.md`, `docs/audit/INDEX.md`); the unifying index is now seeded and wired
  from agent doctrine. Phase J uses it as the pointer target, and estate-wide population remains
  Phase J / Stream 2. ✅ *(added 2026-06-07; seeded 2026-06-08)*
- **Memory ↔ canon boundary — ratified rule, executes in Phase J.** Same single-source-of-truth
  principle as DB-is-master: **structured canon is master; memory never holds a *copy* of canon.** Memory's
  positive role is the residue with no other home — (1) pointers/navigation into the index, (2) non-canon
  working state, (3) user/feedback facts. The rule landed in `MMT-ADR-0000`; Phase J now executes the
  retroactive pointer alignment instead of re-deciding the principle. ✅
- **Interim governance (now → Phase J) — stop the bleeding, forward-only.** So Phase J inherits only the
  *legacy* backlog, not this runway's output: **(1)** no new *content-bearing* memory — durable decisions go
  to their canonical home (ADR/canon/data-model), never a memory copy; **(2)** any new memory entry is a
  *pointer* and **cites the canon doc it points to at creation** (provenance baked in → no future orphans);
  **(3)** `CLAUDE.md`/`AGENTS.md` stay pointer-layer — new canon is not inlined into agent-doctrine; **(4)**
  cleanup debt noticed in passing is logged to a Phase-J worklist, not fixed ad hoc. Mirrors the repo's
  forward-only-ratchet pattern (GC1, `decision-adr-link`). 🟡 *(added 2026-06-07)*
- **Documentation architecture / decisions layer (Phase C → Stream 2)** — `MMT-ADR-0000` ratified the 5-layer
  model, the first-class `MMT-ADR-NNNN` decisions layer, the **significance gate** (when a decision needs an
  ADR), the lockstep lifecycle, and the **physical layout** (§I.4: `docs/canon|adr|specs|plans|runbooks` +
  `assets/`/`_archive/` drains). **Forward mechanism shipped** (convention, lockstep, the `decision-adr-link`
  ratchet, `ARCH-N` freeze) + 3 seed ADRs; ADRs now homed at `docs/adr/`. **Deferred backfill = Stream 2
  (structural remediation):** drain the ~70 censused decisions to ADRs repo-wide. **MoSCoW:** MUST =
  memory-only **or** ≥2-source (drifting); SHOULD = single canon spot needing extraction; NICE =
  stable/low-confidence; SKIP/tombstone = obsolete/superseded/mechanical. The **identity slice rides this
  roadmap's tail** (re-baseline = Prong A new ADRs + Prong B supersession/tombstones — touch identity canon
  once); constraint: **extract-before-cleanup** (no decision-bearing memory file is relocated before its ADR
  exists). Also Stream 2: **build the principles/invariants catalog** (`docs/canon/principles.md` — promote the
  CLAUDE.md Non-Negotiable Rules); the **`ARCH-N` drain** (incl. the `ARCH-3` "plain wrong" fix); the
  agent-doctrine/memory pointer cleanup. The **reduced `docs/` reorg** (canon→`docs/canon/` + the drains — what
  remains of F-PLACEMENT once the ADR home is settled) gates the bulk relocation. Estate-level generalisation to
  the **ZDX standard** is parked as **WI-519**. 🟡
  - **Parallel ungoverned ADR audit (sealed cross-reference — do NOT build on).** In the same window another
    session pushed an ADR register draft + a cleanup plan to `main`, plus stale-fact "citation fixes" to
    `architecture.md` / `project_context.md` / `audience-matrix.md` / `CLAUDE.md`. Its **producing workflow is not
    in the repo**, so its selection criteria, coverage, and importance-weighting are unverifiable; it covers only
    archived specs and applies **no significance gate**. **Do not seed Stream 2 from it** (anchoring risk).
    **Disposition executed 2026-06-03:** the two draft docs are **quarantined** at
    `docs/_archive/parallel-adr-audit-2026-06-03/` (see its `README.md` for provenance) — kept *only* as a
    completeness backstop to diff against after our controlled sweep, not as input. The material canon/doctrine
    edits from the citation-fix commits (`944d87a`, `1039bb217`) were **reverted** — they softened the LLM-envelope
    Non-Negotiable Rule, re-characterized `isOwner`/owner-based gating that C2 dissolves, and flipped nav-contract
    finding statuses; pure count/line refreshes were retained. After our controlled sweep, *diff* against the
    quarantined §1 conflict-resolutions and the cleanup plan's STANDS/refuted findings as a backstop, then decide
    final disposition (harvest verified facts / discard). ✅
- **Stream 2 commencement, parallelism & coordination umbrella — *when* the deferred remediation starts (added 2026-06-08, architect-ratified).** This runway *sequences* Stream 2; it does not *execute* it, and **implementation execution is never gated on Stream 2 completion.** Four rules govern start timing:
  - **Baseline.** Stream 2 is named and ordered by **Phase O** (the master plan) and sliced into Cosmo WIs at **Phase P**.
  - **Maximal parallelism — start each fragment at its earliest responsible start.** Stream 2 is *not* a monolith that waits for O; we execute as much as we can in parallel as soon as each fragment *can* start. Gap-analysis-dependent parts (the full `architecture.md` rebuild, the `ARCH-N` reverse-engineering drain) cannot begin before **Phase L**; input-independent parts (e.g. the principles/invariants catalog, the `docs/`→`docs/canon/` reorg) can begin once their input canon is stable. Default posture: *start as soon as you can, in parallel* — not *hold until O*.
  - **Single coordination umbrella while K–P run.** Any Stream 2 fragment that starts early (or is pulled forward by **N.0**) stays coordinated **under this identity-foundation roadmap** for as long as K–P are still running — one umbrella, one sequencing authority — rather than spinning off into a separate, uncoordinated track. Stream 2 graduates to its own standalone workstream only **after the runway closes (post-P).**
  - **The pull-forward exception (N.0).** Whatever the **N.0** gate (see *Phase N — detail*) declares a pre-execution prerequisite is sequenced in O as pre-execution work and executed early under the umbrella above; the deferred remainder runs in parallel where its inputs allow, otherwise post-execution. 🟡 *(added 2026-06-08)*
- **Consent/COPPA spec + legal check (REQ-2 counsel queue)** — spans B/D; gates any code touching consent.
  PM-owned, worked with the lawyer. 🟡 **Split by structural impact — the queue does NOT gate F as a whole:**
  - **→ E (data model) — absorb now as a known constraint:** the legally-mandated **retention carve-out**
    (billing/tax/transaction records survive learning-data deletion) forces a *segmented deletion* seam
    (retain-financial / purge-learning); design E for it now — counsel only fills the exact period/scope.
  - **→ D — contingent risk, get a binary read before D-ratify:** **parent-delete permissibility** (is a
    guardian-initiated delete of an under-age charge's learning lawful *at all*?). A "no" reopens the E5
    ruling + the inv-21 amendment. Lean favorable (GDPR storage-limitation); low odds, high blast radius.
  - **→ post-F config/copy (ride decided mechanisms, do not gate F):** dormancy period; pre-deletion
    notice / grace / export-window length; moved-country grace-window length; birth-year boundary
    verification *method* (ties to G7 vendor pick); minor double-billing disclosure + grace (E12 option B).
- **T1 revert** — decision MADE (forward-only); execution deferred to F. Do **not** delete migration
  `0106` in isolation (it's committed + applied). ⬜
- **Phase-F launch-readiness guard — value-seams not at placeholder defaults.** When Phase F runs the
  baseline migration, the value-seam columns (`person_retain.consent_receipt.retention_period`,
  `person_retain.deletion_audit.retention_period`, `person_retain.financial_record.retention_period`,
  the dormancy threshold on the unified daily sweep, the `birthYearSchema` signup floor, the moved-
  country grace length, the boundary-crossing verification method per crossing) ship as columns /
  config keys, not as values. **Guard:** a build-time / pre-launch test
  (`apps/api/src/services/identity/launch-readiness.test.ts` shape, modeled on
  `apps/api/src/inngest/functions/consent-revocation.test.ts`) that fails CI when any value-seam
  is at its placeholder default (zero / "unset" / null where the schema expects a value). Plus a
  **floor ↔ IARC consistency check** (P1 floor must not be above the minimum age the chosen
  content rating covers). This makes "placeholder default is not the policy" *defensible* rather
  than *hoped-for*, and gives the launch team a one-line stop-the-line signal. **Owner:** Phase F
  implementation; **surface area:** 1 test file + a small constant module the test reads from.
  **Source for the values:** the fillers walkthrough results
  (`_wip/identity-foundation/_walkthroughs/phase-e-fillers-walkthrough/`). 🟡 *added 2026-06-04 during the Phase-
  E → Phase-F handoff.* ⬜
- **Sibling-plan re-triage** — see below. 🟡 provisional tags applied to all 7 plans (2026-06-01);
  preliminary verdicts validated in `_research/drift-map.md` §5 (one diverged: `learning-library-cleanup`). Final
  couple-vs-independent split still deferred to after Phase D.
- **Harness Hygiene — Cosmo process enablement (EXTERNAL DEPENDENCY; owned by the Nexus / ZDX `zdx-productionization` stream).** Phase O/P's "Cosmo top-down process enablement is the parallel precondition" is delivered by a concrete workstream this roadmap was previously unaware of. **This block is owned and milestone-updated by the ZDX stream (Hex) — do not edit.**
  - **Gate contract** ("Harness-Hygiene-done"): eduagent's dev-execution harness (commit → pre-commit → pre-push → CI → code-review → merge tail) is rewired and ZDX/cosmo-skill-backed to **replacement-parity (80/20)**, such that Phase-P execution slicing can begin. Canonical exit-gate = Cosmo **WI-530**.
  - **Status: IN PROGRESS** `[ not-started | IN PROGRESS | done ]` — execution underway (2026-06-09): commit CORE (`/zdx-core:commit`) shipped; pre-commit slim + Nx cache-correctness substrate delivered; CI restructure (WI-452) → real-PR proof (WI-388) next.
  - **Dependency:** **Phase P is blocked-by WI-530.** Do not begin Phase-P Cosmo work-package slicing until WI-530 = done (mirrored by Cosmo boundary node WI-533).
  - **Detail (canonical):** Cosmo workstreams *Harness hygiene* + *ZDX lifecycle toolchain*; plan at `~/nexus/_WIP/zdx-productionization/_state/2026-06-08-harness-hygiene-recut-plan.md`.
  - *(raised 2026-06-08 by the Nexus root Control Plane; cross-stream seam tracked as Cosmo WI-532)* ⬜

---

## Sibling-plan re-triage  *(added 2026-06-01)*

The three superseded identity plans were one node of a **7-plan fan-out from the same 36-gap audit**,
authored in a single sitting. The "independent" label on the 6 siblings is the *drifted process's own*
label and **leaks** — two siblings cite identity gap IDs, so the "survive the redesign unchanged" claim
isn't internally consistent. They are **not** on the rejected approach (they're gap-fixes that may be
valid), so:

- **Do NOT** archive/supersede them, and **do NOT** move them into this folder yet (that's the exact
  premature-categorization reflex we're guarding against).
- **Now (part of A):** tag each in `docs/plans/` with a provisional note —
  *"classification pending re-triage against identity-foundation clean-cut target"* — and capture the
  preliminary read below.
- **After D (target exists):** do the **real** couple-vs-independent split, because "coupled" depends
  on the new model's shape.

**Preliminary classification — NOT final (confirm against the target):**


| Sibling plan                                | Gap IDs                           | Coupling | Provisional verdict                                                     |
| --------------------------------------------- | ----------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `resumable-practice-state`                  | practice-1/2/4                    | none     | **Independent** → safe to proceed now on current model                 |
| `learning-library-cleanup`                  | learn-2 (!), learn-3              | low      | Mostly indep;`learn-3` half safe now, `learn-2` is a T3 identity item   |
| `notification-reachability-nudges`          | notif-1..4                        | partial  | Per-member vs owner notifs overlap redesign flow #7 → split            |
| `profile-setup-personalization-corrections` | onboard-1..4                      | coupled  | Onboarding = who-creates-whom + roles + consent →**fold**              |
| `billing-recovery-learner-capacity`         | billing-3/4, learn-1 (!), notif-3 | coupled  | "Learner capacity" = seats/membership; cites`learn-1` → **fold**       |
| `account-security-self-service`             | auth-2/3/4                        | heavy    | change-email / sessions / login all change under multi-login →**fold** |
| `product-continuity-low-hanging-fruit`      | (none)                            | separate | Earlier grab-bag, not in the identity batch → evaluate on own merits   |

**Split rule** (mirrors the audit re-triage): truly independent → proceed now on the current model;
identity-coupled → park & fold into the foundation (don't build on the about-to-be-replaced model);
separate → evaluate standalone.

---

## Definition of "ready to start implementation" (the Phase-P exit gate)

The "ready to start implementation" gate is the *P* phase's exit gate, not F's. F closes as *"planning for the planning"* (i.e. the shape of G–P is ratified; the actual planning lives in G–P).

**A–F (the deep thinking + planning-for-the-planning):**
- [x] **A** — drift map + audit re-triage + sibling provisional tag (`_research/drift-map.md`); 36-gap audit evidence index folded in.
- [x] **B** — product intent ratified (Part 10 resolved; 4 architecture ripples re-confirmed `T✓` 2026-06-03, Part 10 §H; **`inv 17` rephrased 2026-06-04** — all 2026-06-03 counsel walkthrough architect calls closed).
- [x] **C** — doc-strategy decided (`MMT-ADR-0000`): decisions layer + `MMT-ADR-NNNN` + the `decision-adr-link` ratchet; ADRs homed at `docs/adr/`; the broader `docs/` reorg → deferred follow-up.
- [x] **D** — domain model locked (`domain-model.md` + MMT-ADR-0007–0010); consent model locked; the legal-check items (E4 one-of/all-of; parent-delete; dormancy specifics) are named, scoped to E/counsel, and do not gate D.
- [x] **E** — data model + cut strategy locked (`data-model.md` + MMT-ADR-0011/0012).
- [x] **F** — planning-for-the-planning ratified: the G–P shape is confirmed; the consolidation's corpus (14 sub-audits + `.deepsec/`) is identified; the four-bucket triage model is agreed; the `claude/` + `codex/` trial reconciliations are to be discarded; the launch-readiness guard is a Phase-F-thread tracked in this ROADMAP. **Carried F.1 (the policy-engine/router spine); F.1 closed 2026-06-08 → F closed.**
  - [x] **F.1 — memo** signed (the 25 A-vs-B decisions; PM sign-off confirmed).
  - [x] **F.1 — walkthrough package** tightened + reconciled to the memo (2026-06-07).
  - [x] **F.1 — walkthrough run** — DONE (facilitator-run, **no live counsel**; landed via pull): R-0/2/3/4 LOCKED, R-5 REFINEMENT (→ `MMT-ADR-0016`), R-1 UNCLEAR-with-posture. **Caveat: real counsel sign-off still owed (HW-2)** — booked separately, not launch-blocking.
  - [x] **F.1 — 3 spine ADRs** drafted + **architect-ratified 2026-06-07** (`MMT-ADR-0013` engine / `MMT-ADR-0015` data-model amendment / `MMT-ADR-0014` router). Shape accepted; enum *seeds* + the R-1 fork still come from the walkthrough.
  - [x] **F.1 — `data-model.md` lockstep SQL** written for the `MMT-ADR-0015` amendments ✅ 2026-06-08 (commit `5b624f6ff`; the ratified ADR's canon partner, per MMT-ADR-0000 lockstep).
  - [x] **F.1 — vetting (WP-4)** = the short vetting runbook drafted (`docs/runbooks/llm-model-vetting.md`); standing process/master/records already exist; iteration-1 record **ratified** 2026-06-08.
  - [x] **F.1 — roadmap update** (WP-5) + memory pointer (WP-6, `.claude/memory/project_identity_foundation_decisions.md`) + handoff (WP-7, `_handoffs/2026-06-08-phase-f-close.md`) landed.

**G–P (the firming, classification, planning — the actual planning runway):**
- [x] **G** — canonical set explicitly confirmed ✅ 2026-06-08 (`CANONICAL-SET.md`, current membership/count held there; lens for the gap analysis (L), citation boundary for H) **+ documentation index seeded** (`docs/INDEX.md`, wired from `CLAUDE.md`/`AGENTS.md`).
- [x] **H** — `architecture.md` identity-foundation carve-out authored ✅ 2026-06-08 (`## Identity Foundation` in `docs/architecture.md`; 5 subsections covering identity/tenancy + capability split + consent/age model + engine/router/vetting/safety-judge + lifecycle/clean-cut; cited to the 19-member set + `data-model.md` §s; transitional markers applied; citation audit clean).
- [x] **I** — sub-gated pass DONE 2026-06-08: **I-a** legacy `architecture.md` anchors resolved (5 `[LEGACY-REVIEW]` + banner/title/preamble); **I-b** identity `ARCH-N` dispositions (`ARCH-9` superseded, `ARCH-8` → `MMT-ADR-0017`, `ARCH-7` stands); **I-c** canon-authorship process + `MMT-ADR-0000` anti-divergence guard (the `0016`↔`0000` reconciliation).
- [x] **J** — **four-gate canon/memory/docs alignment**: **J0 complete** (scrub + `_wip/` → `docs/canon/identity/` move + compliance-register rescue + rename); **J1/J2/J3 complete 2026-06-09**. Post-review direct cleanup removed the stale live memory "Strictly 11+" constraint and repointed active routing-memory leftovers to `MMT-ADR-0014` + `docs/registers/llm-models/master.md`. See Phase J detail above.
- [ ] **K** — consolidation activity (the 14 sub-audits + `.deepsec/`; produce the consolidated-audit doc; the K.0 canon-contradiction check; the K.5 sizing estimate; the K.6 spin-up-or-defer decision). See Phase K — detail above.
- [ ] **L** — unified gap analysis (one row per finding; the delta document).
- [ ] **M** — four-bucket triage (handled / clear in / clear out / defer).
- [ ] **N** — **N.0** Stream-2 pull-forward gate (partition Stream 2 → pull-forward prerequisite subset vs deferred remainder), then **N.1** sequencing proper (dependency map + critical path; identity-foundation workstream first as the dogfood).
- [ ] **O** — remediation plan (the master plan; architect sign-off).
- [ ] **P** — hand off to execution (Cosmo work-package slicing; the Cosmo top-down process enablement is the parallel precondition).

**Tracked open threads (not blockers, named for visibility):**
- [~] Policy-engine spine walkthrough **run** (facilitator-only, no live counsel; R-1 = provisional posture). **Still owed: real counsel sign-off (HW-2)** on R-1 before any sub-13 / v2 build; not launch-blocking. *(`MMT-ADR-0016` ↔ `0014` reconciliation + WP-4 fate pending — see decision log / open below.)*
- [x] Vetting (WP-4) — short vetting runbook drafted (`docs/runbooks/llm-model-vetting.md`); iteration-1 record **ratified** 2026-06-08; standing process/master/records exist. Off the F→P critical path.
- [ ] Sub-13 v1.1 ungating workstream (WP-10) — deferred, demand-triggered (named future workstream, not in G–P).
- [ ] Sibling plans re-triaged against the target; coupled set identified + handled.
- [ ] T1 revert sequenced as the first implementation step (lands *during* the execution phase, after P).
- [ ] Launch-readiness guard exists (test file in `apps/api/src/services/identity/launch-readiness.test.ts`; the spec is the Phase-F-thread tracked in this ROADMAP; the implementation lands in the execution phase).
- [ ] Age-floor final product call (13+ consent-capacity floor; sub-13 built-but-gated; US sub-13 gated on the R-1 fork; surfaces in H's carve-out for completeness; ships with documented rationale).
- [ ] Retention *values* (counsel; the schema's `retention_period` columns are seams; the values fill from the fillers walkthrough results, *not* in scope for G–P).
- [ ] G7 VPC vendor pick (procurement, after legal requirements are clear; precondition for the WP-10 sub-13 ungating).

- → **Only then:** create Cosmo implementation work items (the work that P hands off to).

---

## Decision log

- **2026-06-08** — **Phase J0 executed — canon-shape scrub + domain-canon graduation + `mentor`→`supporter` rename (landed).** The four ratified domain docs were scrubbed (decision-history / ratification-ledgers / runway-internal IDs lifted out; `inv N` / `MMT-ADR-*` / `§` / `CONTEXT:` / `R1–R13` cites kept) and **graduated `_wip/` → `docs/canon/identity/`** prefix-dropped (`ontology.md`, `domain-model.md`, `data-model.md`, `prd.md`). **Trapped-canon rescue:** the PRD's Part-10 decision queue held ~23 standing rules with no other home — product/UX rulings lifted to the graduated PRD **Part 10 (Settled product & UX rulings)**; the ~10 compliance rules lifted to a **new L1 member `docs/compliance/identity-compliance-register.md`** (set 19→20 after the Phase-G 0001/0002 correction; full counsel trail preserved in provenance + git). **Rename** (product decision, rides J0): human `mentor`→`supporter`, `mentorship`→`supportership`, `mentee`→`supportee`; the AI takes the freed name `mentor` (the planned ~70-string AI→"Mate" copy sweep is **cancelled**; "Mate" survives as a `CONTEXT.md` product synonym). Swept across the 4 canon docs + `CONTEXT.md` (L0 glossary — reversed the Mate/mentor direction) + `MMT-ADR-0007`; `identity-model-diagrams.html` does not exist and the identity memory had no human-`mentor` usage (both no-ops). **Enabling ADR:** `MMT-ADR-0000` §I.4 **domain-canon sub-layout amendment** (5th amendment) — spine at `docs/canon/` root, a stream's canon in `docs/canon/<domain>/`, prefix-dropped. **Provenance:** `_wip/identity-foundation/_history/` (4 provenance files) + forward sink `data-model-phase-f-notes.md`. **Repointed:** all cross-citations, `docs/INDEX.md`, `CANONICAL-SET.md`. **Conformance:** stale-token gate clean. **Open (flagged to PM):** counsel cross-check of the distilled compliance register before launch. **Next: Phase J** (memory-pointer restructure → now targets final `docs/canon/identity/` paths).
- **2026-06-08** — **Stream-2 commencement + pull-forward gate added (architect-ratified).** Closed a roadmap gap: Stream 2's *start timing* was scattered in threads and had no decision point for pulling fragments forward. Ratified: **(1)** a *Stream 2 commencement* cross-cutting thread states the rules — execution never gated on Stream 2 *completion*; **maximal parallelism** (each fragment starts at its earliest responsible start — gap-analysis-dependent parts after L, input-independent parts once canon stable); **single coordination umbrella** (early/pulled-forward Stream 2 work stays under this roadmap while K–P run, graduating to a standalone workstream only post-P). **(2)** New **N.0 — Stream-2 pull-forward gate** (Phase N detail): partitions Stream-2-assigned findings (M buckets 3/4) into a *pull-forward prerequisite subset* (default defer; pull forward only on a demonstrated, named blocking dependency) vs the *deferred remainder*; sequenced as pre-execution work in O. **(3)** New L tag `execution-blocking-if-deferred?` feeds N.0. Cross-reference: N.0 lower-confidence where K.6 deferred reconciliation. Spine A–P unchanged (gate added as N.0, not a new phase letter).
- **2026-06-08** — **Phase J0 scoped + ratified (T1 inventory complete).** The T1 disposition inventory
  (`2026-06-08-j0-disposition-inventory.md`) mapped all four domain docs section-by-section. Headline finding:
  the PRD's Part 10 traps **~23 standing rules that exist nowhere else** — routing it to audit as-is would delete
  live canon, so they must be **lifted first** (rescue, not just scrub). Ratified rulings: **(1)** J0 owns the
  full scrub + rescue + graduation in one pass, PM reviews the draft. **(2)** Disposition policy adopted (uniform
  rubric; sole carve-out = keep `data-model.md` §8 invariant→table cross-check). **(3)** `file:line`/vs-legacy
  cites → Phase-F runbook, canon ships clean. **(4)** Rescued **compliance** rules → `docs/compliance/`; product
  rules → PRD body. **(5)** Canon layout = **Option C** — graduate to **`docs/canon/identity/`**; estate spine
  stays at `docs/canon/` root; stream canon = standing peer canon (ADR-0000 §I.4 amendment drafted, applies
  before the move). **(6) `mentor`→`supporter` rename** (product decision; definitions unchanged, names only):
  `mentor`(human)→`supporter`, `mentee`→`supportee`, `mentorship`→`supportership`; AI keeps `mentor` (formal),
  `mate` = product synonym in `CONTEXT.md` only; guardian/owner/charge/admin/Payer untouched; **rides J0**; ADRs
  `0007`/`0008` edited directly (ADRs mutable until ~Phase M). **(7) `docs/glossary.md`** (rogue, code-derived
  drift-map) marked non-canon; dismantled — bucket 1 (actors) discarded/harvested, bucket 2 (notes/learning-loop/
  modes) → **new learning-domain canon stream beside Stream 2**, bucket 3 (cards/celebrations) → Stream 2; doc
  **deleted after bucket 2 consumes it**. Plan + inventory + this roadmap updated; ADR-0000 amendment pending
  apply. **Next: execute J0 scrub** (begin on greenlight).
- **2026-06-08** — **Phase I closed (sub-gated I-a / I-b / I-c).** Executed on branch `identity-foundation-phase-i` as four commits (plan restructure + one per sub-gate); local-only, not yet pushed/merged. **I-a — legacy `architecture.md` anchor cleanup:** the 5 `[LEGACY-REVIEW]` conflicts rewritten to agree with `## Identity Foundation` (minor-consent/age → 13+ floor + sub-13 built-but-gated + three-axis model + append-only consent log; multi-tenancy → org/membership re-derived; authorization → roles primitive `{admin, learner}` + Guardian/Mentor/Payer split, later renamed Guardian/Supporter/Payer in J0; enums example → `verification_type`; NFR-coverage status → "Defined"), `[TRANSITIONAL]` banner marked resolved, carve-out's stale marker reference squared. Scope-by-touching — the adjacent legacy schema-file fossil left for Stream 2. **I-b — identity `ARCH-N` dispositions:** `ARCH-9` superseded by `MMT-ADR-0014` (+ `0016`), pinned model names noted as register data; `ARCH-8` **promoted to new `MMT-ADR-0017`** (`routeAndCall` single LLM entry point, reconstructed) with absorb-forward of its 4 code citations (comment-only) + a lockstep canon cross-ref; `ARCH-7` stands with a `profile_id` → `person_id` scope-key note. `UX-6`/persona and the registry-wide drain explicitly Stream 2. **I-c — canon-authorship process (the governance hinge):** `architecture.md` retitled "Architecture Decision Document" → `# Architecture` with an L1-canon preamble + frontmatter `status: mid-refresh`; a "How canon is authored (ADR ↔ canon ↔ ARCH-N)" operating section added to `adr/README.md`; **`MMT-ADR-0000` amended with the durable "no document is the sole system of record" guard** — the lasting `0016`↔`0000` reconciliation (the divergence *instance* was already removed at the `0016` repurpose; this prevents recurrence). `docs/INDEX.md` bumped (`MMT-ADR-0000` +4 amendments; ADR range `0000`–`0017`). **Not Phase I (→ Phase J):** no canon-shape scrub, no `_wip/`→`docs/canon/` move, no agent-doctrine/memory pointer reduction, no broad terminology cleanup beyond touched lines. **Superseded next step:** Phase J0 has since landed. Handoff: `_handoffs/2026-06-08-phase-i-close.md`.
- **2026-06-08** — **Canon-quality fix + standard set (post-H, commit `976a5f58c`).** The Phase-H `## Identity
  Foundation` section had leaked runway-internal decision/finding IDs (`Path X`, `G-3/4/6`, `F1-BT-a`, `I-PB-B2b`,
  bare `inv NN`, stage code `T3`) into canon prose. **Standard ratified:** top-level canon states rules in **plain,
  self-explanatory** language — never carry internal decision/finding IDs into canon; inline `MMT-ADR-*` +
  `data-model.md §` trace-cites are kept (ADR-0000 §I.2). Section cleaned to this bar (12 lines, 1:1 rewrites, no
  content lost). **Enforce the same bar in Phase I** (legacy-anchor rewrites) **and Stream 2** (the full rebuild).
- **2026-06-08** — **Phase H closed.** `## Identity Foundation` authored into `docs/architecture.md` — the deep
  canonical-authoring phase. **Approach = plop-and-defer** (single doc, no parallel; target-idiom, **relocatable**
  beachhead; full structural rebuild + `ARCH-N` reverse-engineering stays **Stream 2**, its K–P inputs not yet ready).
  5 subsections, outcomes-only, cited to the 19-member set + `data-model.md` §s. **Transitional markers** applied per
  the new-vs-legacy requirement (`[TRANSITIONAL — DOC STATE]` doc banner · `[CANON-NEW]` section banner · 5 inline
  `[LEGACY-REVIEW]` anchor comments — greppable, stripped at Stream 2). **Self-review clean:** citation audit = 13
  ADRs, all canonical-set members, zero non-members; "ward" only as retired-term note. **Canon-authorship process +
  `0016`↔`0000` reconciliation deferred to Phase I** (ROADMAP I-row (c)); the 5 legacy anchors' rewrites = Phase I;
  the J(0) citation rewrite (`_wip/` → `docs/canon/`) is flagged in the section banner. Handoff:
  `_handoffs/2026-06-08-phase-h-close.md`. **Next: Phase I.**
- **2026-06-08** — **Canonical set corrected 17 → 19 (added `MMT-ADR-0001` + `0002`).** The Phase-H plan's
  citation self-review caught that the Phase-G lock **omitted** two accepted, identity-foundation-scoped ADRs the
  carve-out leans on: **`MMT-ADR-0001`** (own the identity/tenancy graph; Clerk = auth only — `0007` *builds on* it,
  not superseded) and **`MMT-ADR-0002`** (Payer capacity store-delegated). Correction of an omission, not a
  re-decision; `CANONICAL-SET.md` updated with a post-lock correction note. `MMT-ADR-0004` (mobile-IAP rails) stays
  *out* — billing mechanism, not core identity canon.
- **2026-06-08** — **Phase H plan drafted + scoped** (`_wip/identity-foundation/2026-06-08-phase-h-architecture-identity-carveout.md`,
  `status: draft`, design profile). **Approach ruled: plop-and-defer.** Author the identity carve-out into the
  **single** `architecture.md` (no parallel doc) as a clean, target-idiom, **relocatable** section — the *beachhead*
  of the eventual rebuild; cited to the 19-member set + `data-model.md` §s. The **full structural rebuild +
  `ARCH-N` reverse-engineering is Stream 2** (its inputs come from K–P), **not** H — rebuilding now would be
  rebuild-twice at the point of least information (content is ready, whole-doc structure isn't). **Transitional
  markers required** (`[TRANSITIONAL — DOC STATE]` doc banner · `[CANON-NEW]` section banner · `[LEGACY-REVIEW]`
  anchor markers — greppable, stripped by Stream 2) so new-ratified-canon vs legacy-pending is unambiguous in the
  interim. **Canon-authorship process + `0016`↔`0000` reconciliation moved to Phase I** (ROADMAP I-row (c)), tightening
  H to carve-out + markers. Awaiting approval before authoring.
- **2026-06-08** — **§I.4 incubation rule revised + domain-canon move scheduled front-of-J.** Architect ruling:
  the `MMT-ADR-0000` §I.4 rule that a stream's L1 canon "incubates in `_wip/` until its **clean cut**" is **too
  conservative** for a pre-launch clean-cut migration (model ratified + certain to build). **Revised:** domain canon
  graduates to `docs/canon/` at **ratification**, *within* the runway. Landed as a lockstep **`MMT-ADR-0000`
  amendment** (the rule's *why*) + the §I.4 line edit (the *what*). **Why not Phase P / clean cut:** deferring rots
  the doc index (the boot-flow linchpin, seeded in G) and **Phase J's own memory pointers** — both hold durable
  references into canon; if canon moves after them, every reference targets a known-temporary path. **Why
  front-of-J specifically:** J's pointer work must target final `docs/canon/` paths, so the move runs *before* it.
  **Scope:** 4 files (ontology/domain-model/data-model/prd); ADRs + registers already correctly placed; runway-control
  docs (ROADMAP, handoffs, `CANONICAL-SET.md`, the immutable memo) stay in `_wip/`. **Execution is Phase J(0)** —
  not done now (this entry schedules it). The rule generalises to every stream going forward.
- **2026-06-08** — **Phase G closed.** Canonical set **locked** as `_wip/identity-foundation/CANONICAL-SET.md`
  (17 members: 4 domain-doc L1 + 11 ADRs L2 [incl. `0000`+2 amendments] + the `docs/registers/` master-by-reference
  + the A-vs-B memo as Option-III audit trail; 2 routing specs named-but-not-members). Each member's **role** named;
  the set is the **lens for Phase L** and the **citation boundary for Phase H**. **PM sign-off on the A-vs-B memo
  recorded in `CANONICAL-SET.md`** (not in the memo — its §8 Option-III lifecycle freezes the header; the stale
  "pending PM sign-off" line is superseded by the live canonical-set confirmation). **Documentation index seeded**
  at `docs/INDEX.md` — the boot-flow linchpin (`CLAUDE.md`/`AGENTS.md` → index → canon): layer scaffold +
  identity-foundation canon fully indexed; estate-wide population deferred to **Phase J / Stream 2**; wired via one
  additive pointer line in `CLAUDE.md` + `AGENTS.md` (NOT the J pointer-layer reduction). **Next: Phase H.**
- **2026-06-08** — **Phase F closed.** F.1 spine (ADRs `0013`/`0014`/`0015` + the `data-model.md` lockstep) ratified;
  the ADR-14/16 reconciliation landed (registers + `0016`-repurposed + the vetting runbook); WP-4 reframed to the
  vetting runbook (`docs/runbooks/llm-model-vetting.md`); the iteration-1 vetting record ratified; WP-6 memory
  pointer + WP-7 handoff (`_handoffs/2026-06-08-phase-f-close.md`) landed. R-1 (COPPA) carried as a tracked
  contingency (HW-2 owed, not launch-blocking) per the F.1 exit gate. **Next: Phase G** (lock the canonical set +
  seed the documentation index).

- **2026-06-08** — **`0014`↔`0016` reconciliation RESOLVED → decompose (not merge); `docs/registers/` L3 home created.**
  The three open rulings from the 2026-06-07 entry are decided. (a) **Gemini-exit = compliance *input*** (GCP §20(d)
  removed an option; no alternatives weighed) — realized as an *excluded* register row + a vetting-record note, **not**
  an architecture decision; the routing supersession of "Family standard = Gemini-only" stays in `MMT-ADR-0014`.
  (b) **Not merged — decomposed by *kind*:** routing mechanism (fail-closed→`CircuitOpenError`; separately-routable
  tutor/judge roles) folded into **`MMT-ADR-0014`** (§4, §8); ephemeral model picks moved to an **interim register
  master** (`docs/registers/llm-models/master.md`, DB-bound, *not canon*); Gemini exit to the vetting trail.
  **`MMT-ADR-0016` repurposed in place** (number/file kept — nothing cited the dispersed content, verified) into the
  **safety/judge-architecture** ADR holding only the significance-gated decisions: judgment-based safety (no app-owned
  denylist) + a vendor-independent, non-reasoning judge. (c) **Interim model-master format = a register *doc***, not a
  code config — *no code reads it yet*; it is the migration seed for the policy-engine `allowed_models` DB. **New
  structure:** `docs/registers/` added as a **type-named L3 sibling** (governed data masters + immutable provenance
  trails) per `MMT-ADR-0000` §I.4; ADR-0000 **amended** (2026-06-08) to record it. **Vetting records = a permanent
  series** — one immutable record per master change, forever; `2026-06-06-launch-set-iteration-1.md` is the first,
  written after-the-fact. The `0016`↔`0000` doctrine-divergence *instance* is gone (the offending lockstep-denial line
  was removed in the repurpose); the **canon-authorship-process** work survives for Phase H/I (which also owns defining
  the undefined routing nouns `tutor` / `judge` / `rung` / `tier` / `flow` / `slot`, glossed inline in `0014`/`0016` for now).

- **2026-06-07** — **`MMT-ADR-0016` (LLM routing) surfaced from a parallel track; reconciliation opened
  (open rulings pending).** A separate model-selection research track (openrouter PR #741) produced
  `MMT-ADR-0016` + routing specs (originally drafted as ADR-0013, renumbered) and landed via the pull; the
  walkthrough deferred R-5 to it. Findings: (1) `0016` **pins ephemeral model slugs** as ratified canon —
  same drift trap as the policy matrix; to be stripped to a (interim) data master + after-the-fact vetting
  records, the ADR keeping durable rulings only. (2) `0014`↔`0016` = **one routing mechanism named twice**
  (`allowed_models`/routing-rule table; vetting/eval-harness admission gate) — reconcile vocabulary +
  cross-refs + layering. (3) **WP-4 not superseded** — it *is* the admission/vetting function (compliance
  half PM + capability half eng). (4) `0016` asserts a **doctrine divergence** from `MMT-ADR-0000`
  (ADRs-as-sole-system-of-record vs ADR↔canon lockstep) — flagged **not minor**; reconcile during the
  `architecture.md` refresh (Phase H/I), which must also define the canon-authorship process
  (`architecture.md` ↔ ADR ↔ `ARCH-N`). **Open for ruling (this is a thinking thread, not yet decided):**
  merge-vs-keep `0014`/`0016`; whether the Gemini-exit is an architecture *decision* or a compliance *input*;
  the interim model-master format (config vs doc).

- **2026-06-07** — **Phase J re-scoped (light pass → full doc/memory alignment); memory↔canon boundary +
  documentation index + interim governance added as threads.** Triggered by the question "should the A-vs-B
  decisions live in memory?" → **no.** Generalized to a principle (same as DB-is-master): **structured canon
  is master; memory holds pointers + non-canon working state + user facts, never a copy of canon.** Findings:
  (1) the unifying **documentation index does NOT exist** (only per-layer `adr/README.md`, `audit/INDEX.md`);
  it is the boot-flow linchpin + a prerequisite for Phase J, seeded by Phase G. (2) **Phase J re-scoped** from
  "light pass" to a **full alignment activity** — (a) restructure retained memories into pointers to canon
  (extract-before-cleanup), (b) cull memories that can't be linked to canon *and* have uncertain provenance,
  (c) reduce `CLAUDE.md`/`AGENTS.md` to pointer-layer; gated on the index + the ratified rule; scoped to the
  identity-foundation surface (estate-wide = Stream 2). (3) **Interim governance (now → J)** = forward-only
  ratchet: no new content-bearing memory, new memory = provenance-cited pointers, doctrine stays pointer-layer,
  cleanup debt logged not fixed ad hoc. (4) **WP-6 reframed** from a memory content-summary to a thin
  provenance-cited pointer; the decisions' real home is canon (ADRs ✅, carve-out + CONTEXT pending). The
  memory↔canon *rule* must be ratified in the doc-strategy layer **before** Phase J runs.

- **2026-06-07** — **Roadmap integrated with the "A-vs-B" outcome — the runway grew by a spine sub-phase
  (F.1) + two architectural lanes.** The v1 launch-scope investigation (the **"A-vs-B" decision** —
  serve sub-consent-age minors at launch, or defer to v2) ran 2026-06-01→06-05 and surfaced work the
  earlier runway did not account for, now signed in the decision-capture memo (2026-06-06; **PM
  sign-off confirmed**). **Integration calls made this session:** (1) **Phase F now carries F.1** — the
  **policy-engine + model-router spine** — recorded as 3 ADRs (`MMT-ADR-0013` engine · `MMT-ADR-0011`
  amendment · router ADR ≈`0014`) that gate Phase H; the new **Phase F.1 section** folds the memo's
  ten work packages ("WP-1".."WP-10") into the phases by sequence + dependency. (2) **G–P keep their
  shape but inherit new inputs** — the canonical set (G) gains the 3 spine ADRs; the carve-out (H)
  must cover the consent-category model + engine + router/vetting split + the 6-persona/capability
  model + the age-floor split; the cleanup sweep (J) absorbs the memo's Phase-J expansion (WP-8 —
  charge-terminology, personas, capabilities, "Path X", routing supersessions). (3) **The "11"
  age-floor thread is superseded** by the three-axis model + the **"Path X"** v1/v1.1 split. (4) **The
  R-1 COPPA fork is encoded explicitly** (US sub-13 parent-operator path opens or stays blocked on the
  walkthrough's legal ruling); the **sub-13 v1.1 ungating workstream (WP-10)** is a named, deferred,
  demand-triggered future workstream, out of G–P scope. **Parallelism ruled:** the walkthrough runs in
  parallel with this planning — it is confirmatory for the already-signed decisions and only fills
  enum *values* (inputs to the ADR *bodies*) + resolves the R-1 fork, neither of which destabilizes
  the phase structure. **Also this session:** the walkthrough package was tightened + reconciled to the
  memo (WP namespace, R-5 "illustrative-not-ratified" framing, the supersedes list, de-staled legal
  corpus). **F.1 closure** (and therefore Phase F) waits on: walkthrough run → 3 ADRs ratified →
  vetting workstream named → memory/handoff landed → R-1 resolved.

- **2026-06-04** — **`inv 17` rephrased — store-delegation sharpened to payment mechanics only — RATIFIED
  (architect).** The lone open call from the 2026-06-03 counsel walkthrough (`I-PB-B3a` — the store-
  delegation of payment liability ripple): counsel ruled that inv 17 v1.1's "no age gate of ours"
  overreached on four axes. **Rephrased inv 17** to: "Payer *mechanics* are store-delegated for
  store-mediated payment; **store delegation does *not* discharge the four obligations that
  remain ours**" (the consent gate on the LLM-disclosure trigger; the minor's contractual
  incapacity; the supplier-side withdrawal + digital-content conformity + unfair-terms duties;
  the paywall/upsell copy to a minor). **Companion correction in MMT-ADR-0002 (amendment
  appended 2026-06-04):** the merchant of record is **Apple/Google alone**; **`RevenueCat` is
  our Art 28 processor** (DPA duty, no liability absorption). **Bodies updated in lockstep:**
  ontology §4 inv 17 (rephrased); ontology §R (newest-first ratification entry); CONTEXT.md
  Payer entry (the "no age gate of ours" line replaced with the four-axes framing; pointer
  updated). **No data-model or domain-model change** — the rephrase makes the canon say what
  the schema already does (consent gate on the LLM-call side per `I-PB-B2a`; `payer_person_id`
  access-inert per `MMT-ADR-0002`). **→ All 2026-06-03 counsel walkthrough architect calls
  closed.** Carried forward (not architect-owned, on other tracks): G7 VPC vendor pick
  (procurement, after legal requirements are clear).

- **2026-06-04** — **Roadmap extended: F is "planning for the planning" and G–P are the actual planning.**
  A through F concluded with the deep-thinking runway: drift map (A) → product intent + 4
  architecture ripples (B) → doc-strategy + the decisions layer (C) → domain model + 4 ADRs (D) →
  data model + 2 ADRs (E) → the `inv 17` rephrase + planning-for-the-planning (F). **F closes
  as "planning for the planning":** the shape of the G–P work is ratified, but the actual
  planning lives in G–P. **G–P are 10 lettered phases** (one per step, sub-phases as
  `G.1`, `G.2` etc. if needed):
  - **G — Lock the canonical set** (confirmation only; the 9 docs are in place; this phase
    *names* the lens for the gap analysis (L)).
  - **H — Author the `architecture.md` identity-foundation carve-out** (the *one* deep new
    piece of canonical authoring; rock-solid; cited to ADRs + data model).
  - **I — Light pass on the rest of `architecture.md` + `ARCH-N` touch (identity-foundation
    domain)** (merged: misleading info corrected + `ARCH-N` promoted/superseded for the
    identity-foundation domain; scope-by-touching, not scope-by-coverage).
  - **J — Light pass on memory + agent rules** (the criterion: "would *any* agent's session
    context be polluted by stale information?"; fix only what's misleading).
  - **K — `ARCH-N` touch** (REMOVED — merged into I as a joint scope).
  - **K — Consolidation activity** (the 14 sub-audits of the `2026-05-29-full-audit/`
    cluster + the `.deepsec/` module; discard the `claude/` + `codex/` trial reconciliations;
    classify findings; discover workstreams from the sub-audits' own clustering (6 candidates:
    architecture; agent-instructions; errors-api; l10n-a11y-mobile; security-pii-api;
    security-pii-inngest); cross-check the drift map against the canonical set; produce
    `docs/audit/2026-05-29-full-audit/RECONCILED.md`. **K.0 is the canon-contradiction
    check** (canonical set has no internal disagreements before K.1); **K.5 estimates the
    sizing of the reconciliation work**; **K.6 is the decision point** — spin up a separate
    workstream to actually reconcile (per-workstream deep reconciliation with partial
    canonical sets) or *defer* reconciliation entirely (each workstream reconciles itself
    in its own context when it picks itself up). The decision criteria: cost now vs.
    cost later; value of a single reconciled audit as the L input vs. value of per-workstream
    reconciliations; the one-person-bandwidth call.
  - **L — Unified gap analysis** (one row per finding, tagged `(source-audit,
    source-finding-id, domain, classification, in-scope?, defer-to-which-workstream?,
    canonical-set-source)`; reads the consolidated-audit (K's output) + the canonical set
    (G–J) + the as-is).
  - **M — Four-bucket triage** (every finding lands in one of: (1) already handled in
    identity-foundation; (2) clear in for the master plan; (3) clear out for the master
    plan (named workstream); (4) defer (no workstream yet, or the workstream isn't mature
    enough)).
  - **N — Sequencing** (dependency map + critical path; identity-foundation workstream
    sequenced *first* as the dogfood of the Cosmo top-down process).
  - **O — Remediation plan (the master plan)** (architect sign-off; scope, out-of-scope
    workstreams, sequenced work packages, dependency map, bundle grouping, Cosmo-enablement
    interface).
  - **P — Hand off to execution** (Cosmo work-package slicing; the Cosmo top-down
    process enablement is the parallel precondition).


  **G–P's exit gate (the "ready to start implementation" gate)** is the P phase's
  exit: the master plan (O) is signed off *and* the Cosmo work packages are sliced (P).
  The execution phase starts *after* P; its naming is Cosmo's, not the roadmap's.

  **Naming convention:** G–P are lettered phases of *the pre-execution* (the
  pre-implementation work), one per discrete, reviewable step. Sub-phases (if a step needs
  internal sub-pacing) get `G.1`, `G.2`, etc. The execution phase starts *after* P
  (Cosmo work-package IDs, not roadmap letters).

  **Architectural decision recorded:** the letter discipline is *preserved* for the
  new pre-execution work because the work *is* discrete, reviewable, and step-shaped
  (the K.5 sizing estimate, the K.6 decision point, etc. are each reviewable artifacts
  in their own right). F+'s descriptive sub-pacing was considered and rejected — the
  work is *step-shaped*, not *workflow-shaped*, so letters fit. **Phase F closes as
  "planning for the planning"; Phases G–P are the planning.**

- **2026-06-04** — **Phase E complete: data model realized (`data-model.md`) + 2 ADRs.** Grilled with the
  architect, 8 decisions locked (D1–D8), counsel walkthrough findings (`I-C1`/`I-C2`/`I-C4`, `I-PB-B2a`/
  `I-PB-B2b`/`I-PB-B3b`, `I-A2`, `I-D1`, `I-E3`) baked in by structure. **8 tables** (person / login /
  organization / membership / subscription / guardianship / supportership / consent_grant) + the
  **structural `person_retain` per-class retain-tier set** (consent_receipt / deletion_audit /
  financial_record). The schema is a **fresh create-from-empty baseline** on the **documented reset**
  (`MMT-ADR-0012`); from this baseline forward, append-only migrations are absolute. **`MMT-ADR-0011`**
  carries the data-model realization (8 decisions in 6 sections — topology, edges, consent, scheduler,
  retention seam, roles). **`MMT-ADR-0012`** carries the one-time baseline reset as its own governance
  record (the reset is visible to future contributors). **The I-C1 receipt-survives-deletion defect is
  fixed structurally** (the receipt lives in `consent_receipt`, not in a `deleted_at` column on
  `consent_states`); **the I-C4 consent-refresh defect is fixed by the unified daily sweep** (the
  sweep now owns consent re-evaluation at age transitions); **the I-D1 v1-stance is pre-wired**
  (`consent_grant.organization_id` enforced; `controller_role` is the gated, clean-add future — not a
  dormant column). **Lockstep:** ontology §R (newest-first entry), `domain-model.md` §7 (handoff
  resolved), `CONTEXT.md` identity-noun parity (Person / Login / Organization / Membership / Subscription
  / Payer / Guardianship / Supportership all align with the new `data-model.md` §2), ROADMAP Phase-E box
  flipped to `[x]`. **Carried forward (named, not gating E):** "11" age-floor final product call (added
  to ROADMAP threads; gated on content-rating / directed-to-children store posture); retention *values*
  (counsel); `inv 17` rephrase (`I-PB-B3a`, architect); G7 VPC vendor (procurement). **→ Phase F
  unblocked.**

- **2026-06-03** — **Phase D complete: domain model ratified (`domain-model.md`) + 4 ADRs.** Grilled with the
  architect, then authored. **Rulings:** (1) **Core entity & role model → MMT-ADR-0007** (reconstructed — the
  ontology Grill-#1 entities/roles get a first-class ADR home, per the architect's call to capture them now, not
  defer to Stream 2). (2) **Guardianship capability placement (D1/E9) → Option A → MMT-ADR-0008** — one *global*
  edge stores consent-authority + the consent record only; `operate`/`manage`/`view` are **derived** at query
  time (`guardian-link ∧ shared-org ∧ charge-has-no-Login`), not stored per-org; one named authority resolver;
  this also rules the **consent/visibility half of multi-org governance (E7)** and keeps the separated-parents
  one-Person model reachable (E8). (3) **Durable transition scheduler (inv 24) → Option 1 → MMT-ADR-0009** — one
  unified daily Inngest sweep over all time-triggered transitions (E1/E2/E5), mirroring `daily-snapshot.ts`.
  (4) **Family-join / consolidation primitive → MMT-ADR-0010** — invite-flow + home-org reassignment via
  `migration-pending`; v1 single home org sidesteps multi-org federation; billing option B. **Lockstep:** ontology
  §R + inv 23/24 + §6 flips; CONTEXT.md Guardianship entry. **Carried forward (named, not gating D):** separated-
  parents v1 build scope (E8 → product + legal); recorded-Payer under Family Sharing (E3 → Phase E); co-guardian
  one-of/all-of rule (E4 → counsel); VPC vendor (G7). **Consequence: Phase E (data model) is unblocked.**

- **2026-06-03** — **Phase C complete: doc-strategy ratified as `MMT-ADR-0000`.** Reframed (per the roadmap
  premise) from "tidy specs" to **"install the missing decisions layer."** Calls: (a) a 5-layer doc model
  (glossary / canon / **decisions(ADR)** / operational / lessons) + agent-doctrine as a *pointer* layer; (b) the
  decisions layer is **first-class with a lockstep lifecycle** (ADR = immutable *why*, canon = living *what*, one
  change-set); (c) identifier **`MMT-ADR-NNNN`** (mirrors estate `NEX-ADR`; `MEM` rejected — collides with the
  memory layer); (d) the **`decision-adr-link` ratchet** (forward-only, baselined) is the *pivot* that stops new
  accretion; (e) **`ARCH-N` frozen** + a five-exit disposition taxonomy (absorb-forward, no permanent alias);
  (f) **chunking is reactive editorial, not ratified** as policy; the anchored-spine PRD stays standalone and the
  ontology folds into `CONTEXT.md` at the clean cut; canon also carries a **principles/invariants catalog** (the
  gate's conformance surface). The **gate is architectural significance** (a positive OR-test:
  deviates-from-principle / constrains-others / moves-an-NFR / structural / foundational-tech), not a conjunctive
  triple. **Physical layout decided** (§I.4): ADRs at `docs/adr/`, canon → `docs/canon/`. **Executed now (define + seed):** `MMT-ADR-0000`; the ratchet
  (script + test + baseline of 18 + `docs-checks.yml` job); 3 seed ADRs (`0004` billing/memory-only, `0005`
  book-mastery atomic UPDATE, `0006` OCR = `ARCH-14` promotion, code citation migrated); `adr/README.md`;
  agent-doctrine pointer in CLAUDE.md/AGENTS.md; renamed `0001/0002` → `MMT-ADR-`. **Deferred (Stream 2 +
  the roadmap tail for the identity slice):** the ~70-decision backfill (MoSCoW: memory-only / multi-source =
  MUST), the **principles-catalog build**, the `ARCH-N` drain (incl. the discovered `ARCH-3` "plain wrong"
  citation), the agent-doc/memory pointer cleanup, and the **reduced `docs/` reorg** (canon→`docs/canon/` + the
  drains — what remains of F-PLACEMENT once the ADR home is settled). Estate-level ZDX generalisation parked as **WI-519**.
- **2026-06-03** — **Phase B complete: the 4 architecture ripples re-confirmed by the architect (`T✓`).**
  Recorded in Part 10 §H. **(1) Scheduler (inv 24):** feasible on the existing Inngest cron + per-Person
  fan-out rail (mirrors `daily-snapshot.ts`), **zero new infra**; three consumers (E1 birthday, E2 residence,
  E5 inactivity); birthday scan can't filter to recently-active (dormant accounts still age) → an index on
  `birth_date`/`last_activity` is a Phase-E note. **(2) E5:** **inv 21 amended in canon** (clarifying — an
  explicit, authority-held, audited charge deletion ≠ the silent cascade it forbids); abandonment rides the
  scheduler + warn/export window; delete-authority follows consent-authority. **(3) Child-own-login
  (D1 + E1-takeover):** **invite-flow** (child self-provisions via the existing Clerk JIT account path), not
  parent-creates-credential — the only mechanism coherent with the E1 managed→credentialed self-takeover.
  **(4) E12 join-my-family:** a consolidation join **reusing the invite-flow primitive**, collapses to a single
  home org (**sidesteps E7**); the active-store-sub teen case ruled **option B (join-with-disclaimer)** since
  store-delegated billing rules out server-side refund. **Consequence: B's exit gate is met; D-ratify is
  unblocked** (D carries the 4 forward). **ADRs pending placement** (scheduler; family-join primitive) — held
  for the Phase-C doc-strategy call. **Counsel queue (REQ-2) grows by one:** minor double-billing disclosure +
  grace.
- **2026-06-02** — **Phase B-product complete (PM product sign-off).** The PM walkthrough ran all six segments;
  every open Part-10 product item is ruled `P✓`: **E6** (split surface, purpose-led landing; "add-first-child"
  landing = PM Notion follow-up), **C2/C3** (homework-helper = ads wedge; audience = serious learners + mentors,
  any age), **D1/D2/E0** (self-signup → own login + add-child "own device or yours?" choice; browse-preview locked
  no-AI/no-collection; teen self-pay store-delegated), **E5** (last-guardian: parent-choice-at-deletion
  export/attach-adult/delete, scoped to under-age; abandonment → inactivity-expiry policy; *P-lean*), **E1**
  (visibility off-by-default at consent age + reshare; takeover **by prompt**, not auto), **D3** (reminder caps +
  short cooldown), **E12** (**un-deferred — a minimal "join my family" is REQUIRED in v1**), **E13** (minor-initiated
  guardianship ban kept; parent-initiated join = v1), **E2** (move → suspend to browse-preview; **declared-residence**
  detection + conditional nudge), **F1-BT-b** (in-app birth-year fix; boundary-crossing → light verification).
  **4 ripples reopen architecture (ripple rule) — architect must re-confirm before D ratifies:** (1) **child-own-login
  provisioning** mechanism (D1 + E1-takeover; → §6 entry-point asymmetry; net-new/T2+); (2) **E5** — does explicit
  parent-initiated delete reconcile with inv 21, + the abandonment fallback; (3) **E12** — **T reverts to pending**:
  scope cheapest v1 join (membership + billing/quota reconciliation, never-orphan inv 21, migration-pending inv 25,
  E7 interaction); (4) a shared **durable scheduler** (inv 24) now load-bearing for inactivity-expiry (E5) + birthday/age
  (E1) + residence re-eval (E2). **Counsel queue (REQ-2):** inactivity-deletion specifics (period/notice/billing-tax
  carve-outs); child erasure right + parent authority; moved-country grace-window; birth-year boundary verification
  method. **PM action:** log the "add your first child" landing screen as a missing feature in Notion. Decisions live
  in `identity-foundation-prd.md` Part 10 (commit `d6d93505d`); full handoff = `_handoffs/2026-06-02-b-product-complete.md`.
- **2026-06-02** — **Parallel-track execution adopted** (see "Execution model — parallel tracks" above). C + D
  proceed now alongside the PM's B-product pass; D-ratify and E wait for B-product (ripple insurance); the PM
  front-loads ripple-prone items (E5, new personas); Track 2 stays product-neutral on P-tails. Gate order
  unchanged.
- **2026-06-02** — **Phase B-tech complete (technical/architecture sign-off on product intent).** All Part-10
  Decision-Queue items that were the technical reviewer's to rule are ruled (`T✓`): §A personas, §B
  authoring-altitude, C1, D4, **E0 Payer (→ ontology v1.1, store-delegated)**, E1 threshold-crossing
  (per-dimension), E2 jurisdiction-change (suspend + re-prompt), E8 separated-parents (reachability), E10
  de-credential (disallow), E11 self-registered-minor, E12 two-Persons consolidation, E13 reverse-invite
  (ban minor-initiated guardianship), F1 (kept `[DERIVED]` + break-tests), plus new requirement **R13**
  (guardian-attachment-to-existing). **Gate now hands to B-product (the PM pass)** — open product items
  (C2/C3 framing, D1–D3 UX defaults, E5 last-guardian, E6 multi-role surface), every flagged P-tail, and
  PM-coordinated legal (G1–G7, E4). **Phase-D queued:** E3 (Family-Sharing payer identity), E7 (multi-org
  governance), E9 (guardianship capability placement); G7 vendor pick (technical reviewer) waits on legal
  requirements. Subject to the **ripple rule** — a PM-added persona/journey/edge case can reopen any `T✓`.
- **2026-06-02** — **Phase B sign-off model split (dual-axis).** Product-intent rulings now carry two
  **independent** sign-offs: **T (architecture / technical reviewer)** and **P (product / PM)** — legend
  + axis-applicability table + ripple rule in `identity-foundation-prd.md` Part 10. Consequence:
    **Phase B's exit gate splits into B-tech (technical reviewer) and B-product (PM pass).** B-tech is
    reachable now; B-product is a second event. We may proceed into Phase D on the working assumption that
    the foundation accommodates all in-scope UX, but **D inherits residual risk until B-product clears** —
    the ripple rule reopens any `T✓` architecture item if the PM adds an in-scope persona / journey / edge
    case. First batch stamped `T✓ 2026-06-02`: §B authoring-altitude, A0–A5 personas (A4-surface→E6), C1
    framing, D4 stricter-wins.
- **2026-06-01** — **Phase A complete.** `_research/drift-map.md` produced via a 34-agent citation-verified workflow
  (three-way reconciliation; audit re-triage + sibling-coupling + doc-staleness folded in). All 7 sibling
  plans tagged in `docs/plans/`. Key outputs: consent/COPPA-under-own-logins confirmed as the single
  load-bearing P0; T1 (`0106`) confirmed inert (zero readers/writers); four parallel role/ownership
  encodings identified; PRD-refresh backlog prioritized (PRD = P0). A coverage boundary (§7) flags 5
  identity-adjacent areas no cluster reached (P2 self-reg minor, non-owner data-subject rights, the
  2026-05-19 nav spec, `docs/flows/*` + store-compliance docs, the 36-gap audit) for a Phase-A addendum or
  Phase-B intake.
- **2026-06-01** — **Phase-A addendum complete.** An 8-agent verified sweep (`wf_b9dcc01e-849`) closed all 5
  coverage-boundary areas → `_research/drift-map.md` §7A. Surfaced: the P2 self-registered-minor consent breaks (incl.
  a new authority-resolution **bug** — `getFamilyOwnerProfileId` treats the minor as their own consent
  authority); the full non-owner data-subject-rights cluster; `resolveNavigationContract` confirmed as the
  single nav migration seam (6 test suites will break together); store/legal launch-gates for the
  credentialed-minor path; and a 36-gap audit evidence index (28/36 identity-coupled, 6 new-uncovered — 4
  fold, 2 ship-now). Phase A (map + addendum) is now closed; ready for Phase B intent-lock.
- **2026-06-01** — Roadmap created. Tracking = **repo-only**, this file. Chunked-doc structure is a
  **pilot** in this folder (reversible until C). Sibling-plan re-triage added as a thread (provisional
  now, final split after D). Cosmo implementation WIs deferred to F.
- *(earlier decisions: see `README.md` decision log — clean-cut chosen, plans archived, T1 flagged for
  revert.)*
