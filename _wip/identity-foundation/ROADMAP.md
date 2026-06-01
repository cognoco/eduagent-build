# Identity Foundation — Pre-Implementation Roadmap

**Scope:** the thinking/decision runway only — drift map → product intent → doc strategy →
architecture (domain + data model) → the **"ready to plan implementation" gate (F)**. This file is
**not** an implementation plan, and **no Cosmo work items are created until F is passed.**

**Tracking:** repo-only; this file is the single source. Deliverables land as sibling docs (see
README index). **Status: 2026-06-01 — Phase A not started; product intent NOT locked.**

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
| **A** | Drift map (+ audit re-triage + sibling provisional-tag) | `drift-map.md` | Claude | ⬜ | — | drift quantified across intent / canonical docs / code; PM has concrete input |
| **B** | Product intent | `product-intent.md` | **PM** (Claude facilitates) | ⬜ | A | reconstructed-PRD §11 questions resolved + signed off |
| **C** | Doc-strategy decision (pilot) | ADR (*location per this decision*) | You + Claude | ⬜ | A informs; piloted via B/D/E | chunk-vs-monolith decided; PRD-rebuild-vs-separate-doc decided; rollout call made |
| **D** | Domain model | `domain-model.md` + ADR(s) | Claude (you ratify) | ⬜ | B | entities / roles / **consent model** / tenancy locked; org/membership **re-derived**, not inherited |
| **E** | Data model | `data-model.md` + ADR(s) | Claude (you ratify) | ⬜ | D | target schema + cut strategy locked |
| **F** | Ready-to-plan gate | — | You | ⬜ | B, D, E + threads | all ratified → implementation planning + Cosmo WIs + T1 revert begin |

---

## Cross-cutting threads

- **Consent/COPPA spec + legal check** — spans B/D; gates any code touching consent. ⬜
- **T1 revert** — decision MADE (forward-only); execution deferred to F. Do **not** delete migration
  `0106` in isolation (it's committed + applied). ⬜
- **Sibling-plan re-triage** — see below. ⬜

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

- **2026-06-01** — Roadmap created. Tracking = **repo-only**, this file. Chunked-doc structure is a
  **pilot** in this folder (reversible until C). Sibling-plan re-triage added as a thread (provisional
  now, final split after D). Cosmo implementation WIs deferred to F.
- *(earlier decisions: see `README.md` decision log — clean-cut chosen, plans archived, T1 flagged for
  revert.)*
