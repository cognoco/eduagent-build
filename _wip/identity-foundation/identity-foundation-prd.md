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

- **D1 — Login-mode default per tier. RULED 2026-06-02 `[P✓ · T pending — see ripple]`.** **Self-signup → the
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
  (inv 17/10, §2.4, §3.2; ADR 0002; CONTEXT Payer+minor). For store-mediated payment (the only channel for
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
- **E5 — Last-guardian departure / charge custody. PM LEAN 2026-06-02 `[P-lean · RIPPLE → architect · T pending]`.**
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
  **RIPPLE → architect (T-axis reverts to pending per the Part-10 ripple rule):** elevating E12 from Phase-D-deferred
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
