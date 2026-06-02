# Identity Foundation — Pre-Implementation Roadmap

**Scope:** the thinking/decision runway only — drift map → product intent → doc strategy →
architecture (domain + data model) → the **"ready to plan implementation" gate (F)**. This file is
**not** an implementation plan, and **no Cosmo work items are created until F is passed.**

**Tracking:** repo-only; this file is the single source. Deliverables land as sibling docs (see
README index). **Status: 2026-06-02 — Phase A complete; Phase B in progress (B-tech **complete**, B-product pending PM); product intent NOT yet locked.**

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

| # | Phase | Deliverable | Owner | Status | Depends on | Exit gate |
|---|---|---|---|---|---|---|
| **A** | Drift map (+ audit re-triage + sibling provisional-tag) | `drift-map.md` | Claude | ✅ | — | drift quantified across intent / canonical docs / code; PM has concrete input |
| **B** | Product intent | `product-intent.md` | **PM** (Claude facilitates) | 🟡 | A | Part 10 resolved + **dual sign-off** (B-tech ✓ 2026-06-02; B-product = PM pass) |
| **C** | Doc-strategy decision (pilot) | ADR (*location per this decision*) | You + Claude | ⬜ | A informs; piloted via B/D/E | chunk-vs-monolith decided; PRD-rebuild-vs-separate-doc decided; rollout call made |
| **D** | Domain model | `domain-model.md` + ADR(s) | Claude (you ratify) | ⬜ | B | entities / roles / **consent model** / tenancy locked; org/membership **re-derived**, not inherited |
| **E** | Data model | `data-model.md` + ADR(s) | Claude (you ratify) | ⬜ | D | target schema + cut strategy locked |
| **F** | Ready-to-plan gate | — | You | ⬜ | B, D, E + threads | all ratified → implementation planning + Cosmo WIs + T1 revert begin |

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

- **Consent/COPPA spec + legal check** — spans B/D; gates any code touching consent. ⬜
- **T1 revert** — decision MADE (forward-only); execution deferred to F. Do **not** delete migration
  `0106` in isolation (it's committed + applied). ⬜
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

| Sibling plan | Gap IDs | Coupling | Provisional verdict |
|---|---|---|---|
| `resumable-practice-state` | practice-1/2/4 | none | **Independent** → safe to proceed now on current model |
| `learning-library-cleanup` | learn-2 (!), learn-3 | low | Mostly indep; `learn-3` half safe now, `learn-2` is a T3 identity item |
| `notification-reachability-nudges` | notif-1..4 | partial | Per-member vs owner notifs overlap redesign flow #7 → split |
| `profile-setup-personalization-corrections` | onboard-1..4 | coupled | Onboarding = who-creates-whom + roles + consent → **fold** |
| `billing-recovery-learner-capacity` | billing-3/4, learn-1 (!), notif-3 | coupled | "Learner capacity" = seats/membership; cites `learn-1` → **fold** |
| `account-security-self-service` | auth-2/3/4 | heavy | change-email / sessions / login all change under multi-login → **fold** |
| `product-continuity-low-hanging-fruit` | (none) | separate | Earlier grab-bag, not in the identity batch → evaluate on own merits |

**Split rule** (mirrors the audit re-triage): truly independent → proceed now on the current model;
identity-coupled → park & fold into the foundation (don't build on the about-to-be-replaced model);
separate → evaluate standalone.

---

## Definition of "ready to plan implementation" (Phase F gate)

- [ ] **B** — product intent ratified (§11 answered).
- [ ] **D** — domain model locked, incl. consent/COPPA model + legal check.
- [ ] **E** — data model + cut strategy locked.
- [ ] Sibling plans re-triaged against the target; coupled set identified + handled.
- [ ] **C** — doc-strategy decided (where intent/ADRs live going forward; pilot rolled out or not).
- [ ] T1 revert sequenced as the first implementation step.
- → **Only then:** create Cosmo implementation work items.

---

## Decision log

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
