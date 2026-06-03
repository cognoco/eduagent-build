# Identity Foundation — Pre-Implementation Roadmap

**Scope:** the thinking/decision runway only — drift map → product intent → doc strategy →
architecture (domain + data model) → the **"ready to plan implementation" gate (F)**. This file is
**not** an implementation plan, and **no Cosmo work items are created until F is passed.**

**Tracking:** repo-only; this file is the single source. Deliverables land as sibling docs (see
README index). **Status: 2026-06-03 — Phases A, B, C, and **D complete**. Phase D ratified the domain model
(`domain-model.md`) + 4 ADRs (MMT-ADR-0007 entity/role model · 0008 guardianship global-edge/derived-operation ·
0009 unified transition scheduler · 0010 family-join primitive); ontology + CONTEXT.md moved in lockstep.
**Phase E (data model) is now unblocked.** Remaining for F: E (data model) + sibling re-triage + T1 revert sequencing.**

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
| **E** | Data model                                              | `data-model.md` + ADR(s)           | Claude (you ratify)         | ⬜     | D                            | target schema + cut strategy locked                                                                |
| **F** | Ready-to-plan gate                                      | —                                 | You                         | ⬜     | B, D, E + threads            | all ratified → implementation planning + Cosmo WIs + T1 revert begin                              |

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
- **`MMT-ADR-0005` break-test owed** — a concurrency regression for the atomic book-mastery `UPDATE` (red against a read-then-write impl, green against the atomic version); tracked in the ADR's Consequences, not yet written. ⬜
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

## Definition of "ready to plan implementation" (Phase F gate)

- [x] **B** — product intent ratified (Part 10 resolved; 4 architecture ripples re-confirmed `T✓` 2026-06-03, Part 10 §H).
- [x] **D** — domain model locked (`domain-model.md` + MMT-ADR-0007–0010); consent model locked; the legal-check items (E4 one-of/all-of; parent-delete; dormancy specifics) are named, scoped to E/counsel, and do not gate D.
- [ ] **E** — data model + cut strategy locked.
- [ ] Sibling plans re-triaged against the target; coupled set identified + handled.
- [x] **C** — doc-strategy decided (`MMT-ADR-0000`): decisions layer + `MMT-ADR-NNNN` + the `decision-adr-link` ratchet; ADRs homed at `docs/adr/`; the broader `docs/` reorg → deferred follow-up.
- [ ] T1 revert sequenced as the first implementation step.

- → **Only then:** create Cosmo implementation work items.

---

## Decision log

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
