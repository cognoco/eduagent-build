# Identity Foundation — Pre-Implementation Roadmap

**Scope:** the thinking/decision runway only — drift map → product intent → doc strategy →
architecture (domain + data model) → the **"ready to plan implementation" gate (F)**. This file is
**not** an implementation plan, and **no Cosmo work items are created until F is passed.**

**Tracking:** repo-only; this file is the single source. Deliverables land as sibling docs (see
README index). **Status: 2026-06-04 — Phases A, B, C, D, and **E complete**. Phase E ratified the data
model (`data-model.md`) + 2 ADRs (MMT-ADR-0011 data-model realization · 0012 one-time baseline reset);
ontology + `domain-model.md` + `CONTEXT.md` + ROADMAP moved in lockstep. The 8 tables + structural
`person_retain` set are stated as a fresh create-from-empty baseline; from this baseline forward,
append-only migrations are absolute. **`inv 17` rephrased** (the lone open call from the 2026-06-03
counsel walkthrough); all architect calls closed. **Phase F (planning *for* the planning) is in
progress; Phases G–P are the actual planning.** The roadmap's single end-state is *"ready to start
implementation"*; the path to that end-state is A–R (the deep thinking + the firming,
classification, planning) and the first work package in execution (after R).**

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
| **A** | Drift map (+ audit re-triage + sibling provisional-tag) | `drift-map.md`                     | Claude                      | ✅     | —                           | drift quantified across intent / canonical docs / code; PM has concrete input                      |
| **B** | Product intent                                          | `product-intent.md`                | **PM** (Claude facilitates) | ✅     | A                            | Part 10 resolved +**dual sign-off** (B-tech ✓ 2026-06-02; B-product P✓ 2026-06-02; **4 ripples re-confirmed `T✓` 2026-06-03 — Part 10 §H**) |
| **C** | Doc-strategy decision (pilot)                           | **`MMT-ADR-0000`** (in `docs/adr/`) | You + Claude                | ✅     | A informs; piloted via B/D/E | **DONE 2026-06-03** — decisions layer ratified; convention + ratchet + 3 seed ADRs shipped; backfill deferred (Stream 2) |
| **D** | Domain model                                            | `domain-model.md` + ADR(s)         | Claude (you ratify)         | ✅     | B                            | **DONE 2026-06-03** — entities / roles /**consent model** / tenancy locked; org/membership **re-derived**, not inherited; 4 ADRs (MMT-ADR-0007–0010) placed |
| **E** | Data model                                              | `data-model.md` + ADR(s)           | Claude (you ratify)         | ✅     | D                            | target schema + cut strategy locked                                                                |
| **F** | Ready-to-plan gate (planning *for* the planning)       | —                                 | You                         | ⬜     | B, D, E + threads            | shape of G–P ratified; **`inv 17` rephrased**; sibling-plan re-triage scoped; gap analysis deferred to L; master plan deferred to O (this phase is **planning for the planning**, not the planning itself) |
| **G** | Lock the canonical set for the identity-foundation carve-out | (confirmation only — the 9 docs are in place) | You + Claude                | ⬜     | F                            | the canonical-set list is *explicitly confirmed*; each doc's role is named; the set is the lens for the gap analysis (L) |
| **H** | Author the `architecture.md` identity-foundation carve-out | a new section / rev in `architecture.md` | Claude (you ratify)         | ⬜     | G                            | the carve-out is rock-solid for: consent flow, IARC/store posture, Payer/billing mechanics, family-join shape, RLS scope, custody/carve-outs, launch-readiness guard; citations to ADRs + data model present |
| **I** | Light pass on the rest of `architecture.md` + `ARCH-N` touch (identity-foundation domain) | edited `architecture.md` + `docs/adr/` promotion/supersession | Claude (you ratify)         | ⬜     | H                            | (a) *directly misleading* information in `architecture.md` corrected; *merely incomplete* sections left as-is; scope-by-touching, not scope-by-coverage. (b) the `ARCH-N` items the identity-foundation domain intersects with are promoted / superseded; the registry-wide drain is *not* in scope (Stream 2) |
| **J** | Light pass on memory + agent rules                      | edited `CLAUDE.md` / `AGENTS.md` / `.claude/memory/` | Claude                       | ⬜     | I                            | *misleading* info removed; the criterion is "would *any* agent's session context be polluted by stale information?"; fix only what's misleading |
| **K** | **Consolidation activity** — produce the consolidated-audit document (includes canon-contradiction check) | `docs/audit/2026-05-29-full-audit/RECONCILED.md` (or similar) | Claude (you ratify)         | ⬜     | J                            | see the *K exit gate* below |
| **L** | Unified gap analysis                                    | a single delta document            | Claude                      | ⬜     | K                            | one row per finding, tagged `(source-audit, source-finding-id, domain, classification, in-scope?, defer-to-which-workstream?, canonical-set-source)`; reads the consolidated-audit (K's output) + the canonical set (G–J) + the as-is |
| **M** | Four-bucket triage                                      | the triage outcome, folded into the delta doc | You + Claude                | ⬜     | L                            | every finding lands in one of: (1) already handled in identity-foundation; (2) clear in for master plan; (3) clear out for master plan (named workstream); (4) defer (no workstream yet, or the workstream isn't mature enough) |
| **N** | Sequencing                                              | the dependency map + critical path, folded into the master plan | Claude (you ratify)         | ⬜     | M                            | sequenced set of work packages with dependencies and bundles; the identity-foundation workstream is sequenced *first* (dogfood) |
| **O** | Remediation plan (the master plan)                     | a single document                   | Claude (you sign off)       | ⬜     | N                            | scope (in-scope work packages); out-of-scope workstreams (named, with rationale); sequenced work packages; dependency map; bundle grouping; Cosmo-enablement interface (B+/C− posture; identity-foundation as first dogfood) |
| **P** | Hand off to execution (Cosmo work-package slicing)     | the Cosmo WIs (sliced from O)       | You + Claude                | ⬜     | O                            | every work package is a Cosmo work item (or grouped into a Cosmo work package); the Cosmo top-down process enablement is the precondition (parallel workstream) |

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
- **"11" age-floor — final product call owed.** The strictly-11+ signup floor (`birthYearSchema`,
  `packages/schemas/src/profiles.ts:38-50`, tag `CR-2026-05-19-H11`) is a *self-imposed product rule, not a legal
  line* (`I-PB-B1` — counsel ruled there is no legal usage floor). Keeping / lowering it is coupled to the
  content-rating + directed-to-children / Kids-Category store posture, and per B1 must ship **with a documented
  rationale in the same change** (the UK Crime & Policing Act 2026 likely makes that written record a statutory
  expectation). Product-owned; surfaced during Phase-E consent grilling (2026-06-04). Decide before the floor is
  touched in implementation. ⬜
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
  (`_wip/identity-foundation/phase-e-fillers-walkthrough/`). 🟡 *added 2026-06-04 during the Phase-
  E → Phase-F handoff.* ⬜
- **Sibling-plan re-triage** — see below. 🟡 provisional tags applied to all 7 plans (2026-06-01);
  preliminary verdicts validated in `drift-map.md` §5 (one diverged: `learning-library-cleanup`). Final
  couple-vs-independent split still deferred to after Phase D.

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

## Definition of "ready to start implementation" (the *R* gate)

The "ready to start implementation" gate is the *P* phase's exit gate, not F's. F closes as *"planning for the planning"* (i.e. the shape of G–P is ratified; the actual planning lives in G–P).

**A–F (the deep thinking + planning-for-the-planning):**
- [x] **A** — drift map + audit re-triage + sibling provisional tag (`drift-map.md`); 36-gap audit evidence index folded in.
- [x] **B** — product intent ratified (Part 10 resolved; 4 architecture ripples re-confirmed `T✓` 2026-06-03, Part 10 §H; **`inv 17` rephrased 2026-06-04** — all 2026-06-03 counsel walkthrough architect calls closed).
- [x] **C** — doc-strategy decided (`MMT-ADR-0000`): decisions layer + `MMT-ADR-NNNN` + the `decision-adr-link` ratchet; ADRs homed at `docs/adr/`; the broader `docs/` reorg → deferred follow-up.
- [x] **D** — domain model locked (`domain-model.md` + MMT-ADR-0007–0010); consent model locked; the legal-check items (E4 one-of/all-of; parent-delete; dormancy specifics) are named, scoped to E/counsel, and do not gate D.
- [x] **E** — data model + cut strategy locked (`data-model.md` + MMT-ADR-0011/0012).
- [ ] **F** — planning-for-the-planning ratified: the G–P shape is confirmed; the consolidation's corpus (14 sub-audits + `.deepsec/`) is identified; the four-bucket triage model is agreed; the `claude/` + `codex/` trial reconciliations are to be discarded; the launch-readiness guard is a Phase-F-thread tracked in this ROADMAP.

**G–P (the firming, classification, planning — the actual planning runway):**
- [ ] **G** — canonical set explicitly confirmed (9 docs; lens for the gap analysis (L)).
- [ ] **H** — `architecture.md` identity-foundation carve-out authored (rock-solid; cited to ADRs + data model).
- [ ] **I** — light pass on the rest of `architecture.md` (misleading info corrected; merely incomplete left as-is) **+ `ARCH-N` touch (identity-foundation domain)**.
- [ ] **J** — light pass on memory + agent rules (any agent's session context; fix only what's misleading).
- [ ] **K** — consolidation activity (the 14 sub-audits + `.deepsec/`; produce the consolidated-audit doc; the K.0 canon-contradiction check; the K.5 sizing estimate; the K.6 spin-up-or-defer decision). See Phase K — detail above.
- [ ] **L** — unified gap analysis (one row per finding; the delta document).
- [ ] **M** — four-bucket triage (handled / clear in / clear out / defer).
- [ ] **N** — sequencing (dependency map + critical path; identity-foundation workstream first as the dogfood).
- [ ] **O** — remediation plan (the master plan; architect sign-off).
- [ ] **P** — hand off to execution (Cosmo work-package slicing; the Cosmo top-down process enablement is the parallel precondition).

**Tracked open threads (not blockers, named for visibility):**
- [ ] Sibling plans re-triaged against the target; coupled set identified + handled.
- [ ] T1 revert sequenced as the first implementation step (lands *during* the execution phase, after R).
- [ ] Launch-readiness guard exists (test file in `apps/api/src/services/identity/launch-readiness.test.ts`; the spec is the Phase-F-thread tracked in this ROADMAP; the implementation lands in the execution phase).
- [ ] "11" age-floor final product call (gated on content-rating / directed-to-children store posture; surfaces in H's `architecture.md` carve-out for completeness).
- [ ] Retention *values* (counsel; the schema's `retention_period` columns are seams; the values fill from the fillers walkthrough results, *not* in scope for G–P).
- [ ] `inv 17` rephrase — **DONE 2026-06-04** (locked in this session; moved out of the open-threads list).
- [ ] G7 VPC vendor pick (procurement, after legal requirements are clear).

- → **Only then:** create Cosmo implementation work items (the work that P hands off to).

---

## Decision log

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
  organization / membership / subscription / guardianship / mentorship / consent_grant) + the
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
  / Payer / Guardianship / Mentorship all align with the new `data-model.md` §2), ROADMAP Phase-E box
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
- **2026-06-01** — **Phase A complete.** `drift-map.md` produced via a 34-agent citation-verified workflow
  (three-way reconciliation; audit re-triage + sibling-coupling + doc-staleness folded in). All 7 sibling
  plans tagged in `docs/plans/`. Key outputs: consent/COPPA-under-own-logins confirmed as the single
  load-bearing P0; T1 (`0106`) confirmed inert (zero readers/writers); four parallel role/ownership
  encodings identified; PRD-refresh backlog prioritized (PRD = P0). A coverage boundary (§7) flags 5
  identity-adjacent areas no cluster reached (P2 self-reg minor, non-owner data-subject rights, the
  2026-05-19 nav spec, `docs/flows/*` + store-compliance docs, the 36-gap audit) for a Phase-A addendum or
  Phase-B intake.
- **2026-06-01** — **Phase-A addendum complete.** An 8-agent verified sweep (`wf_b9dcc01e-849`) closed all 5
  coverage-boundary areas → `drift-map.md` §7A. Surfaced: the P2 self-registered-minor consent breaks (incl.
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
