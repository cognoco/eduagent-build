# Identity Foundation — PRD (anchored spine + decision queue)

**Status:** DRAFT, 2026-06-02. Built **bottom-up from the two canonical documents only** —
`identity-ontology.md` (RATIFIED v1) and `CONTEXT.md` (identity glossary, lines 24–187). This is the
**anchored spine**: every statement in the body (Parts 1–9) carries an inline anchor and asserts
nothing that the canon does not support. Everything from the prior `…-ANSWER.md` (Doc 2) that could
**not** be anchored is held in **Part 10 — Decision Queue** as a candidate awaiting an explicit ruling,
never laundered into the body as settled.
**Date:** 2026-06-02 · **Owner:** PM + Claude.

**Why this shape.** Doc 2 is a rich but *uncertified* statement of intent (it carried at least three
errors the ontology later corrected: learner-universal, "Clerk Orgs for access", mentor-as-a-role). So behaviour is admitted to the body only when it traces to the canon; the rest must earn its place through a ruling. The body is therefore thinner than a Doc-2 re-skin — deliberately.

**Anchor key (every body claim cites one):**

- `(inv N)` — invariant N from `identity-ontology.md` §4 (the 30 ratified invariants).
- `(§X)` — a section of `identity-ontology.md`.
- `(CONTEXT: term)` — a ratified glossary entry in `CONTEXT.md`.
- `(repo: rule)` — an engineering rule in the repo `CLAUDE.md` (e.g. UX-resilience, typed errors).
- `[DERIVED: …]` — not stated verbatim in the canon but **strictly forced** by the cited invariant(s);
  the derivation is shown so it can be checked.

**Decision-queue tags (Part 10 only):**

- `[NEEDS-DECISION]` — a real product/UX call the canon does not force; we rule on it.
- `[DERIVABLE]` — can likely be anchored on inspection; parked here only to confirm the chain.
- `[ANCHORED-OPEN]` — already tracked as open/deferred in the ontology (§6/§8); listed for completeness,
  not for us to re-decide now.

---

## Part 1 — Principles  *(anchored)*

These are the load-bearing commitments, each a restatement of canon — not new intent.

1. **A Person owns their own identity and learning data, permanently.** Learning data is scoped to
   `person_id` (inv 2); a Person's own data is read+write by that Person regardless of roles, because
   self-ownership is **intrinsic to the Person**, not granted by a role (inv 7; CONTEXT: learner). It
   survives graduation (inv 20) and is **never orphaned** by an edge or membership deletion (inv 21).
2. **A grouping never owns a Person or their data.** An Organization is a thin grouping/billing
   container that does no access work (CONTEXT: Organization); access to *another* Person's data is
   **edge-derived**, and membership alone grants only existence-visibility (inv 8). Billing and consent
   follow the home Organization; a second-org edge changes neither who pays nor who consents (inv 18).
3. **Each Person gets the maximum autonomy the law allows; guardian/payer is a minimal overlay.** The
   three concerns — consent authority, billing control, data visibility — are **independent and never
   fused** (inv 22); guardianship grants **separable** capabilities, not one bundled flag (inv 23); a
   paying adult gains **no** visibility into a self-consenting learner's data without that learner's
   opt-in (inv 19).
4. **A Person can move between login modes, and between organizations, without losing anything.**
   Managed → credentialed keeps the same `person_id` and all history (inv 20); a Person can leave an
   Organization with their Person and history intact (inv 21).

**"Done" is the 30 invariants holding under test, each with a break test** (§4 framing; repo:
security-fix red-green). It is **not** "the legacy 36-gap audit closed" — that audit is a regression
checklist (Part 8).

---

## Part 2 — Entities & actors  *(anchored — restating the canon's nouns in behavioural terms)*

The vocabulary the rest of this PRD speaks. All from `CONTEXT.md` (identity glossary) + ontology §1–§2.

- **Person** — one human, the permanent subject of learning data, consent, and identity, *whether or
  not they can log in* (CONTEXT: Person; §1.1). The scoping key for all learning data (inv 2).
- **Login** — the authentication binding to a Clerk User; **0 or 1 per Person** (CONTEXT: Login; inv 3).
  Its absence is what "managed" means; its presence, "credentialed" (§3.1).
- **Organization** — the thin grouping + billing container; always exists (an *org-of-one* at signup,
  inv 1); never owns a Person (CONTEXT: Organization).
- **Membership** — Person ↔ Organization, carrying the **role set `{admin, learner}`** (CONTEXT:
  Membership; inv 5). Grants existence-visibility only (inv 8). First member is always `admin` (inv 5).
  - **`admin`** — org management; age-agnostic; ≥1 per org; transferable; no data access without an edge
    (CONTEXT: admin; inv 8, 17).
  - **`learner`** — "this member learns here"; activates the learning surface; capability-light;
    **not auto-assigned, chosen at onboarding** (CONTEXT: learner; inv 7).
- **Capacity** — the end a Person occupies on an edge; `mentor`/`guardian` are capacities, **never roles**
  (CONTEXT: capacity; inv 6).
- **Guardianship** — a dyadic **guardian → charge** edge carrying the **Consent** record; **Layer 1**
  (consent authority); withdrawable; grants separable capabilities (CONTEXT: Guardianship; §2.2; inv 23).
  - **charge** ≡ **consent-gated learner** — a learner below their jurisdiction's consent age (CONTEXT:
    charge).
- **Mentorship** — a dyadic **mentor → mentee** edge granting **scoped** visibility/help for one specific
  mentee; **Layer 2**; carries **no** consent authority; mentor may be any age (CONTEXT: Mentorship,
  mentor; §2.3; inv 9, 14).
- **Payer** — the Person designated for an Organization's Subscription; a Subscription designation,
  **not** a role, **access-inert** (no data access) (CONTEXT: Payer; inv 17). **Payer *capacity* is
  delegated, not adjudicated:** for store-mediated payment (the only channel for the foreseeable future) the
  store is **merchant of record** and the sole capacity adjudicator — no age gate of ours. A flat **≥18**
  worst-case default (inv 29) applies **only** to a future non-store rail where *we* are merchant of record,
  **not** a per-jurisdiction derivation — over-restricting payment is harmless (an adult Payer can be
  attached, R11) where over-restricting consent would block lawful learning. *(amended v1.1)*
- **Mate (AI Mate)** — the learner's AI tutor; the entity formerly called "mentor" in copy, renamed so
  `mentor` means the human capacity (CONTEXT: Mate; §8 CLEANUP-2).
- **AgeConsentDecision** — the single resolved-decision object the app reads for a Person's consent
  state; the COPPA-portable seam (CONTEXT: AgeConsentDecision; §3.2). Computed by
  `resolveConsentRequirement(age × residence_jurisdiction)` (CONTEXT: AgeConsentDecision; §3.2).

---

## Part 3 — Capability model  *(anchored — the firm heart)*

The legacy fused "owner" is **dissolved**; capability derives from **relationships**, not a role flag
(CONTEXT: Owner ✗ superseded → split into admin / Payer / Guardianship). Five capability sources, only
two of which are roles:


| Capability                                             | **Self** (own data)  | **`admin`**           | **`guardian`** (edge → charge)  | **`mentor`** (edge → mentee)       | **Payer**           |
| -------------------------------------------------------- | ---------------------- | ----------------------- | ---------------------------------- | ------------------------------------- | --------------------- |
| Read/write**own** learning data                        | ✅ intrinsic (inv 7) | —                    | —                               | —                                  | —                  |
| Manage org (members, invites, settings, billing-admin) | —                   | ✅ (CONTEXT: admin)   | —                               | —                                  | —                  |
| Hold consent authority / act-for a charge              | —                   | —                    | ✅ (Layer 1, §2.2)              | —                                  | —                  |
| See/help a**specific** person's learning data          | —                   | ❌ (inv 8)            | ✅ that charge (inv 8)           | ✅ that mentee, edge-scoped (inv 9) | ❌ (inv 17)         |
| Manage subscription / billing                          | —                   | —                    | —                               | —                                  | ✅ (CONTEXT: Payer) |
| **Age gate**                                           | any age              | age-agnostic (inv 17) | adult (consent authority, §2.2) | any age (inv 14; CONTEXT: mentor)   | store-delegated; ≥18 only on a future non-store rail (inv 17, v1.1) |

**Rules (each cites its anchor):**

- Roles are **`{admin, learner}`** only; `mentor`/`guardian` are capacities on edges (inv 5, 6). The
  **first member of an Organization is `admin`** (inv 5).
- **`learner` is opt-in, never auto-mandatory** (inv 5 "not mandatory"; CONTEXT: learner "not
  auto-assigned, chosen at onboarding"). `[DERIVED: a Person may hold a Membership whose role set is {admin} with no learner — e.g. an adult who only operates a family — directly from "learner not mandatory" + "first member is admin".]`
- **Self-ownership is intrinsic, not granted (inv 7).** `learner` activates the learning surface and
  marks participation; it grants nothing beyond the ownership every Person already has.
- **Data access is edge-derived (inv 8); mentor visibility is edge-scoped to the named mentee (inv 9)** —
  never org-wide. An external tutor is edge-only (own org-of-one + cross-org Mentorship edge) and cannot
  see the family roster (§2.3).
- **Two supervisory layers** (§R two-layer model; CONTEXT: Guardianship, Mentorship): **Layer 1 —
  Guardianship** (consent authority; adult; withdrawable) and **Layer 2 — Mentorship** (granted
  visibility; any age). **Neither auto-implies the other** (inv 14); a mentor never holds consent
  authority (inv 14) and never needs to be a guardian.
- **Mentorship authority:** a Mentorship is granted by the **mentee if consent-capable, else by the
  guardian** (inv 15); guardian-granted mentorships must be **re-confirmed** by the learner on
  graduation, else they lapse (inv 16).
- **`admin` ≠ Payer:** `admin` is age-agnostic; **Payer capacity is store-delegated** (the store adjudicates
  for store-mediated payment; a flat ≥18 default applies only to a future non-store rail — inv 17, v1.1); the
  two are separate, neither implies the other.

---

## Part 4 — Consent & age behaviour  *(anchored — the most-exposed surface)*

### 4.1 — Age drives three independent things, on three scales  *(inv 10)*

There is **no `minor` boolean** (inv 10; CONTEXT: Consent "never a boolean"). Age drives **consent
capacity** (the jurisdiction's consent age, 13–16; inv 10) and **content level** (a continuous gradient,
theming only, **never a gate** — CONTEXT: Age Bracket; §3.3). **Payment capacity is *not* age-driven on the
store rail** — it is store-delegated (inv 17, v1.1); a flat 18 applies only to a future non-store rail where
we are merchant of record. Numeric cohort labels are **banished** (§8 CLEANUP-3): use *consent-gated*
(a charge), *consent-capable*, *adult*.

### 4.2 — Two complementary pieces  *(§3.2)*

- **`resolveConsentRequirement(age × residence_jurisdiction)`** — the **policy function**: what the law
  requires (§3.2; CONTEXT: AgeConsentDecision). `residence_jurisdiction` is a **time-versioned** Person
  attribute keyed off residence, not current location (§3.4; CONTEXT: residence_jurisdiction).
- **`AgeConsentDecision`** — the **resolved object** the app reads and never looks behind: requirement +
  whether satisfied + how proven + expiry/receipt; the single COPPA-portable seam (§3.2; CONTEXT:
  AgeConsentDecision). Field *shape* is locked (§3.2); enum *values* are pinned at Phase E.

### 4.3 — The behavioural rules (each an invariant)

- **Age-gate precedes collection (inv 26).** Signup captures an age-range first; **no profile or learning
  data is persisted until lawful basis exists** (`AgeConsentDecision` resolves to allowed). The age
  screen is the only permitted pre-basis collection.
- **Consent is recorded per purpose (inv 27),** never blanket — separate records for `{core, thirdPartyShare, targetedAds, aiTraining}` (§3.2; CONTEXT: Consent), required even when launch uses
  only `core`. A human mentor seeing a charge's data is **not** one of these purposes — it is a
  Mentorship edge + the REQ-1 disclosure (§3.2; §8 REQ-1).
- **Consent ≠ contract (inv 28).** Processing rests on **verifiable guardian consent**, never on the
  guardian being account-holder or Payer.
- **Worst-case default (inv 29).** The `jurisdiction × ageBand → policy` table ships **strictest** (16 /
  VPC-always) and is relaxed **per *verified* jurisdiction as config** — never country-by-country code.
- **Assurance is proportionate (inv 30).** Consent carries a method + an assurance level; the required
  level scales with age/risk — **self-declaration is not sufficient for young children** (CONTEXT: VPC).
- **Consent is computed, withdrawable, jurisdiction-relative (inv 10–12).** A record valid under
  jurisdiction A may not satisfy B, so a held consent does **not** auto-transfer when
  `residence_jurisdiction` changes (inv 12; §3.4).
- **Consent is evaluated over the *set* of Guardianship edges (inv 11)** — one parent with three children
  has three independent, independently-revocable records.
- **One central consent gate, not per-screen checks.** A data-processing request for a consent-gated
  Person with no valid Consent throws a typed error (inv 11; repo: typed-error-hierarchy / UX-resilience)
  — never a crash, never a blank wall. `[DERIVED: "central, typed" from inv 11 (the rule must be enforced somewhere uniform) + the repo's typed-error and "classify at the API boundary" rules.]`

### 4.4 — Verifiable parental consent for a charge

Email-plus is **insufficient VPC** once a charge's data is disclosed to third parties (LLM providers)
(CONTEXT: VPC; §3.2 third-party purposes). Behaviour: **buy, don't build** — platform parental-consent
where live, a VPC vendor elsewhere, outcome mirrored into the Consent record (§6 deferred; CONTEXT: VPC).
The vendor choice and the under-13 VPC method are **open** (Part 10, `[ANCHORED-OPEN]`).

---

## Part 5 — Independence & visibility  *(anchored)*

A Person **owns their account at every age**; managed vs credentialed is *login mechanics*, not ownership
(§3.1; CONTEXT: Person). The autonomy ceiling, stated as **tiers** (the thresholds are the jurisdiction's
consent age and a flat 18 — not numeric cohorts, §8 CLEANUP-3):


| Tier                                      | Owns own data | Self-consent                              | Self-pay (Payer) | Overlay                                                                                                                                                        |
| ------------------------------------------- | --------------- | ------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Consent-gated** (a charge)              | ✅ (inv 7)    | ❌ guardian consent required (inv 10–11) | ❌ never reaches self-pay — can't self-serve (R2) | guardian consent (Layer 1) + an adult Payer; guardian never operates the learning`[DERIVED: inv 23 separates consent-authority from operate; CONTEXT: charge]` |
| **Consent-capable** (≥ consent age, <18) | ✅ (inv 7)    | ✅ where law permits (inv 10)             | ✅ where the store permits (inv 17, v1.1) | self-pays via their own store account where allowed, else an adult Payer is attached (R11); consent only where required                                         |
| **Adult** (≥18)                          | ✅ (inv 7)    | ✅                                        | ✅ store-mediated (inv 17) | none required                                                                                                                                                  |

**The wallet does not buy oversight (inv 19).** A parent who pays for a consent-capable learner gains
**no** visibility into their learning without the learner's opt-in; above the consent age the learner is
the data subject and controls their data (inv 19).

**Self-pay is store-delegated (inv 17, v1.1).** Capacity for store-mediated payment is adjudicated by the
store (merchant of record), not by us — a consent-capable minor self-pays where their store account allows;
a flat ≥18 default applies only to a future non-store rail. Orthogonal to consent (inv 22), so it does not
touch the consent floor. *(Whether to surface under-18 self-pay in the UX is a product call — Part 10, P-axis.)*

*(Login-mode defaults per tier — e.g. "credentialed by default above the consent age" — are a UX choice
Doc 2 asserted but the canon does not fix; see Part 10.)*

---

## Part 6 — Lifecycle & transition safety  *(anchored)*

Non-negotiable safety properties binding every flow:

- **Graduation preserves identity (inv 20).** Managed → credentialed keeps the same `person_id` + all
  history. Break test: row count and `person_id` identical before/after.
- **No orphans (inv 21).** Edge deletion (guardianship / mentorship / membership) never cascade-deletes
  the Person or their history — a managed Person (charge *or* the rare managed adult, §8 FLAG-3) is never
  orphaned.
- **Time-triggered transitions are scheduler-driven (inv 24).** Consent-age / 18 crossings and
  `residence_jurisdiction` re-evaluation fire with **no user action** — a dormant account still
  transitions on its birthday — so they cannot live only in request handlers; a durable scheduler
  re-evaluates each Person on the relevant dates. `[DERIVED requirement: a background scheduler must exist — directly from inv 24; this is also the repo end-to-end-tracing rule: "verify something actually dispatches the event."]`
- **Transitions are append-only + audited; every interim state is a *named valid state* (inv 25)** —
  consent-pending, graduation-pre-org-choice, suspended-pending-fresh-consent — never an implicit gap.
  Each carries a Failure-Modes table (repo: UX-resilience, no dead-ends).

---

## Part 7 — Required transitions & flows  *(anchored as requirements, not as authored journeys)*

The invariants **force these flows to exist**. This part states each as a *requirement with its anchor*.
The detailed walk-throughs (screens, copy, and the per-state Failure-Modes tables the repo requires) are
Doc-2 material and are authored/ratified in **Part 10**, not asserted here.

- **R1 — Self-serve signup exists for consent-capable Persons and up.** Resolves age first (inv 26),
  auto-creates an org-of-one with the Person as `admin` (inv 1, 5), and lets them **elect** `learner`
  and/or a mentor capacity (inv 5 not-mandatory). A consent-gated Person cannot self-serve `[DERIVED: inv 13 "guardian-created only below the floor"]`.
- **R2 — Guardian-creates-charge is the only path below the consent floor (inv 13).** Produces a charge
  Person + `learner` membership + Guardianship edge + per-purpose Consent (inv 11, 27) at a proportionate
  assurance level (inv 30; VPC, §4.4).
- **R3 — A consent holding state exists** as a named valid interim state with no dead-end (inv 25, 26;
  repo: UX-resilience) and unlocks the moment valid Consent lands (inv 11).
- **R4 — Graduation (managed → credentialed) exists and preserves identity (inv 20);** on crossing the
  consent age it converts guardian visibility to learner-opt-in (inv 19) and lapses unconfirmed
  guardian-granted mentorships (inv 16).
- **R5 — Self-service consent withdrawal exists and actually stops processing (inv 12)** — the UI promise
  and system behaviour must match (inv 12; repo: silent-recovery-banned for the escalation path).
- **R6 — Leaving / removal preserves the Person and history (inv 21);** edges detach, the Person is
  retained and re-claimable.
- **R7 — Per-Person export exists** for a Person or their guardian `[DERIVED: inv 2 person-scoping + inv 21 retention make a per-Person (not per-org) export the only consistent shape]`.
- **R8 — Mentorship grant exists, edge-scoped (inv 9), authorized per inv 15, re-confirmed per inv 16.**
- **R9 — Threshold-crossing re-evaluation exists, scheduler-driven (inv 24);** the *mechanism* is ruled
  **per-dimension** (E1) — visibility→opt-in (inv 19), mentorships lapse-unless-reconfirmed (inv 16),
  explicit consent self-takeover (inv 20); the takeover-prompt UX is P-pending.
- **R10 — `residence_jurisdiction`-change re-evaluation exists (inv 12, 24; §3.4);** the *response* is ruled
  **suspend-into-R3 + re-prompt-as-exit** (E2); grace-window / suspended-state feel / detection are P/legal.
- **R11 — Payment capacity is store-delegated (inv 17, v1.1).** For store-mediated payment the store
  (merchant of record) adjudicates capacity; we impose no age gate. A consent-capable minor may self-pay
  where their store account permits, else an adult Payer is attached. *(A charge never reaches this flow —
  can't self-serve, R2.)* Which Person the store-completed purchase records as Payer under Family Sharing is
  open — **E3** (Part 10). A flat ≥18 gate returns only on a future non-store rail.
- **R12 — Visibility opt-in exists and is learner-controlled (inv 19).**
- **R13 — Guardian attachment to an *existing* Person exists.** A Guardianship edge + per-purpose Consent can
  be attached to an already-existing self-registered Person who has transitioned into needing consent (e.g. a
  `residence_jurisdiction` change re-engages the gate, inv 12/24); they sit in the R3 holding state until it
  resolves. Distinct from R2, which *creates* a new managed charge. `[DERIVED: inv 12 + 24 + 11 + 25 + R1]`
  The *initiation* flow (minor-invites-guardian vs guardian-claims) and **guardian-authority verification**
  (VPC/REQ-2) are open — Part 10 (E11 P-tail, E13).

---

## Part 8 — Definition of "done"  *(anchored)*

Done = **the 30 ontology invariants hold true under test**, each with a happy-path **and** a break test
written in the security-fix red-green pattern (§4 framing; repo: security-fix break-test). The legacy
36-gap audit is a **regression checklist**, not the definition.

**Named break-tests beyond the 30** (derivable consequences elevated to *mandatory tests* because they
guard a real observed defect — ruled in Part 10 §F1, `[T✓ 2026-06-02 · P pending]`):

- **F1-BT-a — no self-consent.** A consent-gated Person with **no Guardianship edge** can neither have
  data processed **nor** be recorded as their own consent authority. Derives from §2.2 (dyadic, adult
  guardian) + inv 11 (consent over guardian edges) + inv 28. **Red-green against the live
  `getFamilyOwnerProfileId` self-fallback bug** (drift-map §7A): write the negative-path test → passes →
  revert the guard → fails → restore. `[T✓]`
- **F1-BT-b — no consent dead-end.** A wrong/missing birth year routes to an **in-product correction
  path**, never a dead-end. Requirement derives from inv 25 + repo UX-resilience; the **correction-flow
  design is `[P pending]`**.

Carried open requirements that gate a *paid launch* but are not ours to close (ontology §8): **REQ-1**
consent-scope disclosure (per-purpose), **REQ-2** the six-item legal register, **REQ-3** DPIA, **FLAG-2**
the real age floor. These are `[ANCHORED-OPEN]` (Part 10).

---

## Part 9 — Crosswalk: new model ↔ today's code  *(anchored to §7 + CONTEXT legacy terms)*

The clean cut lands in a codebase speaking the legacy vocabulary. The map (ontology §7; CONTEXT ✗/⚠
entries):


| New-model concept                           | Today's code                                                           | Crosswalk note                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Person                                      | `profiles` (§7)                                                       | rename surface; fused to a login today                                                                 |
| Login                                       | `accounts.clerk_user_id` / `profiles.clerk_user_id` (§7)              | decouple from Person                                                                                   |
| Organization                                | `accounts` (fused) → inert `organizations` (§7)                      | wire the inert table; keep thin                                                                        |
| Membership`{admin, learner}`                | `family_links` + `isOwner` (live) → inert `memberships.roles[]` (§7) | live authz is the`isOwner` bool                                                                        |
| The dissolved`owner`                        | `isOwner` boolean (CONTEXT: Owner ✗)                                  | **splits three ways** — admin / Payer / Guardianship; re-point each `isOwner` site at the correct one |
| Guardian act-for                            | proxy mode /`isParentProxy` (CONTEXT: Parent Proxy ⚠)                 | candidate mechanism for guardian act-for; keep/retire decision pending                                 |
| Consent gate on the edge                    | `consentStatus` + `consentMiddleware` (§7)                            | keep central middleware; move the key from profile to the Guardianship edge                            |
| `mentor` capacity (edge-scoped)             | `membershipRoleEnum 'mentor'` backfilled, **unwired** (§7)            | wire it for the first time —**as a capacity on a Mentorship edge, not a role**                        |
| `AgeConsentDecision` + per-jurisdiction age | flat`age<=16`, `MINIMUM_AGE=11` (§7)                                  | replace with`resolveConsentRequirement` + worst-case table                                             |
| Payer (store-delegated; ≥18 only on a future non-store rail — v1.1) | implicit account holder (§7)                                          | make explicit; capacity adjudicated by the store as merchant of record; reconcile recorded-Payer identity (E3) |

**Two-vocabulary risk (§R, audience-matrix):** until the crosswalk is executed, `resolveNavigationContract`
(new) and `resolveTabShape`/`isOwner` (old) describe the same humans incompatibly. The clean cut should
land `resolveNavigationContract` consuming the new role set, with the audience-matrix F-sites as the
checklist — not leave both alive.

---

## Part 10 — Decision Queue  *(the residue — Doc-2 material that the canon does not anchor)*

Everything Doc 2 asserted that did **not** earn a place in the body above. We process this list together:
for each `[NEEDS-DECISION]`, you rule — **ratify** (it moves into the body with the ruling as its
anchor), **keep as `[PROPOSED]`** (stays flagged), or **drop**. `[DERIVABLE]` items I expect to anchor on
inspection (you sanity-check the chain). `[ANCHORED-OPEN]` items are already tracked open in the ontology
— listed so nothing is lost, but not for us to decide now.

### Sign-off model  *(dual-axis — added 2026-06-02)*

Two reviewers with split authority sign each ruling **independently**:

- **`T` — Architecture sign-off** (technical reviewer): the derivation is correct, internally
  consistent, and the foundation accommodates it **under the currently-scoped persona/journey set**.
- **`P` — Product sign-off** (PM): the item is functionally **complete and final** for scope.

Per-item marker: **`[T✓ YYYY-MM-DD · P pending]`**. An item is *settled into the body* only when every
**applicable** axis is ✓.

| Item type | Axes that apply |
|---|---|
| Architecture / data-model / invariant-derivation | **T** only (`P n/a`) |
| Personas, journeys, failure-mode recoveries, UX defaults, audience framing | **T + P** |
| Process / methodology calls | **T** only; the artifacts they *produce* inherit **T + P** |
| Legal / compliance | neither — stays `[ANCHORED-OPEN]`, outside T/P |

**Ripple rule.** `T✓` certifies feasibility *for the current scope*. If the PM pass **adds** a persona,
journey, or edge case, any `T✓` item whose foundation that change touches **reverts to `T pending`** for
re-confirmation. Product enrichment can reopen architecture — by design, and visibly.

### A — Personas  *(only UC-1 is anchored, via §9)*

- **A0 — Managed-adult / "grandparent" persona.** `[ANCHORED: §9 UC-1]` — already canon; will be written
  into Part 2/Part 5 as the one ratified persona.
- **A1 — Solo adult learner.** `[DERIVABLE: adult tier (inv 10,17) + {learner} (inv 5)]`
- **A2 — Independent consent-capable minor.** `[DERIVABLE: consent-capable tier (inv 10) + inv 19 opt-in]`
- **A3 — Charge (guardian-managed).** `[DERIVABLE: inv 13 + Guardianship (§2.2) + CONTEXT: charge]`
- **A4 — Family operator (admin + guardian×N + Payer, optionally learner).** `[DERIVABLE for the shape; NEEDS-DECISION for the surface]` — the multi-role *surface* (fused vs split) is E6 below.
- **A5 — Mentor / tutor (any age, edge-only).** `[DERIVABLE: §2.3 + inv 9, 14]`
- **Decision for A1–A5:** confirm we adopt these five as *derived* personas (anchored, not Doc-2-trusted),
  with copy to be written. Likely a single yes; flagged because Doc 2 was the source of their framing.
- **Sign-off:** `[T✓ 2026-06-02 · P pending]` — A0–A5 adopted as the persona set; A4's multi-role
  *surface* deferred to **E6**. Tech-ratified (derivations hold, foundation accommodates the set as
  scoped); the PM pass owes functional completeness.

### B — Journeys & failure-mode tables  *(Doc 2 J1–J14 detail)*

The *requirements* R1–R12 (Part 7) are anchored; the **walk-throughs** (specific steps, screens, copy,
and the per-state Failure-Modes tables the repo requires) are Doc-2 detail. `[NEEDS-DECISION / NEEDS-AUTHORING]`: do we (i) author them here now as `[DERIVED]` walk-throughs of R1–R12 with fresh
Failure-Modes tables, or (ii) defer the walk-throughs to the spec/plan layer and keep the PRD at the
requirement altitude? *(My lean: author the Failure-Modes tables here — the repo rule wants failure modes
specced before coding — but treat each non-invariant recovery as `[PROPOSED]`.)*
- **Ruling:** author the Failure-Modes tables here as `[DERIVED]` walk-throughs of R1–R12; each
  non-invariant recovery tagged `[PROPOSED]`. **Sign-off:** `[T✓ 2026-06-02 · P n/a]` (process call);
  the authored tables themselves inherit **T + P**.

### C — Vision & audience framing  *(Doc 2 Parts I–II)*

- **C1 — "Consumer-first; B2B not near-term but not foreclosed."** `[DERIVABLE: §6 keeps the org table a dormant B2B seam; inv 2/8/18 keep person-scoping]` — confirm as framing. `[T✓ 2026-06-02 · P pending]`
- **C2 — Homework-helper framing. RULED 2026-06-02 `[P✓]` — a GTM/ads way-in, NOT the product headline or an audience cap.**
  "Homework helper" / "end homework fights" lives in **acquisition (ads)** as the wedge hook; it is **not** the
  in-product headline and does **not** cap the audience to school-age homework. Concrete product consequence ruled:
  the in-app welcome keeps **both doors ("Learn with a mentor" + "End homework fights") always shown to everyone**
  (kept simple — no per-ad-source entry tailoring); a self-learner who sees the homework door just picks the other.
  Positioning call; **no structural change.**
- **C3 — Audience statement. RULED 2026-06-02 `[P✓]` — "serious learners (and the mentors who support them) of any age."**
  **Two customers — learner and mentor — both any age** (maps to the two welcome doors). **Long-term north star =
  learners** (who the product ultimately optimizes for). **Near-term wedge = parents/mentors**: onboarding leans on
  them, betting they pick up learning themselves *and* promote the app (a referral flywheel). One asterisk on
  "any age": the **helper/mentor** can be any age, but the narrower **consent-giver (legal parental consent
  signature) must be an adult** — a legal floor, not an audience cap. Positioning call; **no structural change.**

### D — UX defaults Doc 2 asserted that the canon does not fix

- **D1 — Login-mode default per tier. RULED 2026-06-02 `[P✓ · T✓ 2026-06-03 → §H Ripple 1: invite-flow]`.** **Self-signup → the
  person gets their own login (credentialed), no age-based steering** (today's de-facto behaviour, confirmed as
  intended; the consent gate still catches under-age self-signups). **Extension (PM-raised hole):** the
  **parent-adds-child** path today **forces managed** (child has no own login) with no option for a child who
  has their own device — this **must be resolved** by **asking the parent at add-child time: "will this child
  use their own device/account, or yours?"** → own device = a **credentialed charge** (own login *and* still
  consent-gated); parent's device = a **managed charge** (today's behaviour). **On-model:** §3.1 + inv 4 already
  allow a credentialed charge (login-presence ⊥ consent-requirement). The **consent-giver is unchanged** — the
  parent consents either way (no safety regression). **RIPPLE → architect:** the *mechanism* for provisioning a
  child's own login (invite-flow where the child completes their own login vs. parent-creates-credential) is a
  feasibility call, maps to the deferred **§6 "entry-point asymmetry / self-registered-minor"** item, and is
  **net-new / T2+ unbuilt** work. T-axis pends the architect's mechanism confirmation. *(Prior: `[NEEDS-DECISION]`.)*
- **D2 — Consent holding-state preview** (browse-only, no LLM). **RULED 2026-06-02 `[P✓]` — lock as-built.**
  Keep the live `ConsentPendingGate` "While you wait…" preview (Browse Subjects + Sample Mentoring — **static,
  no-AI, no-collection, no network**); the real AI stays hard-blocked at app *and* server (403). **Recorded
  constraint:** it **must remain no-AI / no-collection** — that is the only reason it is lawful pre-consent.
  **Grounding:** AI use by a consent-gated minor *requires* guardian consent — COPPA (the LLM call is a
  third-party disclosure → VPC, §4.4) + GDPR Art 8 (parental authorization to process a below-digital-consent-age
  child's data). The precise "what counts as no-collection" boundary is a counsel item (REQ-2). **No structural
  change.** *(Prior: `[NEEDS-DECISION]`.)*
- **D3 — Withdrawal grace window length; resend/"change recipient" caps; notify-parent cooldown. RULED 2026-06-02
  `[P✓ — reasonable defaults]`.** Keep the **already-built caps**: **3 resends + 3 recipient-email changes + 7-day
  link** (`consent.ts` `MAX_CONSENT_RESENDS` / `MAX_RECIPIENT_CHANGES`). **Add a short cooldown (~30–60s) between
  resend taps** (cheap — stops a child spamming the parent); **no** elaborate server-side timed cooldown (the count
  caps already bound total emails). **Withdrawal grace window stays the existing 7 days.** No structural change.
  *(Prior: `[NEEDS-DECISION]`.)*
- **D4 — Stricter-wins reconciliation of self-declared vs platform Age-Signal.** `[DERIVABLE: inv 29 worst-case-default generalises to "take the stricter signal"]` — confirm. `[T✓ 2026-06-02 · P n/a]`

### E — Product calls the model deliberately leaves open  *(Doc 2 Part IX + ontology §6)*

- **E0 — Payer capacity (store-delegated). RULED 2026-06-02 `[T✓ · P✓]` — ontology v1.1 amendment**
  (inv 17/10, §2.4, §3.2; MMT-ADR-0002; CONTEXT Payer+minor). For store-mediated payment (the only channel for
  the foreseeable future) capacity is **delegated to the store as merchant of record**; we impose no age gate.
  A flat ≥18 worst-case default (inv 29) applies **only** to a future non-store rail — **not** a per-jurisdiction
  derivation. **Under-18 exposure (P-axis) RULED 2026-06-02 `[P✓]` — E0-a: keep store-delegated, no product block.**
  A self-signed-up under-18 *owner* continues to see "Upgrade" and the store (Ask-to-Buy / payment method) is the
  sole gatekeeper; a managed child on a parent's account continues to see **"Notify Parent"** (no Upgrade). Matches
  built behaviour; **no structural change.** **Carried open:** **E3** (recorded-Payer identity under Family
  Sharing — now the active sub-question); FLAG-2 / REQ-2 (launch gates).
- **E1 — Threshold-crossing mechanism. RULED 2026-06-02 `[T✓ envelope · P pending]` — per-dimension, not monolithic** (inv 22). At a consent-age / 18 crossing: **guardian visibility → learner opt-in, default off** (inv 19 — *not* status-quo, which Doc-2 wrongly proposed); **guardian-granted mentorships lapse unless re-confirmed** (inv 16); **account-control / consent self-takeover is explicit, status-quo-until-taken** (inv 20); the scheduler fires the re-eval regardless (inv 24).
  **Visibility-tail (Round 4) RULED 2026-06-02 `[P✓ within inv-19]`:** at the consent-age crossing, **prompt the teen**
  to keep-or-turn-off the parent's view as an **affirmative opt-in** ("you control this now — keep sharing with your
  parent, or turn it off?"), then **notify the parent** of the outcome; **the parent may ask to keep/regain access and
  the teen decides** (grant/decline). **Fallback if the teen-prompt is too costly to build: visibility goes OFF
  automatically — never ON.** Auto-keeping a parent's view on *without* the teen's opt-in would violate inv 19. **PM expectation
  (corrected 2026-06-02): ~99% of teens will choose NOT to share with their parents** — so **default-off already
  matches the common case**, making the birthday teen-prompt *optional polish* rather than load-bearing: **auto-off
  gives ~99% the outcome they'd pick anyway.** The teen-prompt + the **reshare / ask-to-keep** path serve the **~1%**
  who do want to keep a parent in the loop (parent asks → teen agrees). Lowest-cost build = auto-off + reshare button;
  the explicit birthday prompt is a nicety. **Account-control takeover (Round 6) RULED 2026-06-02 `[P✓]` — prompt, not automatic.** On the
  consent-age crossing the system does **not** auto-seize/auto-hand control; it **invites the now-capable teen to
  take over and make it their own account** ("you're old enough to take this over — ready?"), and everything stays
  **status-quo until they accept** (inv 20). Ties to the same **child-own-login provisioning mechanism** already
  flagged to the architect (D1 ripple) — taking over requires the teen to set up their own login, so it can't be
  silent anyway. **Reminder cadence:** gentle/occasional, never nagging (PM-default). No new structural change
  beyond the D1 provisioning ripple.
- **E2 — `residence_jurisdiction`-change response. RULED 2026-06-02 `[T✓ envelope · P pending]` — suspend *and* re-prompt** (not either/or). If the new jurisdiction's standard isn't satisfied and the Person is now consent-gated, processing **suspends into the R3 holding state** (inv 11/12/25), scheduler-detected (inv 24); **re-prompt is the exit** (for a guardian-less self-registered minor, via R13). Only bites those crossing *into* needing guardian consent (adults unaffected; still-consent-capable self-re-confirm). **Suspended-state feel RULED 2026-06-02 `[P✓]` — reuse the browse-only preview (D2), not a cold lock.** While the
  AI is paused after a move into a stricter jurisdiction, the person sees the **same no-AI "while you wait" preview**
  already built (Browse Subjects, no AI, no collection) **plus a clear explainer** ("the rules changed where you now
  live — here's what's needed and how to fix it"). Avoids dropping a happily-learning user into a dead-end. **Push
  cadence default:** gentle but persistent until resolved. **Detection RULED 2026-06-02 `[P✓]` — declared residence + conditional soft nudge.** Residence is a
  **declared** setting the user/parent controls (source of truth) — we do **not** gate on current location, so a
  **holiday or VPN never re-gates** (the §3.4 trip/VPN trap is avoided by design). A **soft nudge** ("looks like
  you've moved — update your home country?") fires **only when** signals suggest a *sustained* change **AND** the new
  jurisdiction would **actually change this person's consent requirement** (suppress the nudge when the move is a
  no-op — e.g. an adult, or a move between two equal-threshold countries). **Never auto-pause off a signal alone** —
  only the person confirming the new residence changes anything. **Still open P/legal:** grace-window length → counsel.
- **E3 — Store-payer ↔ recorded-Payer mapping under family sharing.** `[ANCHORED-OPEN: §6 multi-org / Doc 2 J13]` — **now the active Payer sub-question after E0** (capacity is settled; *which Person* a store-completed purchase records as Payer under Family Sharing / Ask-to-Buy is not). → Phase D/E.
- **E4 — Co-guardian consent precedence** (the one-of/all-of rule). `[ANCHORED-OPEN: inv 11 "rule is jurisdictional/legal — deferred §6"]` — likely defers to counsel; we can set a default.
- **E5 — Last-guardian departure / charge custody. 2026-06-02 `[P-lean · T✓ 2026-06-03 → §H Ripple 2; inv 21 amended]`.**
  Replace today's **silent cascade-delete** of the child (children live in the parent's account → account deletion
  wipes them, the live inv-21 violation) with an **explicit choice presented to the departing consenting parent at
  account deletion**: (i) **export/download** the child's data; (ii) **attach another consenting adult** — *offered,
  not forced* (PM reluctant to build the full re-home flow; = R13 guardian-attachment-to-existing / E11); (iii)
  **delete** the child's data. Rationale: for a genuine *charge* (below consent age) the managing parent is the
  responsible decider. **PM also leans to soften the "nothing is ever lost" promise → honest promise + disclaimer**
  rather than build guaranteed safe-holding/re-homing.
  **RIPPLES → architect (not absorbed):**
  1. Does a parent-*initiated, explicit* delete (with export offered) reconcile with **inv 21** ("a managed Person
     is never orphaned; learning history never cascade-deleted"), or must inv 21 be amended? *(Facilitator read: an
     explicit chosen delete ≠ the silent orphan inv 21 forbids, so likely compatible — architect rules.)*
  2. **Residual gap → RESOLVED by PM 2026-06-02 via a cross-cutting inactivity-expiry policy.** The
     active-deletion prompt doesn't cover **abandonment / death / store-side deletion**; PM closes this with a
     **general dormancy-deletion policy applied to ALL accounts** ("no activity for ~365 days → cleaned up", number
     illustrative). Subsumes the abandoned-child case. **Architect:** requires the **durable scheduler** (inv 24,
     not built today) — *shared* with Round-6 birthday/age re-checks (E1/E2) — plus a **warn + export window before
     deletion** (inv 25 no-dead-end; data-subject rights). **COUNSEL (REQ-2, new sub-item):** legality leans
     favorable (GDPR Art 5(1)(e) storage-limitation *encourages* not over-retaining), but counsel must fix: the
     exact dormancy period; the mandatory pre-deletion notice + grace/export; children's-data handling; and
     **carve-outs for legally-mandated retention** (billing/tax/transaction records outliving learning data).
  3. **managed ≠ consent-gated** (§3.1) — **CONFIRMED by PM 2026-06-02.** A managed but *consent-capable* person
     owns their own data (inv 7/19) — the parent must **not** delete *their* learning. The "parent decides"
     export/delete path is **scoped to genuine under-consent-age charges only**; a capable managed person's
     export/delete routes to **themselves**.
  **Legal:** child's erasure right + the parent's authority to exercise it for a charge = counsel (REQ-2).
  *(Prior: `[ANCHORED-OPEN: §6]` — Doc-2 rec: retain + re-homable.)*
- **E6 — Unified vs split multi-role surface** for the family operator. **RULED 2026-06-02 `[P✓ · T✓-by-existing-build]` — split spaces, purpose-led landing.** The multi-role person sees **separate spaces** (a family/mentoring space and a "my own learning" space) with a runtime Study/Family switch — *as already built*. Landing is led by the explicit **"What brings you here?"** purpose choice at signup (persisted as the default space). The mentoring home is the landing only once a child is linked; a **family-door picker with no child yet lands on a focused "add your first child" setup screen** — planned (mode-nav plan HIGH-1: "no silent fall-through to Study") but **currently stranded / unbuilt** (`onboarding/intent.tsx` + `family-setup-empty` testID absent from the codebase; **PM to log as a missing feature in Notion**). That setup step is **not a hard gate** — skipping it (no child added) falls through to the Study/learner home (honours never-force-add-child). Pure presentation/landing over the person's several jobs (run / pay / parent / learner); **no structural change, no ripple.** Must still serve an **admin-only** operator (learner-optional). *(Prior: `[ANCHORED-OPEN: §6 / Doc 2 J-Family-Operator]`.)*
- **E7 — Multi-org governance** (whose quota/consent/visibility across two orgs). `[ANCHORED-OPEN: §6 → Phase D]`
- **E8 — Separated parents (one Person vs two; shared custody). RULED 2026-06-02 `[T✓ reachability · P+legal pending]` — keep possible, decide v1 scope later.** The one-Person model is **not foreclosed** (Person≠Login + global consent edge + multi-org Membership); only regressing to the fused/account-bound shape would foreclose it, and the clean cut forbids that. Whether v1 *builds* shared-custody / one-vs-two-Persons is a **product + legal** call → PM (coordinating counsel).
- **E9 — Guardianship capability placement D1 (operate/manage/view global vs org-scoped).** `[ANCHORED-OPEN: §6]`
- **E10 — De-credential (credentialed → managed reversion, T6). RULED 2026-06-02 `[T✓ · P n/a]` — disallow; no app flow.** Graduation is one-directional (inv 20); the reverse is an autonomy/privacy regression, and the one plausible case (a parent reverting a teen) is already blocked by inv 19. **Not a built product capability — no self-service, no UI.** If a genuine edge case ever arises (data repair, mistaken account, legal/ops request) it is a **manual, audited backend/ops intervention** that still honors canon — it may **not** strip a consent-capable learner's data control (inv 19) or orphan a Person (inv 21), and is append-only + audited (inv 25). Reopens only if product surfaces a real user-facing use case (ripple).
- **E11 — Self-registered-minor consent path** (minor self-registers with own Login, no guardian yet).
  **RULED 2026-06-02 `[T✓ · P pending]`.** Cases 1–2 covered (consent-capable self-consents — R1 + inv 10/11;
  below-floor self-registration blocked + routed to R2 — inv 13/26, the redirect being F1-BT-b). Case 3 (a
  self-registered minor who *transitions into* needing consent via a jurisdiction change, inv 12/24) lands in
  the R3 holding state but needs a guardian attached → **new requirement R13** (guardian-attachment-to-existing).
  Initiation flow + guardian-authority verification are P-pending. The two cross-org variants below are E12/E13.
- **E12 — Two-existing-Persons consolidation** (minor self-registered *and* parent already registered → two
  Persons, two org-of-one). **APPROACH AGREED 2026-06-02 `[T✓ shape · P flow → E7/Phase D]`.** Shape: the minor
  **applies to *join*** the parent's org (UX = "join", not "merge"); under the hood = **home-org reassignment +
  decommission the minor's now-empty org-of-one**. Constraints: (a) **the parent's resulting edge is conditional
  on consent status** — **Guardianship** (Layer 1, R13 + VPC) **only if consent-gated**; for a **consent-capable**
  minor the parent is **admin + Payer + *optional* Mentorship the minor grants** (inv 19 opt-in), **never
  auto-Guardianship** (inv 14/19 — they self-consent); (b) **sequence to never orphan** — add the Membership
  *before* decommissioning, named "migration-pending" interim state (inv 21, 25); (c) **reconcile the minor's
  subscription** if any (minors can self-pay, v1.1) — cancel or fold into the parent-org seat (inv 18). The flow
  is home-org reassignment = **E7 multi-org governance → Phase D** + PM (UX).
  **P 2026-06-02 — REVISED (PM): a minimal "join my family" MUST work in v1.** *(Initial lean was to defer all
  consolidation to Phase D; PM ruled the concrete journey must ship.)* A parent buys **Family**, **invites their
  existing-account, self-consenting teen**, the teen accepts → the teen **joins the parent's family org** (shares the
  **Family quota** seat); the parent becomes **admin + Payer**; and the **teen grants the parent a Mentorship**
  (opt-in — **no auto-Guardianship**, the teen self-consents, inv 14/19). The teen's **person + learning history are
  preserved** (inv 20/21); the teen's existing subscription, if any, is reconciled (inv 18). **Rationale:** deferring
  leaves no clean path — the only workaround (re-create the teen as a fresh child profile) **destroys their history**,
  the exact dead-end the foundation forbids.
  **RIPPLE → architect (T-axis reverts to pending per the Part-10 ripple rule) — RESOLVED 2026-06-03 `[T✓ → §H Ripple 3]`:** elevating E12 from Phase-D-deferred
  to **v1-required** reopens feasibility. Architect to scope the **cheapest honest v1 version** — membership +
  billing/quota reconciliation + home-org handling — honoring never-orphan (inv 21) and a named **migration-pending**
  interim state (inv 25); interacts with **E7 multi-org governance**. **Scope note:** the *below-consent-age* teen
  variant (needs guardianship + VPC via R13) may stay deferred; **v1 covers the consent-capable-teen join**, and
  **parent-initiated invite is the v1 path** (child-initiated request-to-join, E13, may stay deferred).
- **E13 — Reverse / minor-initiated invitation. RULED 2026-06-02 `[T✓ ban · P join-flow]`.** **Ban
  minor-initiated *Guardianship* (consent authority)** — a minor may not nominate their own consent authority
  (the F1-BT-a attack surface; fails inv 30 assurance + inv 28). **Ban the *grant*, not the *request*:** the
  legitimate "minor reaches out first" path is a **request to join** the parent's org, which **folds into E12** —
  the minor *requests*, the **adult accepts + provides verifiable consent (VPC)**; authority always flows
  adult-side (mirrors inv 15/16). Scope: the ban is specific to the **consent / Guardianship edge**;
  minor-initiated **Payer / admin** invites are access-inert / org-management (inv 8, 17), not the same risk,
  but in practice route through the E12 join-flow too. Verification tail = REQ-2 / VPC (counsel).
  **P 2026-06-02:** the **ban on minor-initiated Guardianship is kept** (free safety — a "don't-build-the-dangerous-thing"
  rule, not a feature). **Parent-initiated** join is now **v1** (see E12 revision). The **child/minor-initiated**
  request-to-join may **stay deferred to Phase D** (parent-initiated is the v1 path); v1 also retains the existing
  **child-enters-parent-email** consent step (which is *not* a family "join").

### F — A proposed additional invariant Doc 2 carried that the 30 do not state

- **F1 — "No self-consent, and no consent dead-end." RULED 2026-06-02 `[T✓ · P pending]` — keep `[DERIVED]`, NOT a 31st invariant.** Both halves trace to existing canon (self-fallback contradicts §2.2 dyadic+adult
  guardian + inv 11 + inv 28; no-dead-end is inv 25 + UX-resilience), so elevating them would violate the
  "30 independent invariants" integrity. Instead they become **mandatory named break-tests in Part 8**:
  **F1-BT-a** (no self-fallback; red-green against the live `getFamilyOwnerProfileId` bug, drift-map §7A)
  `[T✓]`, and **F1-BT-b** (no birth-year dead-end; correction-flow design **RULED 2026-06-02 `[P✓]`**: an **in-app
  self-service correction** removes the current dead-end; an edit that **does not cross the consent boundary** just
  **saves** (honest typo, e.g. adult→adult); an edit that **would cross the boundary** — flipping the person between
  "needs a parent" and "doesn't" — requires a **light verification step instead of instant trust**, so a real adult
  can get unstuck but a child cannot simply *type* their way past the consent gate. Verification method = counsel /
  age-assurance vendor, REQ-2.). **Not a canon
  amendment** — no ontology edit.

### G — Carried legal / compliance / sweep items  *(ontology §8 — already open, no decision now)*

**Ownership (per PM, 2026-06-02):** these are **PM-owned**, not a separate decider lane — the PM organizes
them *with* counsel. Two inline exceptions: **G6** is frontend/copy only; **G7** (vendor) is the **technical
reviewer's** procurement call, gated on clear legal requirements — not itself a legal topic.

- **G1 — REQ-1** consent-scope disclosure (per-purpose). `[ANCHORED-OPEN: §8 REQ-1]`
- **G2 — REQ-2** six-item legal register. `[ANCHORED-OPEN: §8 REQ-2]`
- **G3 — REQ-3** DPIA gates launch. `[ANCHORED-OPEN: §8 REQ-3]`
- **G4 — FLAG-2** the real age floor (per-jurisdiction + app-store rating; any-age charge lawful with VPC).
  `[ANCHORED-OPEN: §8 FLAG-2]`
- **G5 — CLEANUP-2** AI "mentor" → "Mate" copy sweep. `[ANCHORED-OPEN: §8 CLEANUP-2]`
- **G6 — CLEANUP-3** banish numeric cohort copy — **frontend / user-facing copy only** (backend number-*gates* are already banned by inv 10); gated on FLAG-2. `[ANCHORED-OPEN: §8 CLEANUP-3]`
- **G7 — VPC vendor selection** (KWS vs k-ID) + platform Age-Signals timing — **not a legal topic: the technical reviewer's procurement call, sequenced *after* the legal requirements are clear.** `[ANCHORED-OPEN: §6]`

### H — Phase-B closure: architect re-confirmation of the 4 ripples  *(2026-06-03)*

The four ripples the B-product pass reopened (decision log 2026-06-02) are re-confirmed by the architect.
All resolve to `T✓`; **Phase B's exit gate is met** and **D-ratify is unblocked** (it must carry these forward).
ADRs for the two net-new mechanisms (scheduler; family-join primitive) are **pending placement** — held for the
Phase-C doc-strategy call, content captured here.

- **Ripple 4 — durable scheduler (inv 24). `T✓`.** Feasible on the **existing Inngest rail with zero new
  infrastructure** — a new cron + per-Person fan-out function mirroring the production `daily-snapshot.ts`
  pattern (`cron` admin scan → batched `step.sendEvent` fan-out → bounded-concurrency receiver, idempotency-keyed
  on `personId + day`). Three consumers: birthday/age-cross (E1), residence re-eval (E2), inactivity-expiry (E5).
  *Cost note for E:* the birthday/age scan **cannot** filter to active-recently (a dormant account still
  transitions on its birthday, inv 24) → a daily date-predicated scan of all non-archived Persons, needing an
  index on `birth_date` / `last_activity`. *Deferred to D-body:* unified one-cron-all-transitions (recommended)
  vs. three separate crons.
- **Ripple 2 — E5 last-guardian. `T✓`.** (a) inv 21 **amended in canon** (clarifying, not a 31st invariant):
  an explicit, authority-held, audited guardian-initiated deletion of a genuine under-consent-age charge's data
  (export offered first) is a **distinct permitted operation, not the silent cascade inv 21 forbids** — see
  ontology inv 21 (edited 2026-06-03). (b) Abandonment fallback = the inactivity-expiry policy, **rides Ripple 4's
  scheduler** + a warn/export window (inv 25). (c) Delete-authority **follows consent-authority** — the same
  consent-gated-tier predicate (inv 10) scopes the parent-decides path to genuine under-age charges; a capable
  managed Person's export/delete routes to themselves (inv 7/19). Dormancy specifics → counsel (REQ-2), not
  B-gating.
- **Ripple 1 — child-own-login provisioning (D1 + E1-takeover). `T✓` → invite-flow.** The child completes their
  **own Clerk sign-up**; the existing JIT account provisioning (`middleware/account.ts` → `findOrCreateAccount`)
  auto-creates their account on first authenticated request — **not** `parent-creates-credential` (zero
  `clerkClient.users.create` usage in the repo; would add a new Clerk admin-write + a password-handoff smell).
  Decisive: the **E1 self-takeover** (managed→credentialed graduation, inv 20, same `person_id`) *requires* the
  teen to set up their own credential, so invite-flow is the **only** mechanism coherent across both D1 and E1.
  inv 4 holds — an under-age self-signup still hits the consent gate (→ R3 holding until VPC). **Net-new (T2+):**
  the "attach the self-provisioned account to the family graph against the existing `person_id` via a
  `migration-pending` interim" step (today's add-child creates a managed profile inline). **This is the shared
  primitive Ripple 3 reuses.**
- **Ripple 3 — E12 "join my family" v1. `T✓` (feasible *in the target model*).** v1 = Ripple 1's join primitive
  + (i) **home-org reassignment** (add the family Membership **before** decommissioning the teen's now-empty
  org-of-one, via `migration-pending`, inv 21/25 — the org-of-one is a container; the Person + history ride the
  `person_id`); (ii) teen-opt-in **Mentorship** grant (inv 14/19, no auto-Guardianship); (iii) **billing/quota
  reconciliation**. v1 **collapses to a single home org → deliberately sidesteps E7 multi-org governance**
  (the cheapest honest join is a *consolidation*, not a federation; true multi-org stays Phase-D). **Billing
  fork RULED `[P✓ 2026-06-03]` — option B (join-with-disclaimer):** the joining teen with an active store sub
  **joins immediately** (covered by family quota) and **keeps paying their own store sub until they self-cancel**
  (store-delegated billing rules out server-side refund/credit — `revenuecat.ts`), with an explicit
  double-charge warning + a follow-up nudge; chosen over block-until-cancel to avoid the cross-system dead-end
  the UX-resilience rules forbid. **New counsel sub-item (REQ-2):** minor double-billing disclosure + grace.
  Scope held: below-consent-age teen variant (guardianship + VPC via R13) and child-initiated request-to-join
  (E13) stay Phase-D-deferred; v1 = consent-capable teen, parent-initiated invite.

### I — Counsel-session legal register  *(REQ-2 walkthrough; counsel rules, outside T/P per §sign-off — 2026-06-03)*

Legal/compliance outcomes from the counsel walkthrough. Each carries a **`basis:`** citation. Tagged
**Rule** (binding answer we build to) / **Parameter** (a value/threshold) / **Monitor** (unsettled — draft/
guidance instrument + revisit trigger). These resolve / refine the **G1–G7** carried items above and feed the
DPIA (E5 → G3). Source links collected at the end of this section.

#### I-0 — Cross-cutting: the three-bucket model  *(RULED — raised before C1: "not every user is a child")*

**Question (PM):** does the worst-case-default ("ship the strictest rule, relax per verified jurisdiction")
cover us on all fronts, given the app serves solo adults, teens, *and* guardian-managed children — not only
under-13s?

**Rule (cross-cutting — the spine of the worst-case-default architecture).** Strictest-of-three is *not* a
universal solvent. Split the under-13 ruleset into three buckets and treat each differently:

- **Bucket 1 — protective ceilings → raise for everyone (the universal baseline).** Data minimisation, purpose
  limitation, retention discipline (written policy, no indefinite holding), security program, high-privacy
  defaults, no targeted ads / no data sale, transparency-by-design, DPIA. Nothing penalises applying these to
  adults. **This is the front the strictest-child instinct covers correctly — ship it as the universal floor.**
- **Bucket 2 — banded mechanics → compute per band, NEVER universalise.** Five items, not just consent:
  **(1) consent / lawful basis** (VPC band-A → self-consent band-C → contract band-D); **(2) age-assurance
  level** — *universalising the strictest here is itself unlawful*: subjecting an adult to under-13-grade
  verification (ID/biometric) is over-collection that breaches Bucket-1 minimisation; collect a neutral age
  declaration from everyone (the classifier input), verify hard only for the young bands, fail closed when the
  band is unknown; **(3) retention period** — pinning adults to the child proactive-deletion clock is lawful
  but discards the longitudinal record the *review = mentoring backbone* thesis runs on (self-harm, not
  protection); **(4) rights-holder** (guardian-proxy band-A vs self band-C/D — universalising the guardian path
  strands the adult); **(5) transparency/notice register** (AADC child-friendly notice vs the full precise
  Art 13/14 notice an adult is owed).
- **Bucket 3 — domains the child ruleset is silent on → must be built separately (the real "not covered").**
  Adult lawful basis **+ its proof** (the live gap — no `lawfulBasis` / `termsAccepted` field anywhere in
  `packages/`); self-service DSAR for the guardian-less adult (Arts 15–22, no proxy); **EU AI Act** (age-
  invariant — Annex III(3)(b) high-risk adaptive tutoring + Art 50 "tell them it's AI" attach to the *system*,
  not the user — the single largest sleeper); special-category data (Art 9, age-invariant — an adult's free-
  text chat reveals health/religion the same as a child's); adult consumer / billing law (withdrawal rights,
  auto-renewal disclosure — ties to B3a / E4).

**basis:** GDPR Arts 5(1)(c), 5(2), 6, 7, 12–22; COPPA §312.10; UK AADC; EU AI Act Art 6 / Annex III(3)(b) /
Art 50; EDPB Statement 1/2025. **One-line takeaway:** strictest-child buys the *data-handling* front (ship
it); "covered on all fronts" additionally needs **Bucket 3 built** and **Bucket 2 banded** — and the trap to
never fall into is applying strictest *assurance* or *retention* universally, the exact point where strictest-
everywhere stops being protection and becomes its own breach (assurance) or self-inflicted product loss
(retention). *(Recorded to memory: `project_compliance_three_bucket_model.md`.)*

#### I-0.1 — Cross-cutting framing CORRECTED + EXPANDED  *(supersedes I-0's "under-13" pole; 6-agent web-verified 2026-06-03)*

I-0 was directionally right (three buckets; ship B1 universally; never universalise B2 assurance/retention) but
**US-COPPA-centric and under-scoped on B3.** Two structural corrections + an expanded B3:

**CORRECTION 1 — the strict pole is UNDER-18, not under-13.** COPPA's 13 is a **US-federal floor only.** A
globally app-store-distributed product is bound by regimes that define "child" as **under-18** — India DPDPA
(VPC + no behavioural tracking <18), Brazil, Québec (<14 parental consent, fines to $25M/4%), UK AADC, and the
**Apple/Google child policies**. "Under-13 everywhere" simultaneously **over-restricts adults AND under-protects
the 13–17 cohort.** A single global "strict" rule = **child = under-18, VPC-before-processing, no behavioural
tracking/targeted ads to minors, platform SDK bans** — not COPPA's 13.

**CORRECTION 2 — there are TWO age lines (collapsing them is the root banding error), + a third civil line:**
- **Line 1 — consent capacity** ("can they say yes to processing themselves?"): jurisdictional **13–16** (Norway
  13 *popplyl* §5, UK 13 DPA s.9, DE 16, FR 15, IT/ES 14; US COPPA 13). Gates **only the consent basis**, and
  **only for services offered to a child — does NOT gate a contract basis.**
- **Line 2 — child protection** ("owed child-grade design + handling?"): **flat 18 everywhere** (GDPR Recitals
  38/71, Art 12(1); UK AADC; India; platforms). **Reaching the consent age does NOT graduate a teen out of
  child protection** — your **13–17 cohort is self-consenting AND fully child-protected at the same time**, a
  combination with no slot in a clean child→adult band.
- **Line 3 — contractual capacity (civil law, 18):** a minor <18 generally **cannot validly enter a paid
  subscription** (Norway *vergemålsloven* §9) — distinct from data-consent capacity. **This is the legal reason
  billing MUST sit with the adult owner** on a family account.

**B1 (universal floor) — refinements:** Art 25 high-privacy-by-default is the **EU authority** (not COPPA/AADC);
US minimisation has a **hard statutory hook** in Maryland MODPA; **DPIA is MANDATORY here** (Art 35(3)(a)
profiling + (b) large-scale special-category + the child/AI mandatory lists; UK AADC Std 2) — **a launch
precondition, must assess the 11–17 cohort (Art 35(9))**, not "good hygiene."

**B2 (banded) — corrected mechanics:** **basis is UNIVERSAL** (everyone needs an Art 6 basis) — the child-
specific element is **not a separate basis** but the **Art 8 parental-authorisation layer on top of consent,
only when consent is the chosen basis**; **prefer Art 6(1)(b) contract (held by the adult owner)** for the paid
service → removes the Art 8 parental-verification headache for the 11–12 cohort; **EEA parental verification =
Art 8(2) "reasonable, risk-proportionate effort," NOT COPPA's enumerated VPC** (importing US-style hard VPC into
the EEA flow is itself a minimisation breach; VPC is correct for the US-under-13 path + India). Assurance:
**UK now has a 2nd regulator — Ofcom "highly effective age assurance" (live 25 Jul 2025)** pulling toward more
verification where in scope.

**B3 (build separately) — EXPANDED; this is the highest-exposure work, none of it bought by strict child
handling:**
- **3a — Cross-border transfer to US LLMs `[CRITICAL · age-invariant · highest enforcement risk]`.** Learner
  free-text + **voice** from 11-yo's, often special-category, → Gemini/OpenAI in the US = a **restricted
  transfer**. Required stack: **Art 28(3) DPA** on API/enterprise terms forbidding training (**consumer-tier
  ChatGPT terms give NO controller-processor DPA — a finding**); a **Chapter V mechanism** (DPF adequacy *if the
  recipient entity is certified* — verify per entity; **+ SCCs + a Transfer Impact Assessment** as belt-and-
  braces, because DPF survived *Latombe* at the EU General Court Sep-2025 but a **CJEU appeal is pending — do not
  rely on DPF alone**); UK leg = UK DPF Extension or IDTA/Addendum + TRA; Art 13(1)(f)/14(1)(f) transparency;
  **Art 9(2) explicit consent before special-category leaves the EEA**; the **voice pipeline is a 2nd transfer**
  (voiceprints = biometric special-category, and now child PII under COPPA-2025). **→ corroborated by GATE-1
  (I-A1-GATE1 below).**
- **3b — EU AI Act `[provider-grade high-risk]`.** Adaptive tutor evaluating outcomes + steering the path →
  **Annex III(3)(b)** (Commission draft guidelines read "educational institutions" to include private/online/
  adult ed — contestable, document the assessment, plan conservatively). **Art 6(3) low-risk escape FORECLOSED**
  — it's welded shut because the system **performs profiling** ("review = longitudinal profiling backbone").
  **EduAgent is a PROVIDER, not merely a deployer** → full **Art 16** program (risk-mgmt with **Art 9(9)** minor-
  impact analysis, data governance, tech docs, logging, human oversight, accuracy, conformity assessment + CE
  marking, EU-database registration). **Timeline:** **LIVE since 2 Feb 2025** — Art 5(1)(f) **emotion-inference-
  in-education PROHIBITION** (never run affect inference on the **voice** signal — biometric, top penalty tier
  €35m/7%; inferring "frustration" from answer-latency/correctness is **behavioural**, design to that side) +
  Art 5(1)(a)/(b) manipulation/age-vulnerability + Art 4 AI-literacy; **2 Aug 2026 (NOT delayed) — Art 50
  transparency** ("you're talking to an AI," age-appropriate, don't lean on "obvious") + synthetic-content
  marking (grace to 2 Dec 2026) — **the near-term hard deadline**; **~2 Dec 2027** — full high-risk provider
  program (Digital Omnibus provisional agreement May-2026, **pending OJ publication; statutory date stays 2 Aug
  2026 until published**). **UK has NO AI Act** — equivalents = **DUAA 2025 ADM regime (UK GDPR Arts 22A–22D,
  live 5 Feb 2026)** + Art 13(2)(f); document **"human override everywhere" as the Art 22C safeguard.**
- **3c — Art 9 special-category `[age-invariant]`.** Free-text surfaces/infers health/SEN/religion/ethnicity/
  sexuality (**CJEU C-184/20: inferable special-category IS special-category**) → need **Art 9(2)(a) explicit
  consent** (guardian for sub-threshold minors; teen/adult otherwise) — a higher bar than ordinary consent;
  minimise/scrub before the LLM call or treat the pipeline as special-category end-to-end; UK adds DPA 2018 Sch 1
  condition + **Appropriate Policy Document (s.41)**.
- **3d — Consumer / billing `[adults; minors can't contract]`.** Pre-purchase disclosure stays **yours** despite
  IAP (clear price/renewal/auto-renew before the purchase sheet); US live = **ROSCA + state ARLs** (CA §17600) —
  the **FTC click-to-cancel rule was VACATED** (8th Cir. Jul-2025, ANPRM pending, **not in force**); Norway
  *angrerettloven* §22n digital-content waiver + *Digitalytelsesloven*; **markedsføringsloven §§19–21
  (Forbrukertilsynet) — NO purchase-exhortation to minors → age-gate ALL upsell/paywall copy** (full upsell to
  adult owners only; never "Ask a parent to upgrade!" on a minor surface).
- **3e — Platform contracts `[independently fatal — app removal]`.** Apple Kids §1.3/§5.1 + Google Play Families
  SDK/identifier bans; **App Store Accountability Acts (US states, live 1 Jan 2026)** require consuming Apple/
  Google **Declared Age Range / age-signal APIs**. **Vet every bundled SDK (Sentry, RevenueCat, analytics).**
- **3f — Governance.** **DPO (Art 37) likely mandatory** (large-scale + children + special-category trifecta);
  ROPA (Art 30); breach 33/34 (72h); lead SA = **Datatilsynet** via one-stop-shop; **UK Art 27 representative**
  if no UK establishment. **Product gap: NO recorded lawful-basis / terms-accepted field in the data model** —
  an **Art 5(2)/7(1) accountability defect, universal** (needed for the 11-yo's record as much as the adult's).

**Citation-audit corrections (web-verified — fold into all prior/future entries):** "**UK AADC = under-13**" is
**WRONG** — it's **under-18** (5 bands / 15 standards). "**AI-Act high-risk 2 Aug 2026**" is **OUTDATED** → ~2
Dec 2027 via Omnibus (Art 50 stays 2 Aug 2026). "**Strict assurance is itself unlawful**" — correct authority,
**unlawful *because disproportionate*, not per-se**. **California CAADCA is mostly ENJOINED** (NetChoice v.
Bonta, 9th Cir. Mar-2026 — only age-estimation survived) → **don't rely on it.**

**ROW binding constraints (the under-18 pole, by regime):** **India DPDPA 2023** (<18; VPC before processing any
child data; ban on tracking/behavioural-monitoring/targeted-ads to children — **the binding global
constraint**); **China PIPL** (separate parental consent <14; all <14 data sensitive-by-default; "minor mode");
**Brazil LGPD Art 14 + Digital ECA** (best-interests to 18; parental consent <12); **Québec Law 25** (<14;
$25M/4%); **Australia Children's Online Privacy Code** (by Dec 2026; applies to educational tools).

**Net for the architect/PM:** ship **B1 universally**; **band B2 per person** (never universalise assurance/
retention); **build B3 specifically.** The two most urgent, highest-exposure, NOT-bought-by-strict-child-
handling fronts: **(1) the US-LLM transfer stack** (Ch V + Art 28 DPAs + Art 9 consent + voice) — age-invariant,
fully in force; **(2) the EU AI Act** — live risk is Art 5 emotion-inference (today) + Art 50 (Aug 2026), plus
provider status. **The trap:** strict assurance/retention applied to adults = the point where "strictest" becomes
its own breach (assurance) or self-inflicted product loss (retention). *(Memory `project_compliance_three_
bucket_model.md` already carries this corrected framing in full.)*

#### I-A1-GATE1 — LLM vendor tier / DPA posture  `[FINDING — pre-launch blocker]`  *(repo evidence, verified 2026-06-03)*

GATE 1 of I-A1 made the LLM "no-toggle" (processor-transfer) treatment **contingent** on an enforceable
no-training / no-own-use bar in an executed vendor DPA. **Repo investigation finds that bar does not exist:**
- **All three providers are on CONSUMER/standard API tiers** — Gemini `generativelanguage.googleapis.com`
  (`gemini.ts:20-21`, **not** Vertex AI), OpenAI `api.openai.com` (`openai.ts:23`, **not** Azure/enterprise),
  Anthropic `api.anthropic.com` (`anthropic.ts:22`, **not** Bedrock). No Vertex/Azure/Bedrock SDKs in
  `apps/api/package.json`; raw `fetch()` calls.
- **No DPA / ZDR / no-training commitment** anywhere in code, config, or docs. The **only** DPA reference is an
  audit **to-do** (`docs/audit/.../pii-leak-scanner.md`: "confirm the LLM-provider DPA covers minor first
  names") — i.e. **none confirmed to exist.**
- **Raw child chat + first name + age + full history sent in PLAINTEXT, unredacted** (`session-exchange.ts:1421-1596, 2385`); `learnerName` passed to the prompt.
**Consequence:** on current evidence the I-A1 GATE-1 contingency **fails as built** → the LLM disclosure may
need treating as a **third-party disclosure requiring its own VPC** (not a silent Art 28 processor transfer),
**and** it directly instantiates **B3-3a** (the unlawful-transfer-stack gap) **and** may make **A3's
`AI-training` purpose de-facto live** (vendors may train by default on consumer tier). **PM: log as a pre-launch
blocker/defect.** **Verification split (per decision):** counsel verifies the §312.5(a)(2) text vs FR
2025-05904; the executed vendor DPAs are an **external document the repo cannot show** — must be sourced before
the no-toggle path is built. **Likely remediation: migrate to Vertex AI / Azure OpenAI / enterprise no-training
tiers + execute Art 28 DPAs before paid launch.**

**▶ GATE-1 SECOND-OPINION (counsel, 2026-06-03) — KEYSTONE REFUTED; wider blast radius. This supersedes the
"reduces to Gemini" framing.** Legal architecture above is correct and kept, but its load-bearing factual premise
is false as built:
- **Routing is TIER-keyed, not AGE-keyed.** `resolveExchangeLlmRouting()` (`session-exchange.ts:215-257`)
  switches on `{subscriptionTier, requestedLlmTier, effectiveRung}` — **no age / birthYear / isOwner / minor
  signal.** `gemini_only` (zero fallback, `router.ts:481-482`) is forced **only** for `family` (all rungs) +
  `plus-standard-rung`. **Every other path → children reach OpenAI/Anthropic:** plus/premium advanced rung (≥4)
  → **Anthropic Sonnet** (`router.ts:386-392`); free/pro fallthrough → **Gemini primary + OpenAI fallback** then
  Anthropic (`router.ts:514-537`). A child is **not** confined to family: `maxProfiles` free:2/plus:2/family:4/
  pro:6 (`subscription.ts:44-108`); `effectiveAccessTier` inherited from the account by every profile
  (`metering.ts:638-789`); a 13–17 solo minor can self-own a free/plus account. **→ OpenAI + Anthropic are
  in-scope for children's data, not "near-moot." The single highest-value fix MOVES from "check the Gemini tier"
  to: gate routing on MINOR-STATUS (not tier), pin every minor to one fully-papered vendor/endpoint (Vertex), +
  a guard test that no minor profile yields a non-pinned `providerPolicy`.**
- **No-training ≠ compliant (the sharpest correction).** GDPR Art 28(1)/(3) bar engaging a processor **at all**
  without an **executed written DPA** carrying documented instructions, confidentiality, Art 32 security, sub-
  processor authorisation, DSR assistance, deletion/return, audit. **Processing a child's data through any vendor
  with no signed Art 28 DPA is a STANDALONE infringement (€10M / 2%)** — independent of training, independent of
  breach. "Paid tier = paperwork fix" mischaracterises a **live violation** as housekeeping.
- **COPPA trigger refinement:** it's the vendor's **permission/ability to use** (papered or de-facto), **not
  subjective intent** — a vendor that hasn't trained but **reserves the right** already fails the processor test.
- **Vendor child-gates the first read missed (live once multi-vendor is accepted):** **OpenAI** — hard
  precondition: may not process **under-13** data (the 11-12 cohort) **without ZDR enabled first** (approval-
  gated, not a switch); any 11-12 exchange reaching OpenAI without ZDR breaches OpenAI's own terms (+ ~30d abuse
  retention; litigation-preservation e.g. NYT can override deletion). **Anthropic** — serving minors permitted
  **only with** mandatory safeguards (age verification, content moderation, monitoring/reporting, AI-use
  disclosure, COPPA-equivalent); a minor exchange without them = ToS breach independent of training. (Anthropic
  *consumer* terms now train, since 2025-09-28; Commercial/API terms do not.)
- **Gemini DPA nuance (more precise):** the **paid Developer API DOES incorporate a processor-DPA by reference**
  (so a processor relationship is **not absent** on paid) — but that instrument is **thinner** than the **Google
  Cloud DPA** (full Art 28 + SCCs + residency + audit) governing **Vertex**. **EEA carve-out:** for **EEA/UK/CH
  users Google applies the paid no-training treatment to ALL services incl. AI Studio + unpaid quota → for
  Norwegian children Google contractually does NOT train even on free tier** (softens the "free-tier =
  disqualifying" read). Residuals: non-EEA children on free tier (training + human review live); paid/EEA still
  logs prompts/responses for a limited abuse/legal period (not zero-retention); the Art-28-completeness/Vertex
  question stands. **Prefer Vertex (opinion-strength instrument); the load-bearing reason to leave the Developer
  API remains the hard "must be 18 / not directed to under-18" bar — disqualifying for an 11+ product.**
- **Chapter V transfer — separate, independently fatal, never named before:** even a perfectly-papered no-train
  US processor is a **restricted transfer of EEA children's data** needing its own **Art 44–49 mechanism (SCCs /
  UK IDTA / DPF cert) + a TIA (Schrems II)**. All three rely on SCCs/DPF (DPF legally fragile post-2025 / Schrems
  III risk). Distinct from the training + DPA questions.
- **PII inventory — CONTRADICTION RESOLVED + EXPANDED (code-verified 2026-06-03):** the two counsel reads
  conflicted on age/birthYear; **Read B is correct — RAW age/birthYear is NOT sent.** `getAgeVoice`
  (`exchange-prompts.ts:47-81`) computes age locally (`:76`) and returns only a **categorical tone string**; the
  `birthYear` at `session-exchange.ts:2323` is just the intermediate `ExchangeContext` field consumed by that
  function — **never interpolated into prompt text.** **BUT the verified egress list is BROADER than either
  counsel read stated** — the following learner fields **DO leave to the LLM** and must all enter the DPIA/
  transfer inventory: **first name/displayName** (`exchange-prompts.ts:510-512,599`); **raw user message + full
  prior transcript** (`exchanges.ts:1388-1395`); **subject + topic title/description** (`:509,513-518,530,689`);
  **pronouns** (`router.ts:245-252`); **teaching prefs (learning style, analogy domain)** (`:519-524`);
  **memory facts — struggles, strengths, interests(+context), pace, challenge-response** (`buildMemoryBlock`,
  `learner-profile.ts:828+`, `exchange-prompts.ts:900-902`); **retention/mastery data** (status, easeFactor,
  daysSinceLastReview — `session-exchange.ts:2352-2359`); **known vocabulary (≤60 terms)** (`:346`);
  **accommodation mode** (`:2304-2308`); plus transcript→Inngest payload (audit H1) + minor output→Sentry (M1).
  **⚠ Art 9 flag:** "struggles," "interests," and "accommodation mode" can reveal **health/SEN/disability** →
  this egress is **special-category-adjacent** (ties A1 GATE-2, A2 Art 9(2)(a), E5 DPIA). **NOT sent:** raw age/
  birthdate, location/country, email, school, numeric mastery %, IDs. *(Earlier GATE-1 "+ age" overstated; the
  real correction is the opposite direction — the inventory is wider, not narrower, than "first name +
  transcript.")*
- **Re-ranked remediation:** (1) **age/role-gate routing → pin minors to Vertex + guard test** (only this makes
  the tier question tractable); (2) **execute Art 28 DPAs as launch preconditions** (Vertex/Cloud DPA; OpenAI DPA
  **+ ZDR** for 11-12; Anthropic Commercial DPA **+ minor-safeguards**); (3) **Chapter V + TIA per vendor**;
  (4) **DPIA as a launch precondition** (Datatilsynet always-DPIA: minors + genAI; Norway consent age 13, 13→15
  in consultation; + AI-Act/Art-27 FRIA); (5) **do NOT disclose vendors as "service providers" until DPAs
  executed** — premature = an **FTC Act §5 inaccurate-notice** risk (the memo's steps 3→4 were mis-ordered);
  (6) **minimisation = compliance** (Art 5(1)(c)/25): ship audit H1 (transcript out of the Inngest payload, re-
  fetch by sessionId), M1 (truncate minor output to Sentry), and the **"don't send my name to the tutor" toggle**.
- **Monitors:** **GATE1-M1** Gemini billing tier + region of the project behind the Doppler `GEMINI_API_KEY`
  (account-side, not in code — decides the Gemini leg for non-EEA children; revisit before any child traffic);
  **GATE1-M2** DPF stability (Schrems III) for all three; **GATE1-M3** Norway consent age 13→15.
- **PM one-liner:** *"Children can route to all three LLM vendors (routing keys on tier, not age) — not just
  Gemini. Fix in two moves: (1) gate routing on minor-status + pin every minor to one papered endpoint (Vertex),
  with a guard test; (2) execute Art 28 DPAs + Chapter V mechanism + DPIA as launch preconditions (OpenAI needs
  ZDR-first for 11-12s; Anthropic needs minor-safeguards). 'Check the Gemini billing tier' only covers family/
  plus-standard children until the age-gate ships."*

#### I-A2 — Contract basis for a minor's processing  `[resolves A1 fork; confirms inv-28]`  *(RULE — Holding: NO)*

**HOLDING: No. Art 6(1)(b) cannot carry the child's core processing through the parent's paying account.** The
contract grounds the **adult account-holder's** relationship — their data, billing, account admin, and (if a solo
learner) their own learning data. **The child's data rests on a child-appropriate basis: consent (Art 6(1)(a),
validity-conditioned by Art 8 in EU/UK; VPC in the US), with an Art 9(2)(a) explicit-consent leg stacked on top
wherever the chat can reveal special-category data.** **Resolves the A1 fork against contract; confirms inv-28.**
"Consent end-to-end" is the *default*, applied as a **layered-bases rule, not a rigid either/or** (see (b)).

**(a) Does the parent's contract reach the child's processing? NO — plead in order:** (1) **Threshold/textual
(primary):** Art 6(1)(b) reaches only processing necessary for a contract "**to which the data subject is
party**" (EDPB 2/2019 ¶¶2,26) — the data subject is the **child**; the parent's contract isn't a contract the
child is party to → **6(1)(b) never engages**; a third-party beneficiary is not a party (Recital 38). (2)
**Minor-incapacity:** a non-competent minor's contract is voidable → **no valid 6(1)(b) basis** (ICO Code Annex
C); the representation theory proves too much (voids the contract, drops payment on someone who can't assume it).
(3) **Necessity (alt.):** even assuming a valid child-party contract, 6(1)(b) reaches only the **objectively
necessary** ("realistic less-intrusive alternatives ⇒ not necessary", EDPB 2/2019 ¶¶22–25,32) — disclosing raw
child chat to a vendor with no no-own-use bar is **not necessary** (deliverable via ZDR/no-train). *Art 8 ≠
parental contract* (it authorises the child's Art 6(1)(a) consent, supplies no basis). *6(1)(f) not viable* —
children's interests "should in general prevail" (EDPB 1/2024 ¶¶94–95; ICO: commercial re-use unlikely to
qualify).

**(b) Operation-by-operation (confirms inv-28, layered-bases):**

| Basis | Operations (data subject) |
|---|---|
| **CAN sit on 6(1)(b)** (adult is party; objectively necessary) | adult account creation + auth; billing/payment/subscription/entitlement/refunds (also consumer law); provisioning the seat the parent bought — **up to but NOT including** the child's PII; a **solo adult learner's own** tutoring data (Art 9 overlay applies) |
| **MUST be consent** (Art 6(1)(a)+Art 8 / COPPA VPC; child not a party) | child identifiers (first name, age/birth year); child tutoring content (raw messages, full session-event history); the longitudinal record (mastery/needs-deepening/progress/memory); **the LLM disclosure of child data — where GATE-1 bites hardest** |
| **MUST additionally carry Art 9(2)(a)** (age-invariant) | free-text revealing special-category (inferred disability/neurodivergence/health, religion). **Art 9(2) excludes contract-necessity (EDPB 2/2019 ¶21) → 6(1)(b) can NEVER carry special-category, adults too**; sub-consent-age child also needs the Art 8 overlay |

**Layered-bases refinement:** for the **13–17 self-consenting band**, the delivery-necessary slice (running the
tutor, persisting the record) has a **defensible-if-contestable contract footing** where the teen can be a party
→ posture = **layered bases**, not rigid consent-only that an Art 7(3) withdrawal can collapse. Narrows, doesn't
flip.

**(c) Divergence:** **EU/UK** — 6(1)(b) fails for the child's data → consent operative; Art 8 modulates *who/how-
verified*, not *whether contract is available*; **consent age is a per-member-state patchwork (13 NO/UK/IE/ES/PL/
SE/DK/CZ/LV/FI · 14 AT · ~15 FR/GR/SI/HR · 16 DE/NL/HU/LU/LT/SK) → band by member state of residence; don't
generalise 13.** **US** — COPPA indifferent to the GDPR basis: under-13 = **VPC full stop** (a parent contract is
not a COPPA VPC method, 16 CFR 312.5(b) closed list; nothing collectible pre-VPC); "support for internal
operations" doesn't cover own-use vendor disclosure; **2025 Rule 312.5(a)(2): AI-training disclosure is NEVER
integral → always its own separate VPC. Lawful minors-app design = contractually prohibit vendor training
(processor-only), not seek separate VPC.**

**A1 fork resolved + GATE-1 compounding:** A2 removes the "necessary processor transfer under the contract"
softener; GATE-1 removes the processor characterisation as built (**Art 28(10):** a processor that determines
purposes "shall be considered a controller"). Stacked: **the LLM disclosure of child data needs its own
separately-surfaced footing — EU: a controller-to-controller basis + Art 9(2)(a) + Chapter V; US: itemised
separate VPC. Cannot be bundled into "consent to use the service."** **Off-ramp (preferred): make the vendors
processors by contract → reverts to an Art 28 sub-processor transfer (no separate consent leg; name them +
flow-down + Art 13/14 + Chapter V).** Only if a vendor won't contract to processor terms does the standalone
consent leg become unavoidable.

**DEFECT CHAIN (each independently fatal; SEQUENCED):** (1) **A2 × GATE-1 [NEW, CRITICAL]** — no DPA/SCCs/DPF/ZDR
anywhere (0 matches; Gemini bare `x-goog-api-key`); every EU/UK/NO child disclosure = a Chapter V transfer with
no mechanism = independently unlawful regardless of Art 6 basis [prerequisite]; (2) **C1 consent-cascade** —
A2 makes consent the primary child basis, and C1 destroys the receipt table on deletion/withdrawal [prerequisite];
(3) **`lawfulBasis` gap** — no `lawfulBasis`/`legalBasis`/`termsAccepted` field in `packages/` (0 matches) →
Art 5(2)/7(1) failure; A2's holding is **moot at the data layer until this field exists** [accountability
capstone recording the split]. **Trip read:** confirms inv-28; does **NOT reopen** A1 architecture — vendors-must-
be-processors is reaffirmed; the new finding is structural-but-not-a-fork-reopen (**GATE-1 is a PRIOR failure to
the basis debate**). **Standing caveat:** vendor terms shift post-Jan-2026 cutoff (read 2026-06-03) — re-verify
the signed instrument before executing.

#### I-A3 — COPPA AI-training separate consent  `[folds under A1; confirmed]`  *(RULE/MONITOR)*

**(a) Recording an inert `AI-training` purpose category does NOT trigger separate-VPC-for-training** — the trigger
is **use or disclosure, not the schema row.** A never-granted, never-surfaced, never-read, default-off category is
safe. **Trip-wires (earliest of):** (1) first model-improvement read of child PI; (2) any vendor on a minor's
**actual route** permitted-to / by-default training; (3) recording the purpose as granted/active on a child
record; (4) surfacing it as live in child/guardian notice; **(5) [added] displaying the toggle as available/active
for a minor — an FTC Act §5 inaccurate-notice risk independent of COPPA** (mirror: representing vendors as "no
training" while the bar is unpapered is also a §5 misrepresentation). **Safest: do not render the category at all
for minor profiles.** **(b) Is A3 de-facto LIVE? YES, conditionally** — **iff any vendor on a minor's actual route
is training-permitted.** Per GATE-1 second opinion that set is **broader than free-tier Gemini** (any minor
reaching OpenAI/Anthropic without an executed no-train DPA; non-EEA children on free-tier Gemini). For EEA/
Norwegian children the Google regional carve-out likely keeps the Gemini leg dry, but **the OpenAI/Anthropic legs
+ the missing DPAs keep A3 LIVE, not Monitor.**

### Segment 5 (early capture) — EU AI Act

#### I-E1bis — Art 5(1)(f) emotion-inference for an adaptive tutor  `[independent · live prohibition since 2 Feb 2025]`  *(RULES — layered doctrine)*

**The doctrine is LAYERED, not binary** (Art 3(39) + Recital 18 + Commission Guidelines **C(2025) 5052 final**,
29 Jul 2025). "Not prohibited" **never** means "permitted" — it means **high-risk:**

| Layer | Test | Regime | Ceiling |
|---|---|---|---|
| **L1 PROHIBITED** | biometric + emotion/intention + **workplace or education-institution** context | Art 5(1)(f) | €35M / 7% (Art 99(3)) |
| **L2 HIGH-RISK** | biometric + emotion/intention, **not** in that context | Annex III(1)(c) | €15M / 3% + full Ch. III + Art 50(3) notice |
| **L3 non-biometric affect** | emotion from text/content only | outside Art 3(39) | GDPR + (if institutional) Annex III(3) general-ed high-risk |
| **L4 CLEAR** | functional learning-state from discrete behavioural events | outside the definition | GDPR profiling (Art 4(4)/22) only |

**Scope finding that re-frames everything:** a **B2C, self-purchased, at-home tutor is NOT an "education
institution"** (Guidelines ¶255 = bodies accredited/sanctioned by a national education authority with certificate
/gating power). Dispositive worked example (¶2175): *"An AI-based application using emotion recognition for
learning a language online outside an education institution is **not** prohibited under Article 5(1)(f). By
contrast, if students are **required** to use the application by an education institution, the use … is
prohibited."* Customer-directed emotion recognition is expressly outside the ban "whether based on biometric data
or not" (¶2278). **⇒ For the product as it ships today, emotion inference is NOT an Art 5(1)(f) prohibited
practice — it is at most L2 high-risk + GDPR. The prohibition goes LIVE the instant a school/org requires or
deploys the app for enrolled students (the B2B roadmap → hard-gate emotion-from-biometric features off in
institutional builds).** Build as if forbidden anyway: the escape only downgrades to high-risk, never clean — the
**only clean path is not to be an emotion-recognition system at all.** *(In scope now as a Norway/EEA-established
provider, Art 2(1)(a). SME nuance: Art 99(6) fine = lower of €-amount and %-turnover.)*

**(a) Behavioural signals (correctness, latency, retry, abandonment, session timing) → learning state: PERMITTED
— L4 CLEAR** (neither emotion nor biometric — the cleanest status). Basis: Art 3(39) needs biometric + an
emotion/intention target; Recital 18 excludes physical/functional states (pain, fatigue) + "mere detection …
unless used to infer emotions"; Guidelines ¶¶250–251, 265. **Two traps:** "**frustration**" is an emotion (never
a field/label/trigger); "**engagement/attention/motivation/confidence**" are **NOT auto-safe** — the Guidelines
list "assessing students' attention and motivation through the recognition of emotions" (¶¶2007, 2177) as the
**prohibited** education case → safe **only** when computed from non-biometric behavioural events + labelled
functionally. **Acceptance criterion:** internal state vocabulary is **functional only** (`difficulty`,
`mastery`, `recency`, `interaction_density`, `consecutive_incorrect`, `calibration_score`); **no affective term**
(frustration, mood, anxiety, emotion, affect, sentiment, engagement-as-feeling) as a learner-state field or model
output — **enforce with a CI static-analysis guard** (mirror `persona-fossil-guard.test.ts`). Secondary: discrete-
event timing only — **never keystroke dynamics / typing-rhythm** (Guidelines ¶251 names "way of typing" as
behavioural **biometric**).

**(b) Same inference from the VOICE signal (tone, prosody, pace): DO NOT BUILD.** Correct label = **L2 high-risk +
GDPR biometric exposure for B2C; L1 PROHIBITED only inside an education-institution deployment** — *not*
"categorically prohibited." Basis: Art 3(34) (AI-Act biometric drops GDPR's unique-ID tail → voice prosody is
biometric); Art 3(39) + Recital 18 + Guidelines ¶249 (trigger = inferring emotion from voice, **not** capturing
audio); Annex III(1)(c); GDPR Art 9 (Art-9-adjacent/contested per Hungarian DPA Budapest Bank, but retaining the
raw waveform creates voiceprint-identification exposure → DPIA + Art 22 review for minors). **The line:** voice →
ASR transcript → analyse text = **clean**; wall-clock latency around an utterance = **clean**; voice → acoustic/
prosodic affect = **emotion-recognition system → high-risk + GDPR now, prohibited the moment a school requires
it.** **Acceptance criterion (the single best invariant in the whole analysis — exits L1, L2 *and* Art 9
simultaneously):** *the voice pipeline emits only `{ transcript, utterance_start_ts, utterance_end_ts }`; no model/
feature consumes the raw waveform / spectral / prosodic features to produce an affect/emotion/engagement label;
all adaptation runs on transcribed text + discrete event timestamps.* **Vet + pin every third-party voice SDK** —
a bundled SDK returning a hidden sentiment score silently makes you a high-risk Art-9 emotion-recognition system.

**(c) Safe-harbour design rule: act on functional states; never infer emotion from biometric data anywhere.**
Basis: Guidelines ¶248 (anti-circumvention — "shall not be circumvented by referring to attitudes"), ¶¶250–251,
256–259 (medical/safety exception is narrow — CE-marked medical devices; **expressly excludes "wellbeing,
motivation levels, learning satisfaction," ¶2239 → unavailable to the tutor as pedagogy**). **MAY act on
(functional, L4):** `difficulty=high → schedule review`; `mastery=0.3 → easier item`; `consecutive_incorrect=3 →
switch approach / offer review`; spaced-repetition due; `session_length > typical → offer a break`; sparse
interaction → gentle re-engage. **MUST NEVER build:** any mood/emotion feature ("the Mate detects you're upset");
any model consuming biometric signals (voice acoustics; a fortiori camera/facial affect) to label affect; any
emotion field in the data model (its presence is itself evidence of a prohibited/high-risk purpose). **Safeguarding
carve-out (distinct, permitted):** text-content self-harm/crisis detection is **not** an emotion-recognition
system (non-biometric → outside Art 3(39), ¶251) — keep it behind an **architectural firewall** (a dependency-
direction lint forbidding imports from the safeguarding module into pedagogy/engagement modules; a mood signal
must never be laundered through a "safety" label, ¶248); still implicates **GDPR Art 9** (self-harm = health
data); **keep distress detection text-only** (voice-based distress would be biometric). **Master AC for the PRD:**
*No emotion or intention is inferred from biometric data anywhere; voice is used for transcription only;
adaptation inputs are functional learning signals from content + discrete events; no emotion is labelled, stored,
acted on, or surfaced.*

**(d) Art 5(1)(a)/(b) manipulation / age-vulnerability: PERMITTED-WITH-CONDITIONS** — gamification is allowed, but
the **binding floor is DSA/AADC, which trigger BELOW the AI-Act bar.** Basis: Art 5(1)(a)/(b) + Recital 29 require
**material behaviour distortion + significant harm** (cumulative; psychological + "accumulated over time"; lower
bar for children; no intent needed — "objective or effect"); Guidelines name "addictive dopamine loops" as a
prohibited child example but place "learning applications that generally bring benefits" outside. **Lower-threshold
hooks (design to these → satisfy 5(1)(b) automatically):** **DSA Art 25** (dark patterns) + **Art 28(2)** (no
profiling-based ads to a known minor) — treat Art 25 as binding-by-equivalence and 28(2) as a hard rule for any
under-18 commercial surface; **GDPR Recital 38/71 + Art 25**; **UK AADC Std 13** (no data-grabbing nudges) **+ Std
5** (no wellbeing-detrimental use) — these bite with **no "significant harm" requirement at all.** **Acceptance
criteria:** (1) no loss-aversion/compulsion framing on minor surfaces ("your streak will die!", punishing
countdowns) — streaks shown as neutral positive records; (2) **penalty-free disengagement** (skipping/closing/
inactivity never degrades standing or escalates pressure — extends `never-lock-topics` / `quiet-defaults-over-
friction`); (3) symmetric choice prominence (equal click-cost high/low-privacy — AADC 13 / DSA 25(3)(a)); (4) no
profiling-based ads to under-18s (DSA 28(2)); (5) pro-wellbeing nudges encouraged (AADC 13 blesses them); (6)
human override on every adaptive decision.

**Monitors:** **E1bis-M1 — "education institution" scope** (resolved for B2C **with a cliff**: a self-purchased
home tutor is outside 5(1)(f) today; **revisit triggers:** any B2B/school path where an institution *requires or
deploys* the app → flips emotion-from-biometric to **L1 prohibited**; the grey zone where a school *recommends* —
¶255 keys on "required"). **E1bis-M2 — durability of the non-biometric-affect line** (durable — Recital 18 +
Guidelines state it thrice; trigger: any proposal to add text-sentiment as a pedagogy input — still avoid for
GDPR/AADC/product-values). **E1bis-M3 — EEA incorporation / Norwegian AI Act** (in scope now Art 2(1)(a); EEA-JC
incorporation + Norwegian transposition targeted summer 2026 — track for the national authority/penalty go-live).

**Relationship to E1 (high-risk trigger):** I-0.1 already determined EduAgent is an **Annex III(3) high-risk
provider** (Art 6(3) escape foreclosed by profiling). E1bis adds the **Art 5 prohibition layer** + the
**emotion-recognition (Annex III(1)(c)) overlay** + the concrete **build-to-the-behavioural-side** acceptance
criteria. **E1 = mostly captured; E5 (DPIA) inherits the Art-9/voice/profiling risk surface.**

**Sources (counsel, I-A2 / GATE-1 second opinion / I-A3 / I-E1bis; verified 2026-06-03, re-verify before
executing contracts or the opinion issues):**
- EDPB Guidelines 2/2019 (Art 6(1)(b)) — https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22019-processing-personal-data-under-article-61b_en · 1/2024 (legit interests) — https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-12024-processing-personal-data-based-article-61f_en
- GDPR Art 6/8/9/28(10) — https://gdpr-info.eu/art-6-gdpr/ · https://gdpr-info.eu/art-8-gdpr/ · https://gdpr-info.eu/art-9-gdpr/ · https://gdpr-info.eu/art-28-gdpr/
- COPPA FR 2025-05904 / 16 CFR §312.5 — https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule · https://www.law.cornell.edu/cfr/text/16/312.5
- Gemini API terms (free/paid + EEA carve-out) — https://ai.google.dev/gemini-api/terms · Google Cloud DPA (Vertex) — https://cloud.google.com/terms/data-processing-addendum
- OpenAI under-18 API guidance — https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance · data controls — https://developers.openai.com/api/docs/guides/your-data
- Anthropic orgs-serving-minors — https://support.claude.com/en/articles/9307344 · Anthropic DPA — https://privacy.claude.com/en/articles/7996862
- Norway consent-age 13→15 bill — https://digitalpolicyalert.org/change/11581-bill-amending-personal-data-act-to-raise-age-limit-for-data-processing-consent
- EU AI Act Art 3 / Art 5 / Annex III / Art 50 / Art 99 — https://artificialintelligenceact.eu/article/5/ · https://artificialintelligenceact.eu/annex/3/ · Commission Guidelines on prohibited practices C(2025) 5052 final (29 Jul 2025) — https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-prohibited-artificial-intelligence-ai-practices-defined-ai-act

#### I-E2 — Ofcom / UK child-AI-chatbot regime  `[TWO-TRACK: OSA = Monitor · data-protection = Active Rule]`

**Posture = TWO-TRACK.** **OSA axis = MONITOR (confirmed)** — no binding OSA rule captures EduAgent on the
current build. **Data-protection axis = an ACTIVE RULE today** (ICO Children's Code + UK GDPR Art 8 + Art 35) —
"Monitor" must NOT be read as "no present obligation": the **same age-assurance subject-matter is already
enforceable now** through the data-protection route. *(Cutoff caveat: the Dec-2025 Ofcom explainer + all Apr-2026
legislation + section numbers post-date the ~Jan-2026 training cutoff — established via live secondary sources;
logged anchor dates [C&P Act RA 29 Apr 2026; SoS report ~31 Dec 2026] authoritative; **re-verify section
attributions vs legislation.gov.uk before reliance** — one attribution correction below is the most consequential
point.)*

**Threshold — "Mate" is OUT of OSA Part 3 U2U scope, on TWO grounds (lead strongest-first):** (1) **Provider-
content ground (s.55(7))** — the tutor's output is *provider content* (algorithm applied by the provider), **not
regulated UGC**; the only cross-user thing a guardian sees is that provider-generated summary. (2) **No-encounter-
vector ground (s.3(1)/s.55(3)(b))** — a U2U service needs functionality by which one user's content "may be
encountered by another user"; in a 1:1 tutor with **derived-only guardian views**, the child's verbatim UGC never
reaches a second user by means of the service. (3) **Confirming third leg — bot-is-not-a-user (s.55(4)(b))** — a
first-party provider-operated bot fails the "not controlled by/on behalf of the provider" limb. **Do NOT rely on
Schedule 1 exemptions** — none fit (paras 1–3 content-type-specific; para 4 only comments/reviews/likes; para 7
needs provider staff not a consumer family account). **Protection sits at the s.3/s.55 scope gate, not Sch 1.**
**Ofcom's conjunctive exclusion test** (open letter 8 Nov 2024; AI-chatbots explainer 18 Dec 2025): out of scope
only if (i) users interact with the chatbot and **no other users**, (ii) it **does not search multiple websites/
databases**, (iii) it **cannot generate pornographic content** — **EduAgent currently meets all three.**

**Code-verified (load-bearing — every parent-facing surface returns provider-derived data only, never raw
transcript):** `dashboard.ts:1350-1357` documents + enforces "raw conversation transcript … never selected or
returned to a parent"; `hydrateChildSessions` (`session-crud.ts:2145-2194`) projects only highlight/narrative/
prompt/engagementSignal + drill scores; the parent recap schema (`packages/schemas/src/recaps.ts`) carries **no
verbatim learner-message field**; verbatim quotes (`learnerQuote`/`solidAnswerQuotes`) stay **server-side**
(`llm-envelope.ts:215`; note-draft passes a hallucination guard); **no U2U surface exists** (no child↔child, no
community/feed, no shareable bots/personas, no sharing beyond the linked guardian).

**Guardian-visibility "flip" = a FUTURE-feature risk, not a present defect.** A parent viewing a child's raw
transcript would, on the literal words, be a second user encountering UGC (s.55(3)(b)) — the defences (closed
family relationship; tutor replies remain provider content) are arguable, but the robust move is **de-risk by
design**, which the current build does (derived-only). **One real cross-user bridge to keep honest:** guardian
`parentTell`/`parentContributions` is injected into the child's session as model context (`progress.ts:909-918`),
and child turns feed the recap-generating LLM (`session-highlights.ts:167-170`, whose test names the threat
"child turn manipulates parent-facing recap"). **This does NOT flip scope** (first-party, server-mediated,
asymmetric, no open social graph) — but the **injection-hardening at `session-highlights.ts` is a load-bearing
OSA-adjacent control, not merely prompt-safety.**

**THE STATUTE CORRECTION (most consequential):** two OSA-amending Acts got RA the **same day (29 Apr 2026)**; the
binding child-AI duties are split, and **the age-assurance duty is NOT in the Crime & Policing Act:**
- **PRIMARY watch → Children's Wellbeing and Schools Act 2026** — **s.70 → new OSA s.214A** (power to require
  "specified internet services" to restrict relevant children's access to services/features) + **s.72 → new UK
  GDPR Art 8ZA** (raise digital-consent age toward **16** + mandate age verification). **This is the statute that
  can pull a first-party tutor like Mate into a direct age-assurance duty.** Operative duties pending implementing
  regs.
- **SECONDARY (illegal-content tripwire only) → Crime & Policing Act 2026** — AI-CSAM-tool offences (GOV.UK
  explicit: **do not criminalise general AI developers → nil exposure for a maths/history tutor**) + an OSA reg
  power **s.216A tethered to illegal content / priority offences only** (the post-Grok plug). **Not an age-
  assurance power.** Matters only if the tutor could emit illegal AI content / facilitate a priority offence.

**Instrument table (binds now?):** OSA U2U/search duties (ss.2–4, 55) — **No**; Ofcom Protection of Children
Codes (in force 25 Jul 2025) — **No** (contingent on U2U scope); OSA HEAA — **No direct OSA hook**, but tag "OSA:
Monitor; data-protection: Active"; **ICO Children's Code (AADC, s.123 DPA 2018, in force 2 Sep 2021) + UK GDPR
Art 8 (consent 13) + Art 35 DPIA — YES, ACTIVE RULE today** (re-verify post-DUAA 2025, in force 19 Jun 2025,
which put ICO children's guidance under review); Children's Wellbeing & Schools Act 2026 s.214A/s.72 — **No yet
(pending regs) — PRIMARY watch**; C&P Act 2026 s.216A — **No (illegal-content axis only) — SECONDARY**.

**Revisit triggers (priority order):** (1) **architecture self-trigger** — any feature breaking Ofcom exclusion
prong (i): a verbatim child-message/quote field in a **guardian-facing schema**, two users co-occupying a
session, a shareable/exportable transcript, user-created/shareable personas (**closest live edge: the note-draft
→ guardian path built from real `solidAnswerQuotes` — child verbatim must NEVER reach the guardian unfiltered**);
(2) **present data-protection duty — ALREADY triggered** (DPIA + AADC + Art 8), not a watch-item; (3) **Children's
Wellbeing & Schools Act 2026 s.214A/s.72 implementing regs [primary age-assurance vehicle]**; (4) SoS progress
report ~31 Dec 2026 [anchor]; (5) C&P Act s.216A SI [secondary, illegal-content]; (6) **search-prong** — confirm
no production path searches multiple external sites/DBs (homework-camera, any web/tool retrieval); if it does,
**search-service scope is independently live** regardless of U2U; (7) DSIT "Growing up in the online world"
consultation outcome + Ofcom updated codes (2026).

**TWO forward-only guards to install:** (a) a **CI test that fails if any guardian-facing schema gains a verbatim
learner-message/quote field**; (b) a **dated OSA scope-assessment note** stating no-U2U / no-priority-content /
no-multi-source-search as **testable invariants** (citing `recaps.ts`, `progress.ts:909-918`,
`session-highlights.ts`), re-run as a **gating step** on any feature touching guardian↔child content, shared
sessions, transcript export, or custom bots.

**✅ CODE-VERIFIED (2026-06-03) — OSA out-of-scope HARDENED from argued → evidenced.** Guardians see **DERIVED
data only, never raw transcript** — the invariant is documented (`dashboard.ts:1350-1354`: "Parents see DERIVED
data only … the raw conversation transcript (sessionEvents.content) is never selected here or returned to a
parent") and enforced across **every** parent→child path: `getChildSessionDetail` (`dashboard.ts:1378-1459`)
projects summary fields + numeric drill scores only, never `sessionEvents.content`; `getChildSessions`,
`recaps.ts toRecapItem` — same derived shape; the **only** raw-`.content` path
(`/sessions/:sessionId/transcript`, `sessions.ts:575-586`) is **self-scoped** (`getSessionTranscript(db,
profileId,…)` — no parent→child parameter; a guardian gets their own sessions or 404). **Defense in depth:**
`assertOwnerProfile` + `assertParentAccess` (IDOR-tested, `dashboard.integration.test.ts:1759/:1691`) +
`assertChildDashboardDataVisible` (child can hide even derived data; consent-withdrawn → redacted, BUG-466). **⇒
no inter-user content encounter exists → OSA U2U out-of-scope on the cleanest reading; bonus: the consent-gated,
child-suppressible derived view is strong Bucket-1 data-minimisation evidence.**

**⚠ DURABILITY GAP → the priority guard test:** the invariant is held by the projection + a comment + access-
boundary tests, **but there is NO dedicated negative-content guard test** — nothing fails CI if a future
"let parents read the transcript" feature (or an innocent projection change) adds `sessionEvents.content` to a
parent-facing query, and **the OSA out-of-scope legal conclusion now RESTS on this code invariant.** **Add a
forward-only guard test asserting no parent→child read path (`getChildSessions`, `getChildSessionDetail`,
`listRecapsForParent`, `getRecapForParent`) returns `sessionEvents.content`** — ratchet it like
`safe-non-core.guard` / `persona-fossil-guard`. This converts "out of scope because of how the code happens to
project today" into "out of scope, **enforced**" and makes the E2 architecture self-trigger **impossible to trip
silently** (shipping parent-readable transcripts would break a named test → a deliberate decision with the OSA
consequence visible in the diff).

**Carry-forward:** OSA = **Monitor** (instruments + triggers logged); **data-protection axis folds into the
existing Bucket-2 control + E5 DPIA** (confirm DPIA-done + 15 AADC standards + Art 8 under-13 verified-parental-
consent); **install the 2 forward-only guards — chiefly the named parent→child `sessionEvents.content` negative-
content guard test above**; **PM: primary monitor = Children's Wellbeing & Schools Act 2026, not the Crime &
Policing Act.**

**Sources (counsel, I-E2; re-verify section numbers vs legislation.gov.uk):** OSA 2023 ss.3/55, Sch 1 —
https://www.legislation.gov.uk/ukpga/2023/50/contents · Ofcom AI-chatbots explainer (18 Dec 2025) + open letter
(8 Nov 2024) — https://www.ofcom.org.uk/online-safety · Ofcom Protection of Children Codes (24 Apr 2025) —
https://www.ofcom.org.uk/online-safety/protecting-children/ · ICO Children's Code (AADC) —
https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/ ·
UK DPA 2018 s.123 / UK GDPR Art 8 — https://www.legislation.gov.uk/ukpga/2018/12/section/123 · Children's
Wellbeing and Schools Act 2026 (s.214A/s.72 → Art 8ZA) + Crime & Policing Act 2026 (s.216A) — re-verify at
https://www.legislation.gov.uk/ · DUAA 2025 — https://www.legislation.gov.uk/ukpga/2025/18/contents

#### I-E3 — Moved-country grace window  *(PARAMETER — feeds the residence-change wind-down)*

**No statutory numeric maximum in either GDPR or COPPA for a consent-pending/suspended state.** Governed by the
**reasonableness + storage-limitation + no-dead-end** standard — **same family as C3.** The law fixes only the
**shape**: a genuine, documented, time-boxed transition ending in **wind-down, never hold-forever-and-hard-block.**
You set the integers (Art 5(2): document them + the reasoning). *(Integers are policy choices inside a principle-
based band — confirm with the human lawyer.)*

| Band | Floor (min before any forced/destructive action) | Ceiling (max hold before wind-down compelled) | Action at expiry |
|---|---|---|---|
| **Adult / general consent-gated** | **30d** (mirror C3) | **~90d** storage-limitation soft cap; **recommend 60d as the documented policy value** | advance notice → export offered → delete/anonymise the **processing-dependent** data; **account shell + re-consent path preserved** |
| **Child now below the new jurisdiction's consent age** | **~14d, with ACTIVE guardian outreach** (direct notice, not a passive in-app nudge) | **~30d** (the adult floor becomes the child ceiling) | guardian (or, if none linked, the child) notified → guardian export offered → delete the child's PI (COPPA obtain-or-delete) |

**Throughout:** browse-only holding (R3 / the D2 preview — **no AI, no collection**) runs the whole window;
**re-consent is the always-available exit and is RETROACTIVELY CURATIVE** (granted before expiry → processing
resumes, nothing deleted); export always available; **deletion is of processing-dependent data, never a silent
account-vaporisation and never a terminal hold-forever.**

**(a) Statutory maximum? No** — but "no numeric max" ≠ "unbounded." Three principles bite the ceiling:
**Art 5(1)(e)** storage limitation (the only thing justifying continued holding is the transitional purpose of a
fair re-consent chance → soft ceiling; **hold-forever-and-hard-block is itself a storage-limitation breach**);
**no live processing basis during suspension** (why browse-only is correct — continued storage rests only on a
**thin Art 6(1)(f)** account-continuity/recovery LI, **expressly subordinated to the child's interests, Recital
38** → doesn't survive indefinitely); **Art 5(2)** accountability (the integer must be documented + reasoned, clock
starting from a **logged declared-residence-change trigger**). **Premise stays clean:** the move does **not**
retroactively invalidate collection lawful when made — only **forward** processing/storage need re-grounding; that
is exactly what earns the floor (a lawful transition, not unlawful-holding-from-day-one). **Expiry = wind-down:**
stop processing (done at suspension) → advance notice + export window → at the ceiling delete/anonymise the
processing-dependent PI **while preserving the human's exit** (still log in, export before deletion, re-consent
fresh). Purge the data that lost its basis; **don't necessarily nuke the account identity** (its own dead-end).

**(b) Child changes the clock — shorter tolerance, same direction as C3.** Two opposing pulls: **shorter
(minimisation)** — COPPA 2025 §312.10 (retain only as reasonably necessary, written/published policy, no
indefinite; in force 23 Jun 2025, policy deadline 22 Apr 2026 passed) + Recital 38 → drags ceiling to ~30d;
**longer (fairness)** — the re-consent actor is an **absent third party (the guardian)** who must be reached and
act → too short a floor is an unfair family dead-end. **Resolution:** real floor (~14d) + **front-loaded ACTIVE
guardian outreach** (direct notice, not passive nudge) → compressed window stays fair; at ~30d delete the child's
PI, guardian export first. **Two precisions:** **COPPA reaches US-connected children only** — an EU→EU move (a
self-consenting 14-yo Norway→Germany, floor 13→16) is driven by **GDPR Art 8 + storage limitation, not COPPA**;
the universal policy **adopts the COPPA-tight ceiling as the strictest-of-three floor and relaxes per verified
jurisdiction** (same discipline as GATE-1 — don't universalise a regime onto users it doesn't reach). **No
reachable guardian edge:** a self-consenting child may have no guardian linked → outreach goes to **the child to
nominate a guardian contact**, and absent that, **deletion at the ceiling is the firm default** (fairness argument
for a longer floor weakens; ~30d holds).

**⚠ LOAD-BEARING PREMISE CHECK (the GATE-1 lesson — verify in code, don't assume):** confirm the browse-only R3/D2
holding state **truly collects nothing** — no analytics, no session logs, no telemetry tied to the suspended
profile. **If it does, the "no processing / no collection" premise fails → you are processing without a basis
during the very window meant to have none, and the whole parameter rests on sand.** Verify before relying on it,
exactly as GATE-1's routing premise had to be verified rather than assumed.

**✅ PREMISE VERIFIED IN CODE (2026-06-03) — premise SOUND.** `ConsentPendingGate` renders **static content only**
(no `track`/`capture`/Sentry/network beyond static fetch); the AI is **hard-blocked server-side** — `consentMiddleware`
(`consent.ts:100-204`, applied globally `index.ts:236`) returns **403** for `PENDING`/`PARENTAL_CONSENT_REQUESTED`
**before any DB write or LLM call**, with **no logging/Sentry/analytics in the middleware itself**; session-event
endpoints, coaching, and **push-token registration** (`settings.ts:256-271`, not exempt) all hit the same 403 →
no side-effect writes; the reminder/revocation Inngest jobs send notifications only, **no activity logging**.
**STRUCTURAL FINDING (relevant to E2/E3 + §H Ripple 4):** there is **NO "moved-country"/jurisdiction-pause
consent state** — `consentStatusSchema` (`consent.ts:7-12`) has only 4 states (`PENDING`,
`PARENTAL_CONSENT_REQUESTED`, `CONSENTED`, `WITHDRAWN`). **⇒ the E3 grace-window parameter is correctly grounded
on a verified-clean holding state, but is INERT until the residence-change suspension state + its scheduler are
built** (the 5 build mechanisms above). When that suspension state ships, it **must reuse `ConsentPendingGate`'s
verified-no-collection shape** — re-run this check on the new state.

**Monitors:** **E3-M1** destination-DPA consent-pending-retention guidance (Datatilsynet first — Norway home
market; revisit per named destination jurisdiction — a few DPAs have published guidance that can move the
ceiling). **E3-M2** Norway digital-consent age 13→15 — if it passes, a larger 13/14 band becomes consent-gated,
widening who hits this window (incl. an intra-Norway re-classification into the raised floor).

**Recommended locked parameters (delegate-ready):** Adult/general — **floor 30d, policy 60d, ceiling 90d**; Child
— **floor 14d (+ active guardian outreach; child-nominates-guardian fallback if none linked), ceiling 30d**; Both
— browse-only (R3/D2) throughout, re-consent exits + resumes (retroactively curative), export always available,
clock starts at the logged residence-change trigger, deletion of processing-dependent data not silent account
vaporisation.

**Build queue (architect, async) — parameter is inert until 5 mechanisms exist (none block setting it now):**
(1) a residence-change trigger timestamping suspension start; (2) a scheduled Inngest wind-down at floor + ceiling
(**shares the §H Ripple-4 scheduler** with C3/E1/E2); (3) guardian outreach + child-nominate-guardian fallback;
(4) export-before-delete; (5) a **verified-no-collection** browse-only state.

**Get-real-counsel flags:** confirm the destination jurisdiction's DPA guidance if a specific named EU state;
confirm COPPA §312.10 final published-policy wording before locking the child ceiling (in force 2026-06-03, re-pull
at opinion time).

**Sources (counsel, I-E3):** GDPR Art 5 (storage limitation + accountability) — https://gdpr-info.eu/art-5-gdpr/ ·
Art 6 — https://gdpr-info.eu/art-6-gdpr/ · Art 8 — https://gdpr-info.eu/art-8-gdpr/ · Recital 38 —
https://gdpr-info.eu/recitals/no-38/ · COPPA Rule §312.10 (2025) — https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule ·
Norway Personal Data Act §5 (13; 13→15 consultation) — https://lovdata.no/lov/2018-06-15-38

#### I-E4 — Minor double-billing at family-join  `[confirms §H Ripple 3 option B — CONDITIONED]`  *(PARAMETER + consumer-protection RULE)*

**Frame (locked):** EduAgent is **not the merchant of record** (Apple/Google are, via RevenueCat) → **cannot
claw back cash or proration-refund** the platform charge. That constrains the **cash remedy only** — it does NOT
touch the ability to (i) disclose, (ii) **prevent the overlap**, (iii) route to the platform's cancellation, or
(iv) make whole in **value** (credit/extend). **"We can do nothing" is false; "we can't refund cash as a
non-merchant" is the accurate narrow truth.** The legal wrong is **NOT a negative-option renewal by EduAgent**
(the platform runs that) — exposure is two things that bind EduAgent **as the trader who designs the join UX**:
**(1) a misleading omission** if the join flow lets a user walk into a double-charge without clear pre-action
warning; **(2) an unfair/aggressive practice exploiting a vulnerable consumer** if the design profits from a
minor's failure to cancel. Auto-renewal statutes set the **standard for "facilitate cancellation,"** not seller
status.

**STRUCTURAL CORRECTION (reframes the item):** a genuine **minor (<18) should not hold their own paid billing at
all** — no contractual capacity (Norway *vergemålsloven* §9) → under the family model **billing must sit with the
adult owner.** If a true minor is the named payer of the orphaned individual sub, the double-bill is a **symptom
of an upstream capacity defect (ties E0), not just a disclosure miss.** **Verify first whose instrument is
charged** — the minor's own Apple ID/card (**capacity defect, route to E0**) or an adult's card via Family
Sharing (**adult is de-facto payer → disclosure targets the adult**). That fork decides who you loop.

**(a) Disclosure standard — RULE: mandatory, pre-action, unavoidable, separately acknowledged.** Letting a user
join while their individual sub keeps running without a clear up-front warning is a **misleading omission.**
*basis:* EU **UCPD Art 7(1)–(2)**; Norway **markedsføringsloven §8** (villedende utelatelser — the omission hook,
distinct from the §§19–21 children chapter) + **§6**; UK **DMCC Act 2024 s.227** (misleading omissions; CPRs 2008
revoked + restated, in force 6 Apr 2025) + **s.230** (omission from an invitation to purchase — no transactional-
decision test); US **ROSCA §8403(1)** + FTC Act §5 + California ARL **§17602(a)(1)**. **Required content (plain,
judged at a minor's comprehension):** (1) joining ≠ stopping your current subscription; (2) you keep being charged
until it's cancelled; (3) we **cannot** cancel/refund it — it's billed by [Apple/Google]; (4) here's exactly how
to cancel — **one-tap deep-link to the platform Manage-Subscription screen + steps**; (5) until you cancel you're
**paying twice for the same access.** **Prominence (strictest live instrument = ROSCA/ARL "clear and conspicuous"
+ UCPD informed-decision):** **pre-action** (before join completes), **unavoidable + separately acknowledged**
(affirmative tap, never pre-ticked, never buried in T&Cs), **proximate + plain** (no "proration"/"billing cycle"
jargon). **Design AC:** the join flow renders the five-point warning as a **blocking, separately-acknowledged
step** with a working platform-cancel deep-link **before** join commits — **snapshot the rendered copy in a test**
so it can't regress to a buried link.

**(b) Minor-payer status raises the bar — on three axes:** (1) **comprehension benchmark drops to "the average
minor"** (UCPD **Art 5(3)** — not renumbered by the Omnibus; Norway **msfl §19** særlig aktsomhet + **§20(1)**) —
an adult-grade disclosure is **insufficient**; the test is whether a 14-yo understands and can act. (2) **No
exploitation of inertia** (msfl §6/§20 + the children chapter) — *precision:* the "direct purchase-exhortation to
children" ban (**msfl §20 2nd para + svartelisten FOR-2009-06-01-565 pt 28 = UCPD Annex I pt 28**) does **NOT**
bite (the minor already bought; no fresh exhortation) — but the **broader principle** (minors' commercial
vulnerability is presumed; a design profiting from a minor's failure to cancel is an unfair practice) means you
must **actively prevent**, not passively disclose-and-collect. (3) **Capacity — the original sub may be voidable**
(**vergemålsloven §9**; the pocket-money exception is **§12**, not §9; a recurring future-binding sub exceeds §12
→ needs guardian consent, else voidable with restitution) → strengthens the exit ("you may be able to dispute on
capacity grounds") and **requires looping the guardian** (who holds the capacity the minor lacks). ***angrerettloven*
interaction (don't overclaim):** the 14-day withdrawal right (§§20–21) runs **against the merchant of record, not
you**, and is **§22(n)-waivable** for digital content → for an existing sub typically lapsed + already waived;
**point to the platform's path, never represent it as something you grant.**

**(c) Is "keep paying until you self-cancel" lawful for a minor? RULE: NO as a bare design** — lawful **only when
wrapped in** prevention-or-affirmative-cancel-assist + minor-comprehension disclosure + guardian notification.
**(For an ADULT payer the bare "self-cancel + clear disclosure + cancel deep-link" IS lawful — no overlay.)** The
store constraint excuses the **cash refund**, not the **inertia-harvesting.** Conditions that make conditioned-
option-B lawful: **(i) Prevent the overlap first (primary duty, in your power)** — at join, detect via RevenueCat
that the member already holds an active individual entitlement, and **block the silent double-start or sequence
the join so the individual sub is addressed first** (UCPD Art 5(3); msfl §19 → don't let a minor walk silently
into a double-charge). **(ii) Affirmative cancel-assist (owed)** — one-tap deep-link to the platform's native
cancel screen + steps, at join and persistently; "as easy as signup," delivered via Apple/Google's native UI
(your duty = surface + don't obstruct, not build your own card-cancellation) — **ROSCA §8403(3); CA ARL
§17602(d)(1)/(f); NY GBL §527-a.** **(iii) Detect-and-nudge (owed for a minor)** — surface "you're covered twice
— cancel your individual plan" until resolved (reminder next app-open / 48–72h). **(iv) Guardian notification
(owed for a genuine minor)** — notify the family owner with cancel steps (capacity, §9/§12). **(v) Make-whole in
value (favoured)** — can't refund cash, but **credit/extend the redundant overlap or defer the family-side cost**;
at minimum don't compound the loss. **Per regime, same destination:** EU (UCPD unfair-practice + vulnerable
consumer); Norway (msfl §8 + §19 — the strict pole, "should"→"must"); UK (**DMCC Part 4 Ch 1 unfair-practices
live now; Ch 2 subscription easy-exit NOT in force, targeted Spring 2027** per the 2 Apr 2026 Govt response); US
(ROSCA + CA/NY ARLs). **None requires a cash refund as non-merchant; all forbid the passive-inertia design; the
minor overlay makes the wrapper mandatory.**

**⚠ THE GENUINELY UNSETTLED POINT (counsel flag):** **no statute/case/enforcement action squarely allocates the
IAP duty between developer and store.** Best-supported reading (NOT adjudicated): **disclosure + affirmative-
consent fall on the developer** (ROSCA "any person"; CA §17602 "any business" + §17602(a)(2) expressly reaches
charges to a "third-party account"); **cancellation = developer surfaces/deep-links the platform's native cancel +
doesn't obstruct.** Treat as best-supported, not settled law.

**Trip read: NO architecture reopens.** Confirms **§H Ripple 3 "option B / join-with-disclaimer" is viable —
CONDITIONED** on the prevent-or-assist + minor-comprehension disclosure + guardian-loop wrapper. **Bare option B =
unlawful for a minor; conditioned option B = lawful.** These are **acceptance criteria on the join flow, not a
redesign.** **Verify (build delta):** (1) does the app **detect the overlap** (active individual entitlement +
family membership) via RevenueCat, and is there an **in-app cancel deep-link** surface? If yes, prevent/assist/
nudge is wiring; if not, **that's the one small build item.** (2) **Whose instrument is charged** for the orphaned
sub — minor's own (**E0 capacity defect**) or an adult's via Family Sharing (**adult-targeted disclosure**).

**Monitors:** **E4-M1** US federal negative-option rule — FTC "click-to-cancel" **vacated in full** (8th Cir.
8 Jul 2025, *Custom Communication v FTC*); re-opened at ANPRM only (Fed Reg 13 Mar 2026, comments closed 13 Apr
2026) → **comply to ROSCA + CA/NY ARL baseline regardless; do NOT cite the dead rule**; trigger = FTC re-
promulgation or US entry. **E4-M2** UK DMCC Part 4 Ch 2 (subscriptions) — not in force, targeted **Spring 2027**
(pre-contract info, ~6-monthly reminders, two cooling-off periods incl. a **non-waivable renewal cooling-off,
pro-rata refund**, online easy-exit) — **unresolved whether duties attach to developer or store**; trigger =
commencement / UK launch. **E4-M3** State ARL wave + EU Digital Fairness Act — CA AB 2863 (live 1 Jul 2025), NY
GBL §527-a (live 5 Nov 2025), CO/MA same-medium cancel; EU DFA (dark-pattern/addictive/hard-to-unsubscribe, minor
focus — proposal not tabled, indicative Q4 2026, nothing in force before ~2028); Norway LOV-2025-06-20-41 adds
msfl §21 to the fine provisions (commencement "Kongen bestemmer"); trigger = any reaching in-force in a launch
market.

**Carry-forward:** (i) **architect/build:** wire RevenueCat overlap-detection + in-app platform-cancel deep-link
(the one small build item) + the blocking 5-point disclosure step with copy-snapshot test; (ii) **route the
minor-as-payer case to E0** as a capacity defect (billing belongs to the adult owner); (iii) PM logs the **bare-
option-B-is-unlawful-for-minors** constraint so the join flow ships with the wrapper.

**Sources (counsel, I-E4):** UCPD 2005/29 Art 5(3)/7 — https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32005L0029 ·
Norway *markedsføringsloven* §§6/8/19/20 — https://lovdata.no/lov/2009-01-09-2 · *vergemålsloven* §9/§12 —
https://lovdata.no/lov/2010-03-26-9 · *angrerettloven* §§20–22 — https://lovdata.no/lov/2014-06-20-27 · UK DMCC
Act 2024 s.227/s.230 + Part 4 — https://www.legislation.gov.uk/ukpga/2024/13/contents · ROSCA 15 USC §8403 —
https://www.law.cornell.edu/uscode/text/15/8403 · California ARL Cal. Bus. & Prof. Code §17602 —
https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=17602&lawCode=BPC · NY GBL §527-a —
https://www.nysenate.gov/legislation/laws/GBS/527-A · *Custom Communication v FTC* (8th Cir. 8 Jul 2025, click-to-
cancel vacated) — https://www.ftc.gov/legal-library/browse/rules/negative-option-rule

### Segment 3 — How young, and how verified?  *(counsel→specialist→judge pipeline; judge ruling authoritative; full trail in `counsel-walkthrough/SEGMENT-3-COUNSEL-ANSWERS.md`)*

> **REQ-2 LABEL-DRIFT RESOLVED (crosswalk):** the Phase-B counsel list below is namespaced **PB-B1 / PB-B2a /
> PB-B2b / PB-B3a / PB-B3b** so it never aliases the original 6-question register's B-series. Old↔new: "age
> floor"→PB-B1, "assurance"→PB-B2a, "boundary-crossing verification"→PB-B2b, "store-delegation liability"→PB-B3a,
> "age-signal ingestion"→PB-B3b.

**Session headline:** **There is NO legal minimum age of USE anywhere in EU/US/UK** — with genuine VPC (COPPA
§312.5) or EU/UK Art 8(2)-grade representative consent, **a child of any age (incl. an infant operated by a
parent) may lawfully be a supervised user.** The hard-coded "11" has **no legal mandate** — it's ours to set on
product/safeguarding/store-rating grounds, and **MUST ship with a written rationale** (UK Crime & Policing Act
2026 likely makes that a statutory record). **Verification strength is the load-bearing duty, not the age
number.**

#### I-PB-B1 — The real age floor  `[resolves FLAG-2; no ripple]`  *(RULE — judge: UPHELD-WITH-MODIFICATION)*

**NO LEGAL USAGE FLOOR.** With genuine VPC or Art 8(2) representative consent a child of any age may be a
supervised user; the regimes set consent **triggers** (COPPA under-13; contested ASAAs under-18) and design/
protection duties, **never an eligibility bar.** "11" has no legal mandate → a **product + safeguarding-capacity +
store-rating** choice that **must be documented**; **protection duties intensify as age drops and reach to 18**;
capacity-to-pay deferred to PB-B3a. **basis:** US COPPA 16 CFR §312.3/§312.5/§312.2/§312.10 + Cal. Civ. Code
§1798.120(c)/§1798.105 + NetChoice v Bonta (9th Cir., narrowed Mar 2026); EU GDPR Art 8(1)–(2)/Art 12(1)+Recitals
38/71/Art 25 + EDPB Statement 1/2025; UK UK-GDPR Art 8 (DPA 2018 s.9, consent age 13, DUAA 2025)/AADC 15-standards/
Age of Legal Capacity (Scotland) Act 1991 s.2(4A)/OSA HEAA (Ofcom 25 Jul 2025)+Crime & Policing Act 2026/UK-GDPR
Arts 22A–22D; cross-cutting EU AI Act Art 5(1)(b)/(f)+Annex III(3)(b)+Art 50 + App Store Accountability Acts (all
enjoined/delayed as of 2026-06-03) + Apple/Google age-rating/Declared Age Range; ROW India DPDPA 2023.

**FLAG-2 RE-ANCHOR:** the hard-coded "11" floor **AND surrounding copy CAN be removed** — the real defect is **the
absence of any documented basis for it**, not the number — **GATED on the app-store rating decision** (not a legal
line). **Before removing/lowering "11":** (a) settle the chosen content-rating / Declared-Age-Range posture +
confirm the lowered floor is consistent; (b) ship the new floor **WITH a written rationale** (product +
safeguarding-capacity + store-rating basis) **in the same change** — Crime & Policing Act 2026 likely makes that a
**statutory expectation**. Removing "11" without the documented rationale + store-rating alignment is itself the
cure-worse-than-disease path and may breach the UK written-record duty.

#### I-PB-B2a — Assurance level for VPC at the youngest ages  `[no ripple]`  *(RULE + PARAMETER — judge: UPHELD-WITH-MODIFICATION)*

**RULE: self-declaration is below the floor everywhere.** Because we **elect to treat each tutor turn as a COPPA
§312.2 third-party LLM disclosure**, the floor is a **disclosure-grade enumerated VPC method (NOT email-plus /
text-plus)**, obtained as a **separate per-purpose consent** in a purpose-naming notice, **re-verifiable at
withdrawal**, with **only a tokenised pass/fail retained (never stored ID)** — Art 5(1)(c) caps over-assurance.
**PARAMETER (deferred to procurement):** which enumerated method + which vendor. **basis:** US COPPA 16 CFR
§312.5(b)(1)/(b)(2)(i)–(ix)/§312.2/§312.5(a)(2) 2025 separate per-purpose VPC (FR 2025-05904)/§312.4/§312.6; EU
GDPR Art 8(2)+Recital 38 / EDPB Guidelines 05/2020 §7.1 / Art 5(1)(c)+EDPB Statement 1/2025 / Art 25 + AI Act
Annex III(3)(b)/Art 6; UK UK-GDPR Art 8 (DPA 2018 s.9)+AADC Std 3 (+Std 2 DPIA) / ICO Children's-Code age-
assurance opinion / OSA HEAA + Crime & Policing Act 2026.

#### I-PB-B2b — Boundary-crossing birth-year verification  `[no ripple]`  *(RULE + PARAMETER — judge: UPHELD-WITH-MODIFICATION)*

**RULE: an asymmetric, DIRECTION-AWARE gate keyed to three lines (under-13 / 13–16 / 18).** Non-crossing or
**protection-ADDING** edits **save on self-declaration**; a **protection-LOWERING crossing** (out of under-13,
across 13–16, or 17→18) **triggers verification proportionate to the line crossed, and the MORE-PROTECTIVE state
persists until it clears** (never optimistic-grant-then-clawback). A **genuine adult clears in one step (Art 16)**
and retains a complaint route; **retain prior value + audit-fact** (purge content per §312.10). **PARAMETER:**
exact assurance method, vendor-dependent, deferred. **basis:** US 15 USC §6502(a)(1)+16 CFR §312.3 (actual-
knowledge)/§312.2/§312.5(c) (2025 method list)/§312.10; EU GDPR Art 5(1)(c)+Art 25 / 5(1)(d)+Art 16 / Art 5(2) /
Art 8(2) / Recitals 38/71+Art 12(1) / EDPB Statement 1/2025; UK UK-GDPR Art 8+DPA 2018 s.9 / AADC Std 3+Std 1 (Std
4 transparency) / ICO Age-Assurance Opinion 2021 / Crime & Policing Act 2026 written-record duty (Monitor; OSA
demoted to directional Monitor).

#### I-PB-B3a — Store-delegation of payment liability  `[STRUCTURAL — RIPPLE FIRES → architect; reopens inv 17 v1.1]`  *(RULE + binary — judge: UPHELD-WITH-MODIFICATION)*

**BINARY: store approval of a minor's payment DOES NOT discharge our liability.** Store delegation covers **only
the payment-rail/transaction leg** (settlement, refunds, chargebacks, tax, purchase-capacity adjudication). **Four
obligations remain ours:** (1) the **COPPA/GDPR consent gate** (AI-tutor-blocked-until-VPC/Art 8 — mandatory,
independent of payment); (2) the **minor's contractual incapacity** (NO *vergemålsloven* §9 / UK Minors' Contracts
Act 1987 / US infancy doctrine); (3) **supplier-side withdrawal + digital-content conformity duties + unfair-terms
exposure** (survive merchant-of-record); (4) our **paywall/upsell copy to a minor** (independently regulated
marketing). **⇒ inv 17 v1.1's "no age gate of ours" OVERREACHES.** **basis:** US COPPA 16 CFR §312.2/§312.5(a)/
§312.4(d)/§312.5(b)(1) (non-delegable) + 2025 Rule (FR 2025-05904) + FTC Act §5 + COPPA §6505/§6502(c) + common-law
infancy/Cal. Fam. Code §6701; EU GDPR Art 4(7)/24/5(2) (controller-by-function, non-transferable) + Art 8/8(2)/
7(1) + Art 28(1)/(3)/(10)+Arts 44–49 + EDPB Guidelines 2/2019 + UCPD 2005/29 Annex I(28)+CRD 2011/83 Arts 9,16(m)+
DCD 2019/770+UCTD 93/13; cross-cutting Norway *vergemålsloven* §9+*markedsføringsloven* §20+*angrerettloven* §22n;
UK ICO Children's Code Annex C+Minors' Contracts Act 1987+AADC nudge/detrimental-use / DUAA 2025+CRA 2015 Pt 2.

**🚩 RIPPLE FLAG — READ ALOUD (the ONLY architecture ripple in the whole session — C2 and C4 both CONFIRMED their
invariants; B3a is the lone reopen):** B3a **REOPENS invariant 17 v1.1** ("payment is store-delegated; the store
is the sole capacity adjudicator; we impose no age gate of our own"). **Goes TO THE ARCHITECT; must NOT be
recorded as settled before that review.** inv 17 is sound **only** as to payment mechanics; it overreaches on the
four axes above. **Recommended architect resolution (counsel recommends, architect locks): REPHRASE inv 17 to
"store delegation covers payment mechanics only; the consent gate and the marketing/contract/withdrawal safeguards
remain ours" — NOT add a new payment-blocking age gate — PROVIDED the architect VERIFIES the consent gate fires on
the LLM-disclosure trigger (not the payment trigger) in EVERY flow** (solo teen; child-on-parent-phone via Family
Sharing; moved-country pause). **Also correct the "via RevenueCat" premise:** the merchant of record is **Apple/
Google alone**; **RevenueCat is our Art 28 processor (adds a DPA duty), it does NOT absorb liability.** *(Carry to
the architect alongside the Segment-1 deletion items — though note C2 itself did not ripple — so the inv-17
rephrase is resolved in one pass before anything is final.)*

#### I-PB-B3b — Platform age-signal ingestion  `[no ripple]`  *(RULE-with-duties + MONITOR — judge: UPHELD-WITH-MODIFICATION)*

**LAWFUL WITH DUTIES:** ingesting + reconciling the platform Declared Age Range **stricter-wins (D4)** is
**permitted and privacy-preferred — but ROUTING-ONLY.** It can decide **which gate fires**, **NEVER** substitute
for VPC/Art 8(2) before the LLM disclosure. Carries its **own Art 14 source-disclosure notice** + a **named Art 6
basis** + accuracy/minimisation + the **new TX/UT developer parental-consent duty.** **basis:** US COPPA 16 CFR
§312.5(a)(1)+§312.2 / §312.5(b)(2)/(b)(3) (non-exhaustive; signal ≠ VPC) / actual-knowledge §312.2/§312.3 / Texas
SB 2420 (eff 1 Jan 2026)+Utah SB 142 (7 May 2026)+Louisiana 2025 / NetChoice v Bonta; EU GDPR Art 6(1)(c)/(f)+EDPB
Guidelines 1/2024 / Art 14 incl. 14(2)(f)+14(3) / Art 5(1)(d)+(c) / Art 25+Recital 38 / Art 22+Art 4(4) (not
engaged) / Art 8(2) / EDPB Statement 1/2025; UK ICO Age-Assurance Opinion (Oct 2021) / AADC Std 1/3/4/7 / UK-GDPR
Arts 12–14 (DUAA 2025)+DPA 2018 s.9 / OSA HEAA (conditional) / Crime & Policing Act 2026 (emerging).

**Segment 3 ACTION ITEMS:** (1) replace "11" + write its rationale, **gated on the store-rating decision**; (2)
spec VPC at **disclosure-grade with tokenised non-retention**; (3) build the **asymmetric birth-year gate**; (4)
**send the inv-17 rephrase to the architect** (the lone ripple); (5) **wire the consent gate to fire on the
LLM-disclosure trigger (not payment) in every flow**; (6) RevenueCat = Art 28 processor → **add a DPA duty**.

**Sources (counsel, Segment 3 — full citation trail in `SEGMENT-3-COUNSEL-ANSWERS.md`):** COPPA 16 CFR Part 312 /
FR 2025-05904 · GDPR Arts 4(7)/5/8/24/25/28/44–49 + EDPB Guidelines 2/2019, 05/2020, 1/2024 + Statement 1/2025 ·
EU AI Act Arts 5/6/50 + Annex III(3)(b) · UCPD 2005/29 / CRD 2011/83 / DCD 2019/770 / UCTD 93/13 · Norway
*vergemålsloven* §9 / *markedsføringsloven* §20 / *angrerettloven* §22n · UK DPA 2018 s.9 / AADC / Minors'
Contracts Act 1987 / CRA 2015 Pt 2 / DUAA 2025 / Crime & Policing Act 2026 / OSA HEAA · Age of Legal Capacity
(Scotland) Act 1991 s.2(4A) · Texas SB 2420 / Utah SB 142 / NetChoice v Bonta (9th Cir.) · Cal. Civ. Code
§1798.105/§1798.120(c) / Cal. Fam. Code §6701 · India DPDPA 2023.

### Segment 4 — Cross-org & lifecycle

#### I-D1 — Cross-org consent  `[STRUCTURAL → architect; the session's 3rd ripple, verified from schema]`  *(RULE)*

**(a) Precedence — the "second org's admin gets control" instinct is BACKWARDS.** The **child is the data
subject in every org.** The governing basis traces to the **holder of parental responsibility (or competent
teen) per purpose** — it **does not migrate/transfer/inherit** to a second org. A second org acquires **no
authority/ownership — only controller DUTIES if it sets purposes/means** (controllership is a **burden, not a
grant**; "the authority it gains is the authority to be held accountable"). Purpose-by-purpose, not blanket
(Art 5(1)(b)+6(4), strict for children, Recital 38): family-tutoring-consent data **cannot be repurposed** by a
second org without a fresh basis **sourced from the guardian/teen, never the org admin.** Ties C4 (parent never
*owns* → a second org, further from the child, cannot either). **basis:** GDPR Art 8 (authorize ≠ own); Art
4(1)/(7); Art 5(1)(b)+6(4)+Recital 38.

**(b) External tutor = third-party disclosure → independent/joint CONTROLLER (resolves A1-M3).** A genuine
external tutor (not co-guardian, not on the family account) viewing the child's work is a **disclosure** needing
its **own basis + Art 14 notice + (COPPA 2025) a separate opt-in VPC for disclosure** (the internal-operations
exception is **unavailable**); the tutor **decides what to review/how to assess/keeps notes → independent or
joint controller (Art 26), NOT a processor** (Art 28 only if genuinely pure-instructions). **The actor axis is a
2×2, not a binary:**

| Second-org actor | Below-consent-age child | Competent teen (13–17) |
|---|---|---|
| **Co-guardian on same family account** (E12 v1) | within the family-account authorization umbrella → no new third-party disclosure (if the actor is an actual HPR) | **disclosure engaging the TEEN's own rights — parent has NO automatic access** (Gillick / Scotland 12+); E12 v1 must respect the teen's basis, not assume the parent's |
| **External tutor org** | third-party disclosure; own basis; independent/joint controller | same + the teen's own consent/rights, not only the guardian's |

**⚠ Trap:** do **NOT** lean on the GDPR **household exemption (Art 2(2)(c))** — it covers a natural person's
purely personal activity, **not a commercial operator's processing**; the co-guardian carve-out rests on the
shared family-account authorization and **dissolves the moment the child is a competent teen.** **basis:** Art
4(7)/(8), Art 6, Art 14, Art 26, Art 28, Art 2(2)(c) (inapplicable); COPPA 2025 separate-VPC-for-disclosure;
Gillick / Scotland AWI 12+.

**(c) Can the model express it? NO — VERIFIED FROM SCHEMA → architect flag (the session's 3rd ripple).** The
lawful structure from (a)+(b) needs **≥2 simultaneous org-scoped governing bases per child + per-org withdrawal
+ a controller-role record for external tutors.** The ontology supports **none:**
- `consent_states` **UNIQUE(profileId, consentType)** (`profiles.ts:357-361`) → **one consent per (child,type);
  a second governing consent has nowhere to live**; single nullable `parentEmail` (`:324`), **no
  `organizationId`, no grantor/recipient/controller-role relation.**
- **No link from consent to `memberships`** → consent **cannot be scoped to "org A but not org B"**; revoke is a
  **global all-or-nothing flip** (`consentActionResultSchema`, `consent.ts`).
- **No external-tutor/independent-controller concept** → nothing records a third party's own basis/controller
  role, the Art 26 arrangement, or Art 14-notice state.
- `organizations`/`memberships` are **unwired T1 scaffolding** (org ≡ account backfill `:135-144`, **no RLS — a
  T3 obligation** `:141-144`). T1 added nullable `organizationId` to **`subscriptions`** (`billing.ts:45`) but
  **pointedly skipped `consent_states`** → the single-org consent model is **by construction, not oversight.**

**This is a genuine architect-level gap**, entangled with the in-flight T1→T3 identity migration and the ratified
`_wip/identity-foundation/` model, and it **multiplies the C1 cascade defect** (a per-org multi-row consent model
expands the audit-loss surface across every org relationship **unless the C1 receipt-preservation fix lands
first**). **NOT a local consent-table tweak** — touches RLS scoping, `family_links`↔`memberships`, account-
deletion cascades, the C1 defect, and V0/V1 identity. **Adding `organizationId` to consent while leaving the
UNIQUE constraint + unwired RLS in place = the PR-376 half-migration anti-pattern.** **Deliverable = the flag +
verified surface map; the design is the architect's** (needs full deep-scope enumeration + sign-off before any
schema touch).

**Monitor D1-M1:** consent-ontology adequacy across the T1→T3 migration (instrument: `_wip/identity-foundation/`
+ the memberships-RLS T3 obligation `profiles.ts:141-144` + the C1 cascade fix). **Revisit trigger: BEFORE any
feature ships that puts a child's data in a second org (E12 v1 family-join, or any external-tutor/group feature)
— the basis layer must hold ≥2 org-scoped consents + per-org withdrawal + a controller-role record first.**

**Get-real-counsel:** confirm the external-tutor controller-vs-processor characterization against the actual
intended tutor relationship (a UI-only, keeps-nothing, documented-instructions tutor genuinely *is* a processor →
Art 28 not 26); confirm whether E12 v1 intends a **competent teen to withhold parent visibility** (if so the 2×2
top-right cell is **load-bearing, not edge**); re-pull COPPA 2025 separate-VPC text at opinion time.

**D2 (graduation & legacy data) — substantially pre-answered by C4(b):** at graduation the now-competent person
gets erasure reach over the whole corpus incl. the managed-child portion; parent entitlement falls away on
competence; **basis re-ground is CONDITIONAL** (required only where the sole basis was parental Art 8 consent;
contract/LI continue, Art 7(3)); **re-point control in place, never fork** (inv-20). No separate ripple.

**Sources (counsel, I-D1):** GDPR Art 8 — https://gdpr-info.eu/art-8-gdpr/ · Art 4 — https://gdpr-info.eu/art-4-gdpr/ ·
Art 5(1)(b)/6(4) — https://gdpr-info.eu/art-5-gdpr/ · Art 14 — https://gdpr-info.eu/art-14-gdpr/ · Art 26 —
https://gdpr-info.eu/art-26-gdpr/ · Art 28 — https://gdpr-info.eu/art-28-gdpr/ · Art 2(2)(c) —
https://gdpr-info.eu/art-2-gdpr/ · Recital 38 — https://gdpr-info.eu/recitals/no-38/ · COPPA Rule §312.5 (2025) —
https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule · Code:
`packages/database/src/schema/profiles.ts:145-369`, `billing.ts:45`, `packages/schemas/src/consent.ts`,
`learning-profiles.ts:36-41` (verified 2026-06-03).

---

### §I — CODE-VERIFICATION LOG  *(the "verify, don't trust" record — every load-bearing premise checked in code, not assumed)*

Seven load-bearing factual premises underpinning the §I rulings were verified against source. **One was false
(GATE-1 keystone) — the rest confirmed; one contradiction resolved.** This log is the audit trail for which
legal conclusions rest on verified code vs. unverified assertion.

| # | Premise (whose ruling depends on it) | Verdict | Evidence |
|---|---|---|---|
| V1 | LLM routing is age-gated → only Gemini sees child data (GATE-1 / A2) | **❌ FALSE** | tier-keyed, no age input (`session-exchange.ts:215-257`); children reach all 3 vendors → keystone refuted, fix re-ranked |
| V2 | Consent-pending holding state collects nothing (E3) | **✅ SOUND** | hard 403 `consent.ts:185-199`; static UI; no analytics/Sentry/session-write; push-token blocked. (Also: no moved-country suspension state exists yet) |
| V3 | Guardians see derived data only, never raw transcript (E2 OSA out-of-scope) | **✅ SOUND** | `dashboard.ts:1350-1354` + all parent→child paths project derived-only; sole raw-`.content` path is self-scoped. **Needs the named guard test to stay enforced** |
| V4 | Age/birthYear is/ isn't sent to the LLM (contradiction; GATE-1 inventory / E5 DPIA) | **RESOLVED → Read B** | age consumed locally by `getAgeVoice` (`exchange-prompts.ts:47-81`); **egress is WIDER than stated** — name, transcript, pronouns, memory facts (struggles/interests → Art 9-adjacent), mastery, vocab, accommodation |
| V5 | No `lawfulBasis`/`termsAccepted` field anywhere (A2 — holding moot until built) | **✅ CONFIRMED** | `profiles.ts:71-133` + `consent_states` store status/type/audit only, **not the basis**; A2 accountability capstone genuinely absent |
| V6 | C1 consent-cascade destroys the receipt across 3 paths (C1/C2/A2 spine) | **✅ CONFIRMED** | `onDelete:'cascade'` `profiles.ts:319-321`; write-then-delete same txn `consent.ts:898-901`; 3 paths (`consent.ts`, `deletion.ts:288-315`, `archive-cleanup.ts:30-52`); **no retain-tier** |
| V7 | C4 defects: parent read ungated / no competent-minor self-erasure / no consent refresh | **✅ ALL CONFIRMED** | parent paths use ownership+link only (`dashboard.ts:79-427`); `assertCanManageOwnConsent` hard-gates <18 (`family-access.ts:76-106`); no competence marker (`profiles.ts:71-133`); no age-transition refresh (`consent.ts`) |

**Lesson (carry into the DPIA):** of 7 premises, **1 was false and 1 was a misstatement that broadened the risk**
— a 2-in-7 "trust would have been wrong" rate. Every legal conclusion resting on "the code does X" was checked;
**the same discipline applies to the DPIA's own factual assertions before launch.**

### Segment 5 (capstone) — the launch gate

#### I-E5 — DPIA as the launch gate  `[RULE + GATE — the wrapper every §I answer feeds; confirms I-0.1]`

**(a) SCOPE — confirmed + augmented.** All 8 corpus rows are in-scope; **each must be wrapped in the Art 35(7)
four-part structure** — (a) systematic description + purpose, (b) necessity & proportionality, (c) risk to
rights, (d) mitigations — **the §I table is only the (c) inventory; the author still owes (a)/(b)/(d) per row.**
**Art 35(9)** duty to seek the 11–17 cohort's views is **qualified ("where appropriate")** → pre-launch with no
live users, the route is **representative consultation** (parent/guardian + child-safety/education expert or
youth panel), **method + justification documented.** **AUGMENTATIONS (risk surfaces the corpus didn't name):**
**A9** incidental special-category in free-text (health/SEN/religion piped to US LLMs — the **pivotal fact:**
whether Art 35(3)(b) + DPO Art 37(1)(c) even engage turns on whether chat/voice is processed as Art 9 data);
**A10** prompt-injection / cross-user surfacing (Art 32 confidentiality harm); **A11** vendor-side log retention
(OpenAI ~30d / Vertex ~90d / Anthropic up to 2y on flagged content — a transfer+retention+erasure surface row 1
misses); **A12** Art 22 ADM — adaptive steering of a child's education arguably has "similarly significant
effects" (likely mitigated by human-override-everywhere, but the **finding must be explicit**); **A13** safety/
distress detection (if built = its own sensitive op + escalation path); **A14** Art 50 transparency — **in scope
NOW (2 Aug 2026, not deferred).**

**(b) GATE — confirmed; timeline corrected; FRIA reframed.** DPIA gates launch (Art 35(1)/(3)(a); WP248 3+
criteria — profiling/children/innovative-tech; Datatilsynet Art 35(4) list verified covers AI+children+large-
scale-profiling; ICO list; AADC Std 2 under-18 + extraterritorial to UK-accessed children). **Trigger = first
real child's data at scale, NOT the paywall — the free tier is not DPIA-exempt.** **Re-layered gate:**
1. **DPIA complete + residual risk acceptable — before first real child. HARD GATE. Now.**
2. **Art 36 prior consultation with Datatilsynet — CONDITIONAL; design it OUT.** Required only where high
   *residual* risk survives mitigation (Art 36(1)) — **not automatic.** Given open blockers (no Chapter V papered;
   children reaching all 3 vendors) residual high risk is plausible → **engineer below the threshold.** If it
   fires: ~8 wks + 6 wk extension = **~14 wks**, suspendable; lead = **Datatilsynet** (one-stop-shop).
3. **AI Act LIVE NOW (not deferred):** **Art 5 prohibitions** (the E1-bis emotion-inference invariant lives here;
   Omnibus *expanded* not relaxed; €35M/7% top tier) + **Art 50 transparency** (2 Aug 2026, untouched; only the
   synthetic-media watermark sub-duty gets grace to ~2 Dec 2026) + **GPAI** (live 2 Aug 2025, flows through the
   vendor diligence chain).
4. **AI Act high-risk PROVIDER conformity regime — DEFERRED, NOT a mid-2026 launch gate.** Annex III(3)(b)
   classification holds; **Art 6(3) self-exemption FORECLOSED — decisive ground is the per-se rule (final
   subparagraph: "shall always be high-risk where the system performs profiling")**, triggered by the
   longitudinal learner record (the "steering is significant" point is sound but the *profiling* rule is the
   operative hook). **Digital Omnibus on AI (provisional agreement 7 May 2026) moves standalone Annex III
   application 2 Aug 2026 → 2 Dec 2027** (fixed backstop + "earlier-of" Commission-readiness fast-track + 6-mo
   transition). **CAVEAT: not law until OJ publication (expected before 2 Aug 2026); until then the un-amended
   2 Aug 2026 date technically still stands.** **Plan to 2 Dec 2027, scaffold now, don't gate mid-2026 launch on
   it.**

**FRIA (Art 27) — DOES NOT STACK for B2C.** Art 27 is **deployer-side**, binding a closed set: public-law bodies
/ private entities providing public services, and deployers of Annex III 5(b) credit / 5(c) insurance systems —
**a private B2C self-operated tutor is none** (even as its own deployer, no trigger). **Omnibus did NOT delete
Art 27.** **Trip-wire = roadmap D1: once a public school deploys the app, the school owes the FRIA and EduAgent
could be argued a "private entity providing a public service"** (Recital 96 names education). **"Doesn't stack
now, watch D1."** **THREE DISTINCT INSTRUMENTS — do not collapse:** Art 9 RMS (continuous lifecycle engineering
risk system) ≠ Art 27 FRIA (the actual fundamental-rights assessment — doesn't bind you) ≠ GDPR Art 35 DPIA
(does). Different triggers/addressees/dates. **Run ONE integrated risk workstream PRODUCING separate, separately-
defensible artifacts** — the GDPR DPIA now, the Art 9 RMS scaffolding ahead of Dec 2027. *(Corrects the earlier
"Art 9 RMS ≈ a fundamental-rights DPIA" slip.)*

**(c) RESIDUAL GAP-LIST — what the DPIA author still needs that §I didn't supply:**
**BLOCKERS (the residual-risk verdict + any Art 36 trigger depend on these):**
1. **Per-vendor Chapter V transfer mechanism** — #1 unresolved. **Verified vendor reality: only Google LLC is
   DPF-certified; OpenAI + Anthropic are NOT → both transfer under SCCs + TIA** (OpenAI via OpenAI Ireland).
   **DPF was UPHELD** (Gen Court dismissed *Latombe* T-553/23, 3 Sep 2025; valid + in force) but under **CJEU
   appeal C-703/25 P** (Schrems-III tail risk, not a present defect) → **resilient floor = SCCs + TIA per vendor
   for ALL incl. Google, plus an executed Art 28 DPA** (separate deliverable, B3). **OpenAI Under-18 API guidance
   makes ZDR a mandatory precondition for minors' data** (never default; residual safety logs survive).
2. **Minor-status routing gate** (GATE-1 row 8) — pin minors to a constrained/papered endpoint set; **the DPIA
   can't score residual transfer risk without it.**
3. **The 3 live C1 deletion defects** — fixed (retain-tier upstream capture + guard test) or documented accepted-
   risk-with-dated-remediation (aligns to COPPA written retention-policy requirement).
4. **Consent-model + lawful-basis build (A1/A2)** — per-purpose model + recorded basis don't exist; until built
   the Art 5(2)/7(1) gap is a **live finding, not a mitigation.** Free tier needs the same basis discipline.
**CONTENT GAPS (author must write — §I gave rules, not the analysis):** 5. **necessity & proportionality of the
LLM payload** (Art 35(7)(b) — redact/pseudonymise/on-device pre-processing; the single most-scrutinised section
for children+LLMs); 6. **Art 9(2) condition for incidental special-category** (A9) + **evidence the
transcription-only invariant in the DPIA** (if voice is transcription+functional-labels-only, Art 35(3)(b) is
NOT the mandatory basis and DPO 37(1)(c) isn't the trigger — 37(1)(b) is); 7. **Art 22 analysis of adaptive
steering** (A12); 8. **vendor-side logging/retention per vendor** (A11) + contractual no-training confirmation;
9. **security program — Art 32 + COPPA §312.8 written info-security program** (designated owner, ≥annual risk
assessment) — **22 Apr 2026 compliance deadline ALREADY PASSED → a PRESENT launch blocker, not a roadmap item**
(US under-13 cohort in scope); 10. **Art 50 transparency** (A14) — in scope now.
**PROCESS GAPS:** 11. **DPO appointment — Art 37(1)(b) MANDATORY, not "recommended"** (the adaptive engine's
continuous reading of learner performance = regular+systematic monitoring as a core activity; "no users yet"
doesn't defer it; the DPIA needs a named owner); 12. **Art 35(9) data-subject consultation plan** (the
representative mechanism + documented justification).

**CAPSTONE CONSEQUENCE:** because the DPIA's residual-risk verdict (and any Art 36 consultation) depends on
blockers 1–4, **E5 transitively makes the A1, A2, C1, B3-3a and GATE-1 builds ALL launch-blocking.** The gate is
not "write the DPIA" — it is **"DPIA complete and residual risk acceptable (or Datatilsynet prior-consultation
done),"** unreachable until those builds land. **The AI-Act high-risk conformity regime sits behind launch on the
2 Dec 2027 horizon (scaffold, don't gate); live AI-Act at launch = Art 5 (emotion-inference invariant) + Art 50
transparency + GPAI/processor chain.**

**Monitors:** **E5-M1** EU-US DPF durability (valid + upheld *Latombe* 3 Sep 2025, under CJEU appeal C-703/25 P —
**SCCs+TIA floor for every US vendor incl. Google**; re-check before DPIA sign-off). **E5-M2** AI-Act high-risk
timeline (Omnibus 2 Aug 2026 → 2 Dec 2027, binding on OJ publication; fixed backstop + earlier-of fast-track;
scaffold the Art 9 RMS now; trigger = OJ publication / readiness decision / the date). **E5-M3** vendor minors-
data terms (OpenAI ZDR mandatory before minors' data; Anthropic 2y on flagged even under ZDR; Vertex ZDR by DPA
amendment only; confirm executed-contract figures before relying on them).

**Counsel note:** the only point on contested/moving law is the Omnibus date — provisionally agreed, not yet
published; frame the high-risk horizon as **"expected 2 Dec 2027, pending publication,"** not a done deal.

**Sources (counsel, I-E5):** GDPR Art 35 — https://gdpr-info.eu/art-35-gdpr/ · Art 36 — https://gdpr-info.eu/art-36-gdpr/ ·
Art 37 — https://gdpr-info.eu/art-37-gdpr/ · Art 22 — https://gdpr-info.eu/art-22-gdpr/ · Art 9 —
https://gdpr-info.eu/art-9-gdpr/ · WP248 DPIA guidelines — https://ec.europa.eu/newsroom/article29/items/611236 ·
COPPA §312.8 security program / §312.10 retention (FR 2025-05904) — https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule ·
EU AI Act Art 5/6(3)/16/27/50 + Annex III — https://artificialintelligenceact.eu/ · Digital Omnibus on AI (7 May
2026 provisional agreement) — https://www.consilium.europa.eu/en/press/press-releases/2026/05/07/ · EU-US DPF +
*Latombe* T-553/23 (Gen Court 3 Sep 2025) / C-703/25 P (CJEU appeal) — https://curia.europa.eu/ · ICO DPIA /
AADC Std 2 — https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/

#### I-C1 — Retention, deletion & erasure carve-out  `[STRUCTURAL → data model]`  *(RULED + PARAMETERS + MONITORS + 1 live defect + 1 architect heads-up)*

**Governing distinction (corrected from a first pass that collapsed two axes):** **WHAT survives a deletion**
= the carve-out categories, driven by legal-obligation overrides to erasure — **universal** (same for child,
teen, solo adult). **WHEN the learning tier is purged** = the deletion clock — **banded** by age / lawful
basis. Strictest-of-three governs the *survivor ceiling*, **not** the *purge clock*; universalising the child
clock is the Bucket-2 trap. **basis:** GDPR Art 5(1)(c)/(e); COPPA §312.10; EDPB Statement 1/2025.

**A — Survivor set (universal RULES — what must outlive an erasure), each minimised + isolated + time-boxed to its own clock:**

| # | Survivor | basis | clock | minimise to | in code? |
|---|---|---|---|---|---|
| **S1** | Financial / bookkeeping | Art 17(3)(b) + 5(1)(e); tax law | **Param** — NO *Bokføringsloven* §13 = 5y (assumed) | entitlement/transaction IDs + amounts, **account-level** | ✅ `billing.ts:37` → on `accounts`, survives profile delete. **Build the seam at account deletion, not profile** |
| **S2** | Consent receipt + withdrawal proof | Art 5(2) + 7(1) + 7(3); COPPA §312.5; EDPB 05/2020 | longest applicable limitation | ISO/IEC TS 27560:2023 receipt, keyed to parent identity + **opaque child ref** | ❌ destroyed by defect **(E)** |
| **S3** | Deletion audit-trail | Art 5(2); COPPA §312.6 | as S2 | pseudonymous token; never re-store identifying data | ❌ destroyed by defect **(E)** |
| **S4** | Breach documentation | **Art 33(5)** — document all breaches incl. unreported; must outlive the erased data | breach-register policy | facts / effects / remedial action, pseudonymous subject ref | ❌ not addressed |
| **S5** | Safety / illegal-content *(conditional — incident-triggered only)* | Art 17(3)(e); UK Crime & Policing Act 2026 (RA 29 Apr 2026); US NCMEC | the specific reporting regime | only the flagged records, only when an incident exists | ❌ to build; **Monitor** secondary regs |
| **S6** | Age-assurance evidence | Crime & Policing Act 2026 "highly effective age assurance" + written records; EDPB Statement 1/2025; OSA | per secondary regs | over/under **token** + method + timestamp — **not** stored ID scans | ❌ to build; **Monitor** |
| **S7** | Suppression / do-not-recreate marker *(corrected)* | ICO/EDPB give-effect-to-erasure | indefinite (minimal) | **keyed HMAC w/ secret salt or random surrogate — NOT `hash(email)`** | ❌ to build |
| **S8** | Legal-hold capability *(design hook)* | Art 17(3)(e) generalised — any category, incl. learning tier, must be freezable for a live/anticipated claim | duration of the hold | a `legal_hold` flag that **blocks every delete path** | ❌ no flag exists (verified) |

*Why S7 is corrected:* a one-way hash of a low-entropy identifier (email) is brute-forceable → stays
pseudonymous = personal data under Recital 26; a naïve `hash(email)` suppression marker is itself retained
child PII, defeating its own minimisation. *Non-survivor:* truly anonymised aggregates (Recital 26,
irreversible) — keep, but **derive before deletion** and beware re-identification at small cohorts (a single
Norwegian 12-year-old studying Japanese is re-identifiable).

**B — Purge + the BANDED clock (PARAMETER).** Purge = learning tier (tutor transcripts, sessions, assessments,
embeddings, progress, derived inferences) + profile PII beyond the minimised receipt. *(All four learning
tables verified `onDelete: 'cascade'`.)* Clock — **do not pin to the strictest:**

| Band | Clock | basis |
|---|---|---|
| **Under-13** | aggressive proactive deletion on a **documented schedule** | COPPA §312.10 — compliance deadline **22 Apr 2026 PASSED → live now**; strictest driver |
| **13–17** | minimisation-driven moderate retention | Art 5(1)(e) + UK AADC |
| **Adult (solo owner)** | lawful longer retention for the live product purpose; delete on dormancy/request | Art 5(1)(e) — adults give lawful latitude; discarding it is self-harm, not protection |

Trigger = **purpose-exhaustion (sustained dormancy), NOT relationship-end.** A learner who detaches from a
parent account but keeps studying retains a live purpose → no compelled deletion.

**C — Strictest-of-three lines (banded):** child default — purge learning tier promptly + on a documented
schedule, retain only S1–S8; adult default — retain learning tier for the live product purpose, delete on
dormancy/request, **same S1–S8 ceiling**; survivor set identical, purge clock differs by band.

**D — STRUCTURAL → data model (the seam to encode):** a **retain-tier physically separate** from the deletable
profile; per-survivor `retention_expires_at` + `clock_driver`; a `legal_hold` flag blocking every delete path;
a **band-aware purge clock**; a **category-aware deletion routine** replacing today's single blanket cascade.
Schema today has none of this (only `archivedAt` soft-delete + `session_summaries.purgedAt`) — verified.

**Architect heads-up [escalate async — NOT a ripple]:** the legal ruling is **in-phase** (a data-model
constraint; no locked decision reopened — the ruling itself doesn't need architect sign-off). But the *fix* is
a **new retention-classification subsystem** (3 tiers × clock × `legal_hold` × banded clock × category-aware
delete across 3 delete paths) — bigger than "exclude one cascade." Flag the **scope** to the architect.

**E — Confirmed live DEFECT [log as defect, not a question]:** `consent_states.profileId` carries
`onDelete: 'cascade'` (`profiles.ts:321`). `processConsentResponse` writes the denial's Bug-#872 audit
metadata (`policyVersion`/`requestIp`/`userAgent`, `profiles.ts:347-349` — the exact Art 7(3) "stopped
lawfully" proof) then `tx.delete(profiles)` one line later (`consent.ts:899-900`) → the cascade **destroys S2
+ S3 at the instant they're created**, on the very event (denial/withdrawal) that most attracts regulatory
interest. **Three delete paths do this — fix is a sweep, not a one-liner:** (1) `processConsentResponse`
synchronous denial (`consent.ts:900`); (2) `deletion.ts` `deleteProfileIfConsentWithdrawn` /
`deleteProfileIfNoConsent`; (3) `archive-cleanup.ts` Inngest (30-day window; withdrawal path = 7-day grace →
archive → 30-day cleanup). No pre-delete preservation exists anywhere (verified). **Fix:** exclude
`consent_states` from the profile cascade, **or** copy receipt + deletion-audit into the retain-tier inside
each transaction before the delete — applied across all three paths, **with a forward-only guard test.**

**F — Open PARAMETERS (don't block the seam):** (1) incorporation/tax seat → S1 financial clock (Norway
*Bokføringsloven* §13 = 5y assumed; confirm before locking); (2) claims-limitation period per regime → S2/S3
clocks (UK 6y *Limitation Act 1980*; Norway 3y general, *foreldelsesloven*); (3) dormancy clock per band →
**defer to C3**; (4) AI-Act classification of the tutor (Annex III(3) vs Art 6(3) carve-out) → separate
question, determines whether learning-tier processing logs are themselves high-risk-retained.

**G — MONITORS:** **M1 — DUAA 2025** (RA 19 Jun 2025, staged commencement): confirm post-DUAA Art 17 / SAR
text before locking UK parameters. **M2 — UK Crime & Policing Act 2026 secondary regs:** age-assurance + safety
-record retention detail; SoS report due 31 Dec 2026. **M3 — EU AI Act:** Annex III(3) classification + Art
6(3) carve-out; high-risk obligations + Art 50 transparency apply **2 Aug 2026**; revisit trigger = Commission
Art 6 classification guidelines.

**Carry-forward:** S1–S8 categories → **data-model phase design constraint** (the retain/purge seam). The
consent-cascade **defect (E)** → log as a bug + forward-only guard test. **Does NOT ripple** to the architect
on the *legal* axis (in-phase); the *subsystem scope* is the only architect touch.

**Sources (counsel, I-C1):**
- eCFR **§312.10** (COPPA retention/deletion) — https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312/section-312.10
- GDPR **Art 33(5)** (breach documentation) — https://gdpr-info.eu/art-33-gdpr/
- EDPB **Statement 1/2025** (age assurance) — https://www.edpb.europa.eu/our-work-tools/our-documents/statements/statement-12025-age-assurance_en
- UK **Crime & Policing Act 2026** (Bird & Bird) — https://www.twobirds.com/en/insights/2026/uk/uk-government-children's-safety-and-ai-chatbot-powers-two-new-acts-receive-royal-assent
- **DUAA 2025** (ICO) — https://ico.org.uk/about-the-ico/what-we-do/legislation-we-cover/data-use-and-access-act-2025/the-data-use-and-access-act-2025-what-does-it-mean-for-organisations/
- EU **AI Act Art 6** — https://artificialintelligenceact.eu/article/6/ · **Art 50** — https://artificialintelligenceact.eu/article/50/
- **ISO/IEC TS 27560:2023** (consent receipt) — https://www.iso.org/standard/80392.html

*(Mirrored in `counsel-walkthrough/SOURCES.md`, the running source list for the whole session.)*

#### I-C2 — Guardian-initiated child erasure  `[STRUCTURAL → tested architecture; confirms inv-21, no reopen]`  *(RULE — split binary)*

**BINARY — split, and it must stay split:**
- **The OPERATION is lawful (YES, conditioned).** A holder of parental responsibility (HPR) deleting a genuine
  **below-consent-age** child's learning data, on the child's behalf, as a deliberate, best-interests,
  export-first, audited act, is **permissible across EU/UK/US**. For the **under-13** cohort it is **more than
  permitted — once the sole consenting parent withdraws, erasure of the learning data is arguably *obligatory*
  and self-executing**, not a favour.
- **THIS codebase's delete is NOT lawful as built (NO).** The same delete path **over-deletes** records the law
  requires retained, **doesn't enforce the export** it claims to offer, and **records no actor audit**. The
  operation's lawfulness does **not** cure the implementation.

**Trigger read:** the *operation* answer is **YES-conditioned → inv-21 / §H Ripple 2 CONFIRMED; no new
architecture reopens.** The explicit, authority-held, audited deletion is a distinct permitted operation, not
the silent cascade. The **"NO as built"** is an **implementation-compliance** fact, not an architecture-reopen
— it resolves through the **C1 retain-tier (already mandated) + the delete-flow gates below**. **C1 is now
load-bearing for C2.**

**basis — per regime:**
- **EU / GDPR — representative-capacity erasure, arguably obligatory.** The right belongs to the **child**; the
  HPR exercises the child's **Art 17** right as a **fiduciary representative in the child's best interests**
  (EDPB Guidelines 01/2022 §3.4 paras 84–85; Recital 38) — a parent deleting to spite a co-parent / sever ties
  is the **conflict-of-interest trigger** that blocks proxy exercise. Trigger = **Art 17(1)(b)** (consent
  withdrawn, no other basis) / **17(1)(f)** (Art 8 child-offer data); the departing sole consenting parent =
  withdrawal of the Art 8 consent that was the sole basis (**Art 7(3)**). **Obligatory, not discretionary:**
  once the sole basis collapses, 17(1)(b) is self-executing "without undue delay"; **Art 5(1)(e)+(c)** +
  Recital 39 make minimal/zero retention the default; **Art 5(2) + CJEU C-77/21 (Digi)** put the burden on the
  controller to prove it didn't over-retain; **Recital 65** strengthens erasure of child-consented data.
  *Scope:* applies to **consent-based** data; any subset on another basis (billing/tax, contract) is governed
  **element-by-element, not swept.**
- **US / COPPA — the cleanest; express + mandatory parental right (under-13 ONLY).** **16 CFR §312.6(a)(2):**
  operator "is required to" give the parent the opportunity "to direct the operator to delete the child's
  personal information" — **mandatory; the parent is the rights-holder for under-13.** Conditions:
  **§312.6(a)(3)(i)–(ii)** verify the requestor is the parent "taking into account available technology," by
  means "not unduly burdensome"; **§312.10** retain only as long as reasonably necessary. **No in-Rule
  legal-hold carve-out** — any post-direction retention needs an **independent documented basis.** **The 13–17
  gap is real and the rights-holder FLIPS:** no federal deletion right; coverage depends on **state law** where
  the **teen (13–15) is the consumer/rights-holder** (Cal. Civ. Code §1798.105 / §1798.120(c)), not the parent
  — and may not exist at all in some states. **Do NOT rely on COPPA 2.0 / CTOPPA** (Senate-passed 2026-03-05,
  not enacted).
- **UK / UK-GDPR + AADC — follows EU, with a hard competence floor.** Art 17 mirrors the EU analysis; **UK
  consent age = 13** (DPA 2018) → "below consent age" = under-13. **Children's Code Std 1 (best interests)**
  backs export-before-destruction *and* restrains a parent acting against an older child's interests — cuts
  both ways; ICO: decline an HPR request where evidence shows it's **not** in the child's best interests, and
  take a **competent child's wishes** into account. **Scotland: a child 12+ is presumed competent** to exercise
  their own rights — **below** the 13 line; a parent cannot delete over a presumed-competent Scottish
  12-year-old without rebutting the presumption.

**Conditions (what makes the YES safe — and what the build must ADD):**
1. **Age-band + capacity gate (load-bearing).** Under-12 (and under-13 outside Scotland): parental authority
   clean. Scotland 12+ / any Gillick-competent under-13: weigh the child's own capacity, **do not auto-execute**.
   13 → country consent-age: representative capacity but best-interests friction, involve/notify the child.
   At/above consent-age: **the child holds the right → route to the child, no parent-unilateral delete.**
   Per-country consent age must be resolved. *(Code today: `assertOwnerProfile` only — no capacity/child-views step.)*
2. **Standing — verify parental responsibility, not just account ownership** (Art 8(2) reasonable efforts).
   Account-owner ≠ legal HPR in a separation/custody dispute — **the exact "parent leaves" scenario.** *(Code today: ownership check only.)*
3. **Best-interests veto** — controller-side step to decline where evidence shows it's not in the child's
   interests (ICO; EDPB para 85). *(Code today: none — request rubber-stamped.)*
4. **Second-HPR check** — if a second HPR exists and objects, **not unilaterally actionable.** *(Code today: acts on one owner; never tests for a second HPR.)*
5. **Genuine export, enforced as a precondition** (Art 20) — **a gate, not a sibling UI row.** Recipient = the
   departing parent (preserves the corpus for the family without restoring the child's own future access — why
   deletion-as-default is still right). *(Code today: `privacy.tsx:138-147` export sits beside `:150-154` delete; delete possible without ever exporting.)*
6. **Deliberate + audited; the audit survives the delete** (Art 17(3)(b)/(e)). The **deletion-event audit**
   (who directed it, when, scope, export status) is a **distinct record** from the consent-withdrawal receipt,
   written **at delete time** into the retain-tier. *(Code today: no delete-actor audit; the consent-withdrawal receipt that exists is destroyed by the very action it records.)*
7. **Erasure propagates to processors** — must reach LLM processors that received the child's free-text
   (Art 17(2) + Art 28(3)(g)) and be confirmed, incl. provider log retention. Otherwise erasure is
   represented-but-incomplete.
8. **Child-scoped, reversible-where-possible, not a cascade.** Parent-account delete erases the *parent's*
   data; the child-delete is a **separate scoped election.** Prefer reversible shapes (export / account-
   separation / soft-delete reclaim window) given Recital 65 future-self foreclosure. *(Code today: irreversible after the 7-day grace.)*

**Corrected dependency (the bit a "C1 done" tick silently misses):** C1 supplies the **mechanism** (a retain-
tier surviving a profile delete — fix already mandated, since `consent_states` cascades from `profiles.ts:321`
on every delete path). **C2 additionally requires a NEW write** — a **deletion-event audit** generated at
delete time and landed in that tier. **There is no delete-actor audit today, and no `audit_log` /
`consent_history` / `legal_hold` / `retention_expires_at` anywhere in the schema.** ⇒ **Scope the C1 retain-
tier to hold BOTH the consent/withdrawal proof AND the C2 deletion-event audit.** **"C1 lands → C2 satisfied"
is a false tick:** C2 = C1's tier **+** the deletion-audit write **+** the gate conditions above. **PM note /
precondition, not architect-redesign.**

**Edge promoted from Monitor → in-scope NOW:** the flow acts on one owner (`assertOwnerProfile`) and does
**not** verify the absence of a **second HPR** — directly in tension with the "parent leaves" custody scenario.
Condition **4 (second-HPR)** and condition **2 (HPR-verification depth)** are **in-scope now, not deferred.**

**Confirms** inv-21 / §H Ripple 2 — **no architecture reopens.** **Carry-forward:** (i) extend the C1 retain-
tier spec to include the deletion-event audit; (ii) build the 8 delete-flow gates; (iii) **PM: log the
"NO-as-built" items as defects** — export unenforced, no delete-actor audit, single-owner flow ignores a
second HPR, all three paths cascade `consent_states`; (iv) **open parameter:** per-country consent age
(Scotland 12+ presumption is a hard floor). *(New sources added to `SOURCES.md` §I-C2.)*

#### I-C3 — Inactivity-deletion notice & window  *(PARAMETERS — feeds §H Ripple 4 scheduler)*

**Honest headline: there is NO statutory floor.** No regime (GDPR / COPPA / AADC) fixes a minimum notice
period or minimum grace/export window before deleting dormant data — all three pull toward **deletion** of
dormant data (storage-limitation), not toward holding it. What they regulate is the opposite risk
(over-retention). So the law gives a **standard** (reasonableness + fairness + up-front disclosure); the
numbers below are a **defensible posture floor** on top of it, labelled law-vs-posture throughout.

**(a) What is actually MANDATED (the binding layer):**
- **Disclose the retention/dormancy schedule in the privacy notice at collection** — **GDPR Art 13(2)(a) /
  14(2)(a)**. *Hard duty; the only genuinely binding piece — not "warn before," but "told them the rule in
  advance."*
- **Don't silently erase an account a user could reasonably expect to return to** — **Art 5(1)(a)** fairness/
  transparency. *Principle — makes advance notice expected, fixes no period.*
- **Eventually purge dormant data** — **Art 5(1)(e)** + **COPPA §312.10** (retain only "as long as reasonably
  necessary"; published written retention policy required post-2025; deadline **22 Apr 2026 passed**). *Hard
  duty — compels the purge.*

**(a) The PARAMETER posture** *(basis: reasonableness under the above + no-dead-end rule):*

| Parameter | Floor | Recommended | basis |
|---|---|---|---|
| Notice touches | **≥ 2** (window-open + final) | 3 (T-30 / T-7 / T-1) | Art 5(1)(a) fairness; no-dead-end |
| Channel | verified email of record | + in-app banner on next open | reach the data subject via the contact they gave |
| Warning→erasure window | **≥ 30 days, never shorter than one billing cycle** | 30–90 days (adult) | reasonableness — **posture, not statute** |
| Export | **live throughout the window**, embedded in the warning | one-click in the warning email | Art 20 portability (spirit) |

The **30 days is a posture floor, not statutory** — but it's the reasonableness sweet spot **and matches the
code**: `ARCHIVE_RETENTION_MS = 30d` (`archive-cleanup.ts:9`), enforced as `step.sleep('archive-window','30d')`
(:28) + a re-checked guard before hard-delete (:46). **CNIL** (closest any regulator comes to a number;
reference instrument, non-binding outside FR): inactive at **2 years** → notify → delete, or deactivate-but-
reactivatable. Your illustrative **365-day trigger is *stricter* than CNIL's 2 years** (fine — more protective;
just don't phrase it as CNIL endorsing 1 year), and CNIL's **deactivate-then-delete** two-stage model *is* your
`archivedAt → 30d → deleteProfile` pipeline. CNIL's 2yr is the **trigger**, not the warning window — keep them
separate.

**Hard guards:** (1) **never auto-delete inside an active paid entitlement** — a subscribed account isn't
abandoned; the window must not cut inside a live billing cycle. (2) **Undeliverable notice has a defined
fallback** — the core child-case is "guardian went silent" and that email is often the dead channel:
**reasonable-efforts = ≥2 logged delivery attempts; on confirmed non-deliverability, proceed to purge** (for a
child, §312.10 compels it); the attempt log writes into the **S3/S4** audit/accountability tier (Art 5(1)(a)
satisfied by reasonable attempts not guaranteed receipt; Art 5(2) requires the attempt record). Without this
the scheduler either **stalls forever** on bounces (over-retention) or **deletes silently** (forbidden
dead-end). (3) Notice emails are **transactional/service messages** (account-status, not marketing) → lawful
without marketing consent, outside PECR opt-in.

**Three distinct clocks — do not conflate:** (1) **dormancy trigger** (time-to-declare-dormant) = product call,
365d illustrative, ≤2yr defensible for adults; (2) **warning window** (notice→erasure) = the floor above, ≥30d
/ ≥2 touches — *the thing you asked me to floor*; (3) **survivor retention** (S1–S8 post-purge) = the C1 clocks,
unchanged.

**(b) Child divergence — yes, on all three axes:**
- **Clock — shorter, but only on the *trigger*, never by skipping the warning.** §312.10 + Art 5(1)(e) + AADC
  minimisation make a dormant child's data **more urgent to purge** (PM instinct confirmed) — purpose exhausted
  → purge is the obligation. The urgency lives in clock #1.
- **Window — equal to the floor, never extended (corrected).** A longer window = longer retention of dormant
  child data — exactly what §312.10 / Art 5(1)(e) command you to minimise — and buys the child nothing (silent
  guardian, no independent child contact). AADC best-interests supports a **fair warning**, not extended
  retention. **Pin the child window to the floor (30d), not the upper end of the adult 30–90 range.** *Net:
  trigger sooner + window at the floor → child purged sooner overall, still warned.*
- **Recipient — guardian primary; child added only when reachable AND old enough.** Genuine under-13: notice →
  **guardian** (consent-holder + account contact; do not make a young child the sole recipient — Art 8 rep-
  capacity). 13+ on own credential: **both** child and linked guardian (AADC best-interests + evolving
  capacity).

**The reconciliation you were listening for:** storage-limitation-pulls-to-purge and no-dead-end-pulls-to-a-
warned-window are **not in conflict — they act on different axes.** Trigger timing: storage-limitation shortens
it (more for children). Execution method: no-dead-end requires the irreversible act be **warned + export-
enabled, never silent.** **The rule: purge sooner for children, but never purge silently for anyone** — the
warning window is the fairness wrapper around a deletion minimisation *demands*, not a delay that offends it.

**Scope → architect (alongside the C1 scheduler):** the §H Ripple-4 scheduler **must run at PROFILE granularity
for child profiles, not only account granularity.** Billing is account-level (verified C1), so the active-
entitlement guard protects the *account* — but a **dormant child profile under an actively-paying guardian**
has an exhausted purpose and §312.10 still demands its purge. The active-subscription shield **must not
blanket-cover a dormant child profile**, else dormant child data survives indefinitely inside any paying
household — the precise §312.10 failure this section exists to prevent.

**Distinct triggers folded into one mechanism — fine for notice, watch the edges:** the §H catch-all bundles
abandonment / death / store-side-deletion; for notice+window they collapse into one warned-purge mechanism,
but: **death ≠ abandonment** — a deceased adult's data falls outside GDPR (Recital 27) unless national law says
otherwise; **France grants post-mortem rights to heirs** → **Monitor C3-M2** if FR is a market. **Store-side
deletion** (Apple/Google account/entitlement removal) is an **external signal, not inactivity** — decide
explicitly whether it feeds clock #1 or is its own immediate path.

**C1 carve-out — confirmed, and it forces an UPSTREAM C1 fix.** S1–S8 survive the dormancy purge identically.
But dormancy-purge runs through `archiveCleanup → deleteProfile()` — the **same destruction path** flagged in
the C1 cascade, so it's the **3rd consumer** of the retain-tier (denial, withdrawal, scheduled dormancy). The
"event" here is a **scheduler firing 30 days later with no request context** to reconstruct the receipt from →
capturing S1–S8 only at *delete-time* leaves the dormancy path nothing to write. **Hard C1 design requirement:
the receipt/audit must be written into the non-cascading tier when the consent/withdrawal/dormancy-mark event
occurs, NOT when the delete fires.** *(This promotes the C1 fix from a per-path sweep to an upstream capture-at-
event-time design — update the C1 spec.)*

**Reactivation resets the clock — already implemented (assert, not aspirational):** returning during the window
cancels the purge and resets clock #1 — `archive-cleanup.ts` bails with `consent_restored` when status flips to
`CONSENTED`, and `restoreConsent` clears `archivedAt` atomically (verified C1).

**Monitors:** **C3-M1 — maturing-child recipient rule** (the age at which a child becomes co- then sole-
recipient tracks "evolving capacity," no fixed statutory age; instrument = AADC + per-country Art 8 consent-age
table; revisit when the 13+ self-credentialed band ships and the child has an independent verified contact).
**C3-M2 — deceased-user post-mortem rights (FR)** (instrument = GDPR Recital 27 + French *loi Informatique et
Libertés* post-mortem directives; revisit if/when France is an active market).

**Carry-forward:** (i) **upstream-ify the C1 retain-tier write** to capture-at-event-time (dormancy has no
delete-time context); (ii) **architect:** scheduler at **profile granularity** for child profiles; (iii) PM
product call on the **dormancy trigger** length (365d illustrative, ≤2yr defensible) and the explicit
**store-side-deletion** path decision.

**Sources (counsel, I-C3):**
- CNIL — inactive-account retention (DataGuidance) — https://www.dataguidance.com/news/france-cnil-clarifies-rules-retaining-data-inactive
- CNIL Sheet 14 — retention periods — https://www.cnil.fr/en/sheet-ndeg14-define-data-retention-period
- GDPR Art 5 — https://gdpr-info.eu/art-5-gdpr/ · Art 13 — https://gdpr-info.eu/art-13-gdpr/ · Art 8 — https://gdpr-info.eu/art-8-gdpr/

#### I-C4 — Child's own erasure vs the parent's authority  *(RULE — boundary CORRECTED to a competence gradient)*

**Anchor (confirmed — representative authority, never ownership):** the erasure right is the **child's from
the first record** — the child is the data subject from day one (**GDPR Art 4(1)**; Recital 38; EDPB Guidelines
01/2022; ICO "What rights do children have?"). The parent **never owns** the child's data or rights — they
exercise them **in fiduciary trust, only while the child cannot, and only as a primary/leading consideration of
the child's best interests** (EDPB 01/2022 ¶85; ICO Children's Code Std 1 / UNCRC Art 3). C4 is not "when does
the parent's data become the child's" — it is "**when can the child exercise the right that was always theirs.**"
**Default to ship: maximise the child's own control, minimise the parent's override** (C2 and C4 point the same
way).

**Boundary (CORRECTED — the single most important point): rights-control re-vests on COMPETENCE, a case-by-case
gradient, decoupled from and NOT floored by the Art 8 consent age.** The Art 8 age (13 UK/NO; ≤16 default)
governs only **consent to information-society services — one lawful basis of six** — and is the point past which
a parent can no longer *give consent*. It is a **defensible product bright-line / presumption of competence**,
**not the legal terminus of parental authority.**

| Band | Who controls the child's data | Parent's reach |
|---|---|---|
| Young, not competent | Parent in representative trust; child's voice weighed | Live, bounded by best-interests (a primary consideration, not the parent's self-interest) |
| Competent (Gillick in E&W/NI; **presumed at 12 in Scotland**; assessable below the consent age) | **The child** — answered directly; parent cannot override the competent child's wishes | Default entitlement falls away; see/export reach may lawfully persist where evidently in the child's best interests (**no upper age cap**) |
| At/above Art 8 consent age (13 UK/NO) | The person (presumed competent) | Parent can no longer give consent; remaining reach is best-interests-justified only |
| 18 / guardianship removed | The person, absolutely | Gone (general civil + mental-capacity law — **not a GDPR-derived line**) |

The flip is a **gradient on competence**, best-interests in **both** directions — **not a hard cliff at 13.** A
demonstrably competent 11–12-yo can exercise erasure and block the parent below 13; an incompetent child does
**not** auto-seize control at 13. A conservative product **may** still sever parental control at the consent age
— that's "consistent with but goes beyond" ICO, a lawful ceiling-tightening **choice**. What is **wrong** is
asserting the law *terminates* parental override hard at the consent age. *(bandBoundaryHolds = **false**.)*

**(a) The genuine charge erasing their own:** **UK** — yes, stands alone if competent; a competent child should
usually be answered directly without involving the parent, and a parent cannot override their wishes (Scotland
presumes competence at 12). **EU** — national-law dependent (Art 8 harmonises only the consent age; capacity to
*exercise rights* defers to Member-State minor-capacity law via Recital 38 + best-interests). **US/COPPA** — no
child-competence doctrine; for under-13 the deletion/review right **vests in the parent** (16 CFR §312.6) →
route through the verified parent. **Buildable rule:** *never refuse the child's self-erasure **outcome*** — but
two mandatory gates: (i) **jurisdiction-gate the direct-honour mechanism** to regimes recognising child
DP-competence (UK incl. Scotland-12, EU); for a US under-13 it collapses to the **verified-parent path** (the
outcome survives, only the mechanism is gated); (ii) "never refuse" reads **"never refuse, subject to Art
17(3)"** (legal obligation / claims) + statutory retention, and is **scoped to the child's own data** (not the
parent's, co-mingled records, or independent-retention records). For a young not-yet-competent child, a
**guardian checkpoint + export-first is protective good practice, not statutory.** *(Erasure backing: Art
17(1)(f) — the child/ISS-specific ground — + Recital 65 + Art 5(1)(e).)*

**(b) The crossing (graduation):** (1) **Full erasure reach over the *whole* corpus incl. the managed-child
portion — yes** (Recital 65: applies "notwithstanding that he or she is no longer a child"; Art 17(1)(f)) —
scoped to the child's personal data, not the parent's contributions or lawfully-retained records. (2) Parent
**see/export/delete** default entitlement **falls away on competence — but not as an automatic age-pegged
severance**; reach can persist where evidently in the child's best interests (ICO mandates no hard cut-off).
(3) **Basis re-ground — CONDITIONAL, not universal** (corrected from "required"): required **only** if the sole
basis was the parent's Art 8 ISS-consent → the parent ceases to be a valid consent-giver, re-confirm with the
now-competent subject (Art 5(2) accountability). Where basis is **Art 6(1)(b) contract** or **6(1)(f)
legitimate interests** (the natural fit for a tutoring product), processing **continues with no re-consent** —
the duty is to honour the re-vested exercise rights (Art 7(3) keeps prior consent valid until withdrawn).
**Operator keeps the minimised compliance evidence** (= C1/C2 retain-tier) — *operator accountability, not
parent access.* **Confirms/sharpens inv-20 / §H Ripple 2; forward-links D2.**

**(c) The collision rule:** **child-ERASE vs parent-RETAIN** — the child's hand strengthens with competence; at
competence the child controls their own data and a parent **cannot force retention** (storage-limitation backs
the child); below competence the guardian governs *in the child's interest* (retaining for the guardian's own
benefit against the child fails best-interests). **parent-ERASE vs child-RETAIN (C2 constrained by C4)** — C2's
representative delete is *for the child's benefit*, so a competent child's wish to keep their own work is a
**weighty best-interests factor against it — though not a categorical statutory override** (corrected);
export-first preserves the work. **Flip point:** parental override **contracts on a competence gradient and is
presumptively spent by the Art 8 consent age, with a best-interests escape valve in both directions** (no hard
age-pegged cut-off); 18 = civil-law backstop, not a GDPR line.

**Data-model constraint (sharpened + code-corroborated): NO persistent fork — re-point control IN PLACE.**
Graduation = mutate the auth pointer (today `profileMeta.isOwner` / `clerkUserId`; future `memberships.roles[]`),
**same `profiles.id`, history intact**; the anti-fork rule = "must attach to an existing person when one exists
— never create a parallel managed duplicate"; `family_links` is a stateless re-pointable edge
(`profiles.ts:284-311`); deletions are single-corpus FK-cascade (`deletion.ts:214-277`) — the model does not
fork. **Two carve-outs a flat "a fork would be unlawful" misses:** (1) the **Art 20 portable copy is lawful and
mandatory** — a structured machine-readable read-only export to the subject; *not* a second controller-held
record → restate as *"re-point control over the same authoritative corpus in place; never fork into a second
parallel controller-held record — the Art 20 portable copy is independent and unaffected."* (2) The minimisation
breach is **the PARENT retaining live control + best-interests erasure of any parent-held copy** — *not the mere
existence of a copy* (Art 5(1)(c) applied); and where the corpus holds genuine parent-authored / co-parent /
payer material, the re-point must be **subset-scoped** (partition before transfer) — "the same corpus" is not
always one atomically-re-pointable unit.

**Trip read (resolved): C4 does NOT reopen architecture — it CONFIRMS inv-20** (re-point-in-place, never fork).
Split the read:
- **No-fork = a FUTURE constraint.** Graduation is design-only, not implemented (`identity-foundation-prd.md:222-223`;
  `consent.ts` treats all minors as parent-consented) — **no live fork defect.** → Encode the no-fork /
  claim-existing-person / zero-duplicate invariant **+ the two carve-outs** as **T2 acceptance criteria / break
  tests** before graduation ships.
- **THREE LIVE compliance defects (present-tense, independent of whether graduation ships) — PM: log as defects:**
  **(1)** parent read/export of a child's data is **never age- or best-interests-gated** — permanent for the
  life of the family link (`dashboard.ts:310-320`, `routes/dashboard.ts:77-114`, `recaps.ts:30-42`,
  `learner-profile.ts:87-100`); the only age-conditional logic is deletion-on-withdrawal
  (`consent-revocation.ts:139-143`: ≤13 hard-delete, 14+ archive 30d — a COPPA-13 shape, *not* a competence
  flip). **Material for Norway.** **(2)** **no competent 13–17 self-erasure path** — account delete/export/email
  are strictly `assertOwnerProfile (isOwner===true)` (`account.ts:81-178`); the one self-erasure-ish route
  (`DELETE /learner-profile/all`) uses `assertCanManageOwnConsent` = owner OR non-owner **adult 18+ only**
  (`family-access.ts:76-106`) → a competent minor is **hard-gated at 18, not at competence**; no
  capacity/Gillick/Scotland-12 marker in schema (`profiles.ts:71-133`). **(3)** consent is **never refreshed at
  any age transition** (`consent.ts`) — the basis-review gap.

**Monitors:** **C4-M1** EU per-country capacity-to-exercise (instrument = national implementing laws + EDPB;
trigger = relaxing parental reach for a specific EU country). **C4-M2** Gillick assessment **at scale** (can't
be an app form; interim = self-erasure honour-by-default + age-band proxies for higher-risk rights → surface to
**DPIA**). **C4-M3** **Norway DP-rights capacity = RESEARCH-OPEN** — do **not** conflate *barnelova*
co-determination ages (§31 heard-from-7, great-weight-from-12; §33 progressive self-determination to 18 =
family-law voice, not DP capacity) or *personopplysningsloven* ISS-consent age 13 with a DP-rights-capacity
flip; Datatilsynet main rule = solo consent at 18 + sliding maturity assessment, **no fixed Norwegian
erasure-capacity age**; default to the EU general case. **Home-market: load-bearing.** **C4-M4** **US 13–17 =
RESEARCH-OPEN / regime-by-regime** — COPPA stops at 13 (16 CFR §312.2), vests no self-determination; CCPA
deletion (§1798.105) is age-neutral; the minor-specific right is the opt-in to sale/share for "≥13 and <16"
(§1798.120(c)); do **not** assert "self-controlled at the consent age" for US teens; do **not** cite COPPA 2.0 /
CTOPPA as enacted.

**Carry-forward:** (i) **age-gate spec correction** — encode a **competence gradient + best-interests test**,
not a hard consent-age flip (Scotland-12 floor; competent-under-13 can block parent; incompetent-13+ doesn't
auto-seize); (ii) **PM: log the three live defects** (parent-reach ungated; no competent-minor self-erasure;
no consent refresh); (iii) **T2 acceptance criteria** = no-fork / claim-existing-person / subset-scoped re-point
+ Art 20-copy carve-out; (iv) forward-link **D2** (legacy data at graduation). **Confirms inv-20; no reopen.**

**Sources (counsel, I-C4):**
- GDPR Art 4(1) — https://gdpr-info.eu/art-4-gdpr/ · Art 17(1)(f) — https://gdpr-info.eu/art-17-gdpr/ · Recital 65 — https://gdpr-info.eu/recitals/no-65/ · Recital 38 — https://gdpr-info.eu/recitals/no-38/
- EDPB Guidelines 01/2022 (DSAR — children, ¶85) — https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-012022-data-subject-rights-right-access_en
- ICO — children's rights / erasure / subject access (children) — https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/
- COPPA 16 CFR §312.2 / §312.6 — https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312
- Cal. Civ. Code §1798.105 / §1798.120(c) — https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1798.105&lawCode=CIV
- Age of Legal Capacity (Scotland) Act 1991 s.2(4A) — https://www.legislation.gov.uk/ukpga/1991/50/section/2
- Norway *barnelova* §§31/33 — https://lovdata.no/lov/1981-04-08-7 · *personopplysningsloven* — https://lovdata.no/lov/2018-06-15-38

### Segment 2 — Is our consent valid?

#### I-A1 — Per-purpose disclosure & helper-grant consent  `[resolves G1 / REQ-1; 2 architecture items → architect async]`  *(RULE)*

**⚠️ TWO BUILD-GATING CONTINGENCIES — stated first so they aren't buried:**
- **GATE 1 — the LLM "no-toggle" treatment is a *recommended position, not a settled exemption*.** It holds
  only if **(i)** the amended COPPA consent-mechanics text (reported **§312.5(a)(2)**) is verified against FR
  2025-05904, **and (ii)** the executed **DPA with each named vendor** contains an enforceable
  **no-training / no-own-use / no-secondary-purpose** bar. Consumer-tier Gemini/OpenAI terms frequently do
  **not**. **Do not build the no-toggle path until both are confirmed.**
- **GATE 2 — resolve the profiling contradiction before any disclosure ships.** The tutor profiles mastery and
  steers what's studied next (**Art 4(4) profiling**). A GDPR notice claiming automated decision-making is
  "engineered out" would **contradict the AI-Act high-risk analysis** and risk a false disclosure. **Disclose
  profiling as present and lawful (Art 13(2)(f))** and settle whether it produces an **Art 22 "significant
  effect"** (steering a child's education plausibly does) before finalizing either work-product.

**The governing RULE (resolves G1): "disclose" and "separately consent" are two different operations.**
- **Disclose** = transparency (you must tell them) — **Art 13/14; COPPA §312.4** direct notice. Layered, named,
  **no toggle.**
- **Separately consent** = lawful basis — where a purpose rests on consent it needs its **own affirmative act,
  specific and unbundled** — **Art 4(11)** ("specific"); Art 7; Recital 43.
- **A purpose gets its own toggle IFF its lawful basis is consent.** Bundling a non-consent purpose into a
  consent box is **presumed not to yield valid consent** (Art 7(4)/Recital 43 — strong presumption, not
  automatic per-se breach). **A pre-ticked box cannot be valid consent** (Planet49, C-673/17). The rewrite is a
  **sorting exercise**: classify each purpose by basis, then disclose-or-toggle.

**Purpose × regime map:**

| Purpose | EU (GDPR) | US (COPPA 2025) | UK (UK GDPR + AADC/DUAA) |
|---|---|---|---|
| **1 Core service** | Gate. Consent Art 6(1)(a) modulated by Art 8 (a condition, not a basis), **or** contract Art 6(1)(b) for the paying adult — resolve which | Gate = VPC (§312.5) | As EU; age-floor **13** (not 16); AADC high-privacy default |
| **2 LLM inference** | **Processor (Art 28) → no separate consent;** disclose recipient (13(1)(e)) + transfer/safeguard (13(1)(f)) + AI-interaction (Art 50) | Service-provider transfer "not a disclosure" (§312.2) → no separate VPC — **CONTINGENT (Gate 1)**; if vendor trains/reuses → separate VPC | As EU, but transfer mechanism = **UK IDTA / UK Addendum to EU SCCs**, not plain SCCs |
| **3 Helper grant** | **Separate, specific, named-per-person consent (Art 4(11)).** Independent controller → Art 26 + Art 14 to child **and** helper | Third-party disclosure → **separate VPC per named person** (§312.5) | As EU; AADC just-in-time, child-legible |
| **4 Targeted ads** | Consent, **default-OFF** | Separate VPC (advertising "never integral", §312.5) | AADC Std 12 — behavioural ads off by default |
| **5 AI-training** | Consent, **default-OFF** | Disclosure-for-training → separate VPC; purely internal training governed by general use/consent | AADC; same |

**For children, #4 and #5 = off-limits at launch** — not via a flat statutory ban, but AADC default-off +
separate-VPC + enforcement/reputational + DPIA/Art 9 risk make **"do not offer to child accounts" the most
defensible posture** (training stays a verified-adults-only toggle).

**Rewrite-ready copy (per purpose):** *(1 core)* parent-consent / parent-contract / child variants; *(2 LLM)*
parent: "Your child's messages are sent to [Gemini/OpenAI] to generate replies; they process this only to
provide the service and may not use it for anything else; data is processed outside the UK/EEA, protected by
[EU SCCs / UK IDTA / DPF cert]" + child Art-50: "Your mentor is an AI, not a person"; *(3 helper)* capability-
at-consent + per-person grant ("Allow [Mr Smith] to see [child]'s work? Remove anytime") + child line; *(4/5)*
**not shown on child accounts**. *(Full templates retained in the counsel transcript.)*

**Two audiences + just-in-time:** parent gets the **full §312.4 + Art 13/14 instrument**; child gets a
child-legible version; **AADC Std 4 — just-in-time notices fire at each data-use moment** (helper grant, voice
enable, chat that may surface special-category content), not one static page.

**Method (PARAMETERS):** every consent-based child toggle = a **§312.5 VPC-grade event** (batch in one verified
flow, never downgrade an "optional" toggle to a light in-UI checkbox); **withdrawal as easy as giving — lighter
never heavier** (Art 7(3)); **VPC ≠ age-assurance — you need BOTH** (VPC verifies the parent's authority §312.5;
AADC/DUAA require age-estimation of the *user* to know a child is present).

**Required-disclosure set (re-validate before final copy):** **Art 13(1)** (a)–(f) incl. **mandatory DPO**
(Art 37(1)(b)/(c) — children's data + large-scale monitoring + special category) + near-certain **Art 27 EU/UK
representative** (US-domiciled operator); **Art 13(2)** (a) retention incl. the **retain-tier divergence** (the
receipt kept after content deletion is itself disclosable), (b) rights incl. **portability**, (c)
non-retroactivity-of-withdrawal clause, (e) consequences-of-not-providing, (f) **profiling present** (Gate 2),
13(3) further-processing; **full Art 14** (the parent supplies data *about* the child — the primary path, today
one line): categories 14(1)(d), source 14(2)(f), timing 14(3) (≤1 month), 14(4), plus a **separate Art 14
notice to the named helper**; **COPPA §312.4(d)** mechanics (d)(1)–(4) + review/delete/refuse triad +
retention-policy statement + each third-party+purpose+separate-consent + which VPC method; **AADC** just-in-
time / voice-as-own-category (biometric-adjacent — own disclosure + Art 9) / geo-sign (Std 10) / no-detrimental-
nudge (Std 13) / best-interests evidence (Std 1). **Recipient roster (name each — Art 13(1)(e) + §312.4 third
party):** LLM vendor(s), Clerk, Neon, Cloudflare, **Sentry** (special trap — if chat content/PII reaches it,
it's a recipient + possible special-category disclosure), RevenueCat/Stripe, Expo/EAS, analytics, push, email.
Plus disclose the **age of digital consent + jurisdiction variance** (UK 13; EU 13–16) and how rights pass
parent→child at that age.

**Receipt (PARAMETER):** Art 7(1) ("be able to demonstrate") in **ISO/IEC TS 27560:2023** shape (who / purposes
/ version / timestamp / method / jurisdiction / revoked-at), for **both** the per-purpose record **and** the
per-grant helper record; **must survive account deletion in the retain-tier** (Art 17(3)(b)/(e)) while child
content is erased; the divergent retention is itself an Art 13(2)(a) disclosure. **Same artifact as the C1
cascade fix.**

**TWO ARCHITECTURE ITEMS → architect async:**
1. **Build mandate.** The per-purpose consent model + per-grant helper-consent receipt **do not exist today** —
   shipped state is a `consentType` enum {GDPR, COPPA} + `status` (`profiles.ts:322`); `family_links` carries
   `parentProfileId, childProfileId, createdAt` only — **no `revoked_at`, no `policy_version`**, consent merged
   into link creation (`consent.ts:347-380`). **Net-new schema + service.**
2. **AI-Act high-risk.** An adaptive tutor that evaluates mastery + steers the path is **plausibly Annex III(3)
   high-risk regardless of gating**, and the **Art 6(3) carve-out is likely unavailable** (system arguably
   performs profiling → disapplies the carve-out) — confirm in scoping, don't assume. **Commencement
   (corrected):** under the **Digital Omnibus provisional agreement** (political agreement 6 May 2026, Council-
   confirmed 13 May 2026, pending formal adoption), standalone Annex III high-risk obligations are **deferred to
   2 Dec 2027** (embedded-in-product: 2 Aug 2028). **Art 50 transparency is NOT delayed — still 2 Aug 2026.**
   Plan the consent/AI-interaction line to **2 Aug 2026**; the high-risk obligations to **2 Dec 2027**.

**Newly load-bearing scope (beyond the consent text):** **Art 9 at inference** (health/SEN/religion surface in
chat → an Art 9(2) condition on top of Art 6 every exchange; **9(2)(a) explicit-consent-about-a-child-via-parent
is legally awkward** → confirm or fall back to another 9(2) condition / active avoidance/redaction); **DPIA is a
precondition** if profiling holds (Art 35(3)(a) + WP248 — assume it does, treat as launch gate; possibly a
deployer **FRIA**, AI-Act Art 27); **ePrivacy Art 5(3) is SETTLED not contingent** — any non-strictly-necessary
device storage/access (SecureStore keys, draft autosave, analytics, push tokens) needs prior consent +
disclosure (same confidence as Art 7(3)); **UK DUAA 2025** complaint-to-controller-first route (acknowledge ≤30
days; in force **19 Jun 2026**); **US-state fourth bucket — monitored, do NOT hard-code** (post-NetChoice 9th
Cir. 12 Mar 2026: age-estimation back in effect, **data-use restrictions + dark-patterns prohibition remain
enjoined**, notice/severability on remand — don't represent the blocked data-use provisions as live).

**Monitors:** **A1-M1** AI-Act high-risk commencement (Annex III(3) standalone deferred to 2 Dec 2027 per May-
2026 Omnibus provisional agreement; Art 50 unaffected 2 Aug 2026; revisit on formal adoption or if it stalls).
**A1-M2** US-state fourth bucket (CA-AADC surviving scope post-9th-Cir + CT/CO/TX/MD/VA minor rules; First-
Amendment-vulnerable; revisit before any US launch + each new state statute/remand). **A1-M3** helper
controller-status (processor vs independent controller → Art 26 + Art 14-to-helper; revisit when helper-grant
ships; **ties D1**).

**Carry-forward:** (i) **REQ-1 rewrite** — today's notice is blanket ("we need your consent before
processing", `notifications.ts:360-372`; "parental consent to use this service", `consent-copy.ts:75-91`) →
rebuild to the disclosure set + per-purpose/per-grant toggles; store `policyVersion` (`profiles.ts:347-349`);
(ii) **architect:** the build mandate (net-new consent schema/service) + AI-Act high-risk determination;
(iii) **verify GATE 1 (§312.5 text + vendor DPA bar) and resolve GATE 2 (profiling/Art 22) before any copy
ships**; (iv) the **receipt = the C1 retain-tier artifact** (single build). **Resolves G1; closes REQ-1.**

**Caveat (verify before final copy):** the COPPA separate-consent / "never integral" rule sits in **§312.5**
(reported §312.5(a)(2)), **not §312.2** (which holds the definitions) — verify the exact subsection against FR
2025-05904.

**Sources (counsel, I-A1; verified 2026-06-03):**
- COPPA final rule **FR 2025-05904** — https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
- 16 CFR §312.2 (defs) — https://www.law.cornell.edu/cfr/text/16/312.2 · §312.5(a)(2) "never integral" (analysis) — https://publicinterestprivacy.org/coppa-rule-training-algorithms/
- CJEU **Planet49** (C-673/17) — https://curia.europa.eu/site/upload/docs/application/pdf/2019-10/cp190125en.pdf
- AI Act Art 50 — https://artificialintelligenceact.eu/article/50/ · Art 6 — https://artificialintelligenceact.eu/article/6/
- Digital Omnibus high-risk delay (Council) — https://www.consilium.europa.eu/en/press/press-releases/2026/05/07/artificial-intelligence-council-and-parliament-agree-to-simplify-and-streamline-rules/
- NetChoice v. Bonta, 9th Cir. (Cooley) — https://www.cooley.com/news/insight/2026/2026-03-30-netchoice-v-bonta-ninth-circuit-narrows-injunction-against-californias-ageappropriate-design-code-act
- DUAA complaints rules 19 Jun 2026 (CMS) — https://cms.law/en/gbr/legal-updates/data-use-and-access-act-2025-new-statutory-rules-on-handling-data-protection-complaints-from-19th-june-2026
- GDPR Art 13 — https://gdpr-info.eu/art-13-gdpr/ · Art 14 — https://gdpr-info.eu/art-14-gdpr/ · Art 4(11) — https://gdpr-info.eu/art-4-gdpr/ · Art 7 — https://gdpr-info.eu/art-7-gdpr/ · Recital 43 — https://gdpr-info.eu/recitals/no-43/ · Art 9 — https://gdpr-info.eu/art-9-gdpr/ · Art 22 — https://gdpr-info.eu/art-22-gdpr/ · Art 35 — https://gdpr-info.eu/art-35-gdpr/ · ePrivacy Art 5(3) — https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058

---

## Phase-E fillers walkthrough captures  *(2026-06-04 — PM + counsel)*

*The 11 values + product calls the data-model + ADRs left as seams. Pasted from
`_wip/identity-foundation/phase-e-fillers-walkthrough/CAPTURE-LEDGER.md` (Zuzana, 2026-06-04); full
citations in `phase-e-fillers-walkthrough/SOURCES.md`; verifier Code-Verification Log (V1–V5) in
the same ledger. The decision that drove everything: the launch age floor landed at **13+** (not 11+)
— this pulls COPPA's under-13 chain out of the launch path (deferred to a demand-triggered phase 2);
the under-18 child-protection pole (GDPR Art 8, UK Children's Code, AI-Act Art 50, DPIA) still gates
launch.*

#### I-P1 — Signup age floor  `[Product call — supersedes FLAG-2, recalibrates I-PB-B1]`
**Decision:** Launch at **13+**. Defer **11+** to a demand-triggered **phase 2**.
- **Current state (verified, V1):** `birthYearSchema` rejects age < 11
  (`packages/schemas/src/profiles.ts:38-54`, tag `CR-2026-05-19-H11`). The "11" is a Zod product rule, not
  a store rating and not a legal line (per `I-PB-B1`).
- **Rationale:** 13+ is "nearly free" — the consent model already serves up to 16, so 13–17 minors are
  in scope and the built scaffolding isn't wasted — while 11+ pulls in the full COPPA enumerated-VPC
  chain + the G7 under-13 vendor tier, deferrable until there's demonstrated demand for the 11–12
  segment. Keeps the COPPA scaffolding warm so phase-2 is an additive value-flip.
- **Implications:** *Legal* — COPPA out at launch → phase-2 trigger; GDPR Art 8, UK Children's Code,
  AI-Act Art 50, DPIA all still bind (under-18 core stays live). *Store* — simplifies posture; coheres
  with 9+ / stay-out. *UX* — onboarding age-gate copy 11 → 13. *Build (Phase F)* — `birthYearSchema`
  refine `≤ currentYear-11` → `≤ currentYear-13` + ship the documented rationale in the same change
  (`I-PB-B1` / UK written-record duty); eval fixtures with sub-13 birth-years → phase-2 or bump to ≥13;
  reconcile the "Strictly 11+" sections in `CLAUDE.md` / `AGENTS.md` / project memory + the 11+ dead-
  code-branch note.
- **Undo cost:** LOW. Adding 11+ later is additive (flip the refine + re-activate COPPA scaffolding +
  complete the G7 under-13 tier). No data loss (pre-launch, zero users).
- **Monitor:** demand signal for the 11–12 segment **AND** COPPA readiness (§312.8 written security
  program, VPC vendor, §312.10 retention path) before any phase-2 flip.
- **Carry-forward (named):** the "11" floor-follow-up thread in the ROADMAP is updated to
  "13+ launch floor set 2026-06-04; 11+ deferred to phase 2."

#### I-P2 — Store content-rating band  `[Product call]`
**Decision:** Aim for **IARC 9+** (Apple 9+ / PEGI 7 / ESRB E10+).
- **Rationale:** the band is a *content-maturity descriptor*, not a usage gate. An open-ended LLM
  tutor can surface mild-mature academic content on request (history/biology/literature), which an
  honest IARC questionnaire lands at 9+; self-rating 4+ risks an App Store content-mismatch rejection.
  At a 13+ floor there is **no device-gating downside** to 9+ (no under-9/under-12 users to gate).
- **Implications:** *Store* — answer the IARC questionnaire to land 9+ (affirm mild references / open
  AI-generated content); *UX* — none (band invisible in-app); *legal* — none direct.
- **Undo cost:** MEDIUM — a band change triggers an App Store re-review. Documented intent to
  revisit toward 12+ if the tutor routinely handles genuinely mature subject matter.
- **Monitor:** observed tutor content range; Apple/Google AI-chat questionnaire changes (the 2025
  granular-age-rating update added AI-chatbot / UGC questions).
- **Source:** IARC official questionnaire + rating bodies (PEGI.info / ESRB.org); App Store Review
  Guidelines; Google Play Store policy center.

#### I-P3 — Per-program applicability at the 13+ launch floor  `[Rule (counsel) + Product call (opt-in)]`
| Program | Applies at 13+ launch? | basis |
|---|---|---|
| Apple Kids Category | **No** (opt-in; we stay out — I-P4) | App Store Review Guidelines §1.3 / §5.1.1 |
| Google Designed for Families | **No** (opt-in; we stay out — I-P4) | Google Play Families policy |
| COPPA "directed to children" | **No at launch → phase-2 trigger** when 11+ ships; *but* a delete-on-under-13-discovery duty persists | 16 CFR §312.2 (definition), §312.5 (VPC), §312.10 (retention) |
| EU/UK digital-consent age | **Yes** — 13–15yos below the national line (DE/NL/IE 16; FR/CZ/GR 15; IT/AT 14) need "reasonable efforts" guardian consent + the LLM-disclosure gate; UK = 13 (self-consent) | GDPR Art 8(1)-(2) + EDPB Guidelines 05/2020 §7.1; UK-GDPR Art 8 / DPA 2018 s.9 |
| App Store Accountability Acts (US state) | **Conditional → Monitor** (cover under-18; enjoined/delayed as of 2026-06-03) | TX SB 2420; UT SB 142; LA 2025 |

#### I-P4 — Kids Category / Designed-for-Families posture  `[Product call]`
**Decision:** **Stay out.**
- **Rationale:** at 13+ these programs (aimed primarily at under-13 directed apps) aren't required;
  staying out avoids per-release kids-review friction, the strict third-party-SDK constraints
  (analytics/Sentry scrutiny), and the Designed-for-Families "teacher/parent-recommended" bar. We
  meet our actual obligations directly (no ads, IAP-only).
- **Implications:** app not listed in the kids section; no kids-program review overhead.
- **Undo cost:** re-review on a posture change (relevant if phase-2 11+ revisits this).
- **Monitor:** phase-2 11+ decision (Kids Category becomes more relevant when serving under-13s).

#### I-P5 — Joining-teen double-charge disclosure + grace  `[Product call + Parameter]`
**Product call — the 5-point disclosure copy** (blocking modal at join-confirmation, must acknowledge;
+ a follow-up nudge before the personal sub's next renewal):
1. "You'll keep being charged for your own subscription until you cancel it — joining the family
   plan does **not** auto-cancel it."
2. "The family plan already covers your access — your own subscription is now redundant."
3. "Here's exactly how to cancel it: [store-specific manage-subscription deep link + steps]."
4. "Until you cancel, you'll be billed twice. The family organiser can see family-plan charges, not
   your personal subscription."
5. "Charged after joining and couldn't cancel in time? Here's how to dispute: [path]."

**Parameter — grace:** the "next charge" is the *personal sub's renewal*, not the family sub's.
Fire the disclosure **≥14 days before** that renewal where it's ≥14 days out; if it's <14 days out
at join, surface an immediate "cancel now to avoid the next charge" CTA. **Minimum cancellation
window = 14 days.**
- `basis:` Norway *angrerettloven* §22 (14-day withdrawal); EU Consumer Rights Directive 2011/83 Art 9
  (14-day) + Art 16(m) (the digital-content waiver removes the *refund*, not the *disclosure* duty);
  UK Consumer Contracts Regs 2013 reg 30 (14-day) + CRA 2015 Pt 2; UCPD 2005/29 Art 7 (misleading
  omission). Counsel confirms the 5-point shape satisfies the `I-E4` conditioning.
- **Note:** store-delegated billing rules out a server-side refund (`MMT-ADR-0002`) — the lawful
  path is disclose + assist-cancel, not refund.

#### I-P6 — `payer_person_id` under Family Sharing / Ask-to-Buy  `[Rule]`
**Rule:** record the **store-account-holder** (the Person whose Apple/Google account is actually
charged). Under Family Sharing / Ask-to-Buy that resolves to the **family organiser** (the approving
parent). The child is the *user/beneficiary*, recorded via the membership/consent edges — **not**
as `payer_person_id`. Default when there is no Family Sharing (solo teen, own store account): that
Person.
- `basis:` Apple Media Services Terms — Family Sharing (the organiser's payment method funds family
  purchases); Google Play Families / Family Library (family manager's payment method); GDPR Art 28
  processor framing (`MMT-ADR-0002`, merchant of record = Apple/Google). Uniform EU/US/UK — store-ToS
  driven, not statute-driven.
- **Note:** access-inert attribution (verified — no permissions ride on it); a stale value is
  recoverable by re-sync (worst case: wrong name on a billing screen).

#### I-L1 — Retention periods on the three `person_retain` tables  `[Parameters]`
| Table | Floor | basis |
|---|---|---|
| `consent_receipt` | **Until (ward turns 18) + 3 years**; adult floor **3 years** from withdrawal | GDPR Art 5(2) + Art 7(1) (must demonstrate consent) + EDPB Guidelines 05/2020 §7.1; UK Limitation Act 1980 s.28 (minor disability — clock from 18); (phase-2 US: COPPA §312.10 "only as long as reasonably necessary") |
| `deletion_audit` | **6 years** (or until ward 18 + 3y, whichever is longer for a minor) | GDPR Art 5(2) (accountability) + Art 30; UK Limitation Act 1980 (6y contract) + s.28 minor-tolling |
| `financial_record` | **Per-jurisdiction; conservative single floor = 10 years** (NO 5 / UK 6 / US 7 / DEEU 10) | Norway *bokføringsloven* §13 (5y); DE §147 AO / EU VAT Directive 2006/112 (10y); UK Companies Act 2006 s.388 / HMRC (6y); US IRC §6501 (7y) |
- **Per-jurisdiction split is real** for `financial_record` — the `retention_period` column stores
  the value per-row; the schema doesn't need to know the regime at read time.
- **PM opt-up note:** audit value past the legal floor is real, but Art 5(1)(e) storage-limitation
  caps over-retention — do not opt to "forever."

#### I-L2 — Dormancy threshold + pre-deletion notice  `[Parameters + Rule on surface]`
- **Dormancy threshold = 24 months** of no `last_activity_at`. `basis:` GDPR Art 5(1)(e) storage
  limitation; ICO Children's Code std 8 (data minimisation). **Monitor:** shorten for minor accounts
  if Children's Code guidance tightens.
- **Pre-deletion notice = 30 days** between notice and deletion. `basis:` GDPR Art 12(1) (transparency)
  + proportionate-notice good practice.
- **Notice surface `[Rule]`:** **email is the primary required channel** (the dormant user won't
  see in-app); in-app fires as secondary on next open. For a **minor with active guardianship**, the
  notice must also be capable of reaching the **guardian**. `basis:` GDPR Art 12(1) (accessible means);
  ICO Children's Code std 4 (transparency to children) + the guardianship relationship.

#### I-L3 — Moved-country grace window  `[Parameter]`
- **Grace = 30 days** before `suspend-to-browse-preview` fires; the user retains browse-preview (no
  hard lockout, per the E2 ruling) while consents re-affirm under the new jurisdiction.
- `basis:` GDPR Art 5(1)(c) minimisation + proportionality (time to read the new-jurisdiction
  disclosures). **Monitor:** UK Children's Wellbeing & Schools Act 2026 age-assurance (the primary
  watch per the 2026-06-03 handoff — *not* the Crime & Policing Act).

#### I-L4 — Boundary-crossing verification method (protection-lowering)  `[Parameters per crossing]`
| Crossing | At 13+ launch | Method | basis |
|---|---|---|---|
| **Under-13 exit** | **N/A at launch → phase-2** | COPPA-enumerated tier (payment-card+txn, gov-ID match, signed form, video, KBA) — highest rigor; G7 phase-2 option | COPPA 16 CFR §312.5(b)(1)-(2) |
| **13–16 crossing** | **LAUNCH-relevant** | "Reasonable efforts considering available technology" — proportionate, **not** gov-ID: payment-card-light / KBA / vendor-attested soft signal + self-declaration | GDPR Art 8(2) + Recital 38 + EDPB Guidelines 05/2020 §7.1 |
| **17→18 (adult-onset)** | applies | Lightest — single-step self-declaration / payment-card; a genuine adult clears in one step | `I-PB-B2b`; GDPR Art 16 (rectification) |
- **G7 handoff:** at launch the vendor must meet the **13–16 "reasonable efforts" bar**; the under-13
  COPPA-enumerated tier is a **phase-2 option in the RFP**, not a launch blocker. This is the key G7
  recalibration from the 13+ decision.

#### I-L5 — Co-guardian one-of / all-of rule  `[Rule, per-operation]`
- **Default = one-of** (either holder of parental responsibility may act alone) for routine
  consent-bearing ops: data-disclosure change, marketing opt-in, age-related consent re-affirmation.
- **Irreversible ops (account/data deletion) = one-of-PLUS-notice:** the requesting guardian initiates;
  the other guardian is notified with an objection window. *Not* strict all-of (deadlocks a child
  living between two homes); *not* bare one-of (lets one parent unilaterally destroy). The product
  surfaces "the other guardian has been notified."
- **Default in absence of config = one-of** (friendlier for a child between two homes), with the
  irreversible-op notice as the safety valve.
- `basis:` UK Children Act 1989 s.2(7) (each holder may act alone, save where consensus is statutorily
  required) + major-decision caveat; Norway *barnelova* §30 + §37 (joint parental responsibility);
  COPPA single-parent VPC (16 CFR §312.5). PM validates the product envelope.

**Code-Verification Log (V1–V5; ledger §"Code-Verification Log"):**
- **V1:** "11" floor in `birthYearSchema` (tag `CR-2026-05-19-H11`) — ✅ true, **mis-cited** in
  data-model §9 (real path `packages/schemas/src/profiles.ts:38-54`; data-model §9 cited
  `packages/database/src/schema/profiles.ts:38-50` — a different file).
- **V2:** Seam columns "in place / in the schema" — ⚠️ phrasing false (the columns exist only in
  `_wip/` docs; built in Phase F); conclusion holds (no silently-set value to miss).
- **V3:** Current `subscription` shape — ✅ true (grounds P6 + L1).
- **V4:** A COPPA-13 boundary already exists in code — ✅ note (`PRONOUNS_PROMPT_MIN_AGE = 13`,
  `profiles.ts:36`).
- **V5:** The `owner` fossil the model dissolves — ✅ note (Phase-F isOwner→admin rekey target).

**Carry-forward (named, not gating):** the values fill the seams; the Phase-F **launch-readiness
guard** (the `apps/api/src/services/identity/launch-readiness.test.ts` spec tracked in the ROADMAP
threads) is the pre-launch check that the build actually reads the values above (not placeholder zeros).
G7 vendor pick remains on the procurement track, sized to the 13–16 bar at launch + 11+ phase-2
option in the RFP.

