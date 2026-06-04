# Identity Foundation — Domain Model (Phase D)

**Status:** **RATIFIED — Phase D, 2026-06-03.** Entities / roles / consent model / tenancy locked;
org/membership re-derived (not inherited from the archived `0106` design). The four Phase-D ADRs
(MMT-ADR-0007…0010) are placed in `docs/adr/`; the ontology + `CONTEXT.md` move in lockstep.
**Date:** 2026-06-03 · **Owner:** Claude (architect ratifies) · **Feeds:** Phase E (data model).

**What this is.** The single consolidated domain model for the identity foundation — the locked
entity/relationship graph, the authority model, the consent model, the tenancy/governance posture,
the transition lifecycle, and the v1 family-join primitive. It is written in the ontology's ratified
vocabulary and carries the PRD Part 10 product rulings forward. It **consolidates and rules**; it does
not restate the ontology line-by-line.

**What this is NOT.** Not physical schema (tables / columns / migrations / the `profiles`→`person`
rename = **Phase E**). Not behaviour/journeys/copy (= `identity-foundation-prd.md`). Not code, not
Cosmo work items (= **Phase F** gate).

**Sources (each ruling traces to ratified canon):**
- Vocabulary + the 30 invariants: `identity-ontology.md` v1.1 (RATIFIED).
- Product rulings + the 4 architecture ripples: `identity-foundation-prd.md` Part 10 (esp. §H).
- Discovery/options: `domain-model-options.md` (Fold #1 into the ontology), `age-consent-spike.md`.
- Decisions layer: MMT-ADR-0001 (own the graph), 0002 (payer store-delegated), **0007–0010** (Phase D).

---

## §1 — The entity–relationship model  *(entities locked)*

The clean cut splits the three things today's `accounts` row fuses — **human**, **login**, **tenant** —
into separate entities, and scopes all learning data to the **human** (MMT-ADR-0007).

```
                 0..1                         M:N (role set {admin, learner})
   Login ●───────────────● Person ●──────────────────────────────● Organization
 (Clerk User)            │   │  │                                      │ 1
                         │   │  │  ◀── Guardianship edge (global) ──▶  │
                         │   │  └──────● Person (charge)               ● Subscription
                         │   │                                          · Payer = a Person (designation)
                         │   └─────────● Person (mentee)
                         │      ◀── Mentorship edge (dyadic, scoped) ──▶
                         └── attributes: residence_jurisdiction (time-versioned),
                             login-presence (managed|credentialed), AgeConsentDecision (computed)
```

| Concept | Kind | One-line definition | Cite |
|---|---|---|---|
| **Person** | entity | one human; permanent subject of learning data, consent, identity — login or not. Scoping key for every learning record. | ont §1.1; ADR-0007 |
| **Login** | entity | the authentication binding to a Clerk User; **0..1 per Person** (absence = *managed*, presence = *credentialed*). | ont §1.2; ADR-0001/0007 |
| **Organization** | entity | thin grouping + billing container; auto-created org-of-one at signup; **never owns a Person or their data**. | ont §1.3; ADR-0007 |
| **Subscription** | entity | entitlement + billing state on the Organization; carries the Payer. | ont §1.4 |
| **Membership** | edge (M:N) | Person ↔ Organization, carrying role set `{admin, learner}`; grants **existence-visibility only**. | ont §2.1 |
| **Guardianship** | edge (dyadic, **global**) | guardian → charge; carries **consent-authority + the consent record**; Layer 1. | ont §2.2; **ADR-0008** |
| **Mentorship** | edge (dyadic, scoped) | mentor → mentee; **edge-scoped** visibility/help; Layer 2; **no** consent authority. | ont §2.3 |
| **Payer** | designation | a Person responsible for a Subscription's billing; **access-inert**. | ont §2.4; ADR-0002 |
| `residence_jurisdiction` | attribute (Person) | time-versioned; the jurisdiction input to consent; keyed off residence, not location. | ont §3.4 |
| login-presence | attribute (Person) | managed ⊥ credentialed; **independent of** consent-requirement (all 4 combos valid). | ont §3.1 |
| `AgeConsentDecision` | computed | the resolved consent decision the app reads (requirement + satisfaction + method + expiry). | ont §3.2 |

**The three deliberate divergences from the standard model** (everything else adopts the standard
name): **Person** (credential-less human), **Guardianship**, **Consent**. That short list is the whole
reason this can't be bought off the shelf (ont §5).

---

## §2 — Roles, capacities & the three-layer authority model  *(roles locked)*

- **Membership roles = `{admin, learner}`** only (ADR-0007). `admin` = org management, age-agnostic,
  ≥1 per org, transferable, no data access without an edge. `learner` = activates the learning surface,
  capability-light, not auto-mandatory. **First member of an org is `admin`** (inv 5).
- **`mentor` / `guardian` are capacities on edges, never roles** (inv 6). A role is standing in an org;
  a capacity is the end you occupy on a dyadic edge.
- **Self-ownership is intrinsic to Person** — a Person reads+writes their **own** data regardless of
  roles (inv 7); `learner` activates the surface, it does not grant ownership.
- **Access to *another* Person's data is edge-derived** (guardian or mentor capacity); Membership alone
  grants only existence-visibility (inv 8). Mentor visibility is edge-scoped to the named mentee (inv 9).

**The three concerns that must never fuse (inv 22)** — most transition bugs are a conflation of two:

| Concern | Carried by | Layer |
|---|---|---|
| **Consent authority** (give/withdraw lawful basis) | Guardianship edge (global) | Layer 1 |
| **Billing control** | Payer designation + `admin` | — |
| **Data visibility** | Mentorship edge / derived guardian view | Layer 2 |

---

## §3 — The consent model  *(consent model locked)*

Consent is **computed, never stamped** (inv 2's operational proof). Two complementary pieces (ont §3.2):

- **`resolveConsentRequirement(age × residence_jurisdiction)`** — the **policy function** (what the law
  requires). Worst-case default: ships strictest (16 / VPC-always), relaxed **per *verified*
  jurisdiction as config — never country-by-country code** (inv 29).
- **`AgeConsentDecision`** — the resolved-decision object the app reads and never looks behind: the
  single **COPPA-portable seam**. Fields (shape locked; enum values pinned in Phase E): `ageBand`,
  `consentStatus`, `assuranceLevel`, `consentMethod`, `jurisdiction`,
  `purposeScope {core, thirdPartyShare, targetedAds, aiTraining}`, `retentionExpiresAt`, `receiptId`.

Rules that bind the model:
- **Consent is method-typed, per-purpose, withdrawable, jurisdiction-relative** (inv 12, 27). A record
  valid under jurisdiction A may not satisfy B, so it does not auto-transfer across a residence change.
- **Consent-authority is Layer-1 Guardianship** (global edge, **ADR-0008**); evaluated over the **set**
  of guardian-of edges (`consentSatisfied = f({edges}, the jurisdiction's one-of/all-of rule)`, inv 11).
  The one-of/all-of rule itself is legal — **deferred to counsel (E4 / REQ-2)**; the set *shape* is locked.
- **Age-gate precedes collection** (inv 26): an age-range is captured first; **no profile or learning
  data is persisted until lawful basis is established.**
- **Consent ≠ contract** (inv 28): a consent-gated Person's processing rests on verifiable guardian
  consent, never on the guardian's account-holder status.
- **Below the credential-eligibility floor → guardian-created only** (inv 13); the real floor is a
  per-jurisdiction policy value + app-store-rating call (FLAG-2), not a constant.
- **Decision transport** (ADR-0001): Clerk may carry the *resolved* decision as ~3 JWT claims; **we own**
  the consent receipts + age-assurance audit + event log in Neon. Clerk Organizations are not used.

The **VPC vendor** (KWS vs k-ID) and the precise per-jurisdiction policy table are **Phase E / counsel**;
the model commits only to "method-typed, pluggable, per-purpose."

---

## §4 — Tenancy & governance  *(tenancy locked; org/membership re-derived, not inherited)*

- **Organization is thin** (ADR-0007): a grouping + billing container that does no access/consent work
  and never owns a Person. The danger was never the table — it was letting the org carry
  access/consent (the legacy `accounts` mistake). All real semantics live on Person + edges.
- **Billing + consent follow the home Organization** (inv 18): a second-org edge grants edge-scoped
  visibility only — changing neither who pays nor who consents.

**Guardianship capability placement (D1/E9) — RULED Option A (MMT-ADR-0008).** One **global**
Guardianship edge stores **consent-authority + the consent record only**; the operational capabilities
(`operate` / `manage` / `view`) are **derived at query time**:
`op(G, C) ⇐ (G —guardian-of→ C) ∧ (G, C co-members of the same org) ∧ (C has no Login)` — a
**credentialed charge suppresses guardian `operate`** (the tween divergence falls out of login-presence,
not a stored flag). The check lives in **one named resolver** (the clean successor to the buggy
`getFamilyOwnerProfileId`), never re-derived at call sites.

**Multi-org governance (E7) — split by axis:**
- **Consent / visibility axis → ruled** by the ADR-0008 derivation: consent over the *set* of guardian
  edges; visibility = guardian-link ∧ shared org. This is what keeps the **separated-parents / one-Person
  model reachable** (E8) without building it — Person ≠ Login + a global consent edge + multi-org
  Membership express "one child, two guardian edges, two memberships" for free; only regressing to the
  fused/account-bound shape would foreclose it, and the clean cut forbids that.
- **Billing / quota axis → v1 collapses to a single home org** (MMT-ADR-0010): the v1 family-join is a
  *consolidation*, not a federation, so genuine multi-org billing/quota governance is **Phase-D-deferred**
  (named, not dropped). Whether v1 *builds* shared-custody is a product + legal call (E8 → PM/counsel).

---

## §5 — Transition lifecycle & the scheduler

A Person moves between states by **rebinding something to the *same* `person_id`**, never by creating a
new Person and migrating (inv 20 — this is why Person ≠ Login is load-bearing). Two trigger classes;
the distinction is load-bearing:

- **Action-triggered** — handled in-band (parent grants a login, adds a child, withdraws consent, a join).
- **Time-triggered** — fire with **no user action**; a dormant account still transitions on its
  birthday → they **cannot live only in request handlers** (inv 24).

**The transition catalogue** (requirements locked here; mechanism = Phase E):

| # | Transition | Trigger | Rebinds | Invariant guards | PRD ruling |
|---|---|---|---|---|---|
| **T1** | managed → credentialed (gets a Login) | action | a Login attaches to the existing Person | 20 (same id), 21 | D1 invite-flow (ADR-0010) |
| **T2** | consent gate lifts (crosses consent age) | **time** | `consentRequired` re-evaluates false; guardian visibility → **teen opt-in, default off** | 19, 22, 24 | E1 (per-dimension) |
| **T3** | minor → adult at 18 (graduation) | **time** | guardianship dissolves; org/billing **offered**, not forced | 20, 21, 25 (interim states) | E1/E5 |
| **T4** | residence_jurisdiction change | action + scheduler backstop | `consentRequired` re-evaluates; gate may **re-engage** → suspend into R3 holding | 11, 12, 24, 25 | E2 (suspend + re-prompt) |
| **T5** | guardianship mutation (add/remove/withdraw) | action | the guardian edge(s); consent authority may move | 11, 21, 25 | E4/E5 |
| **T6** | de-credential (credentialed → managed) | — | — | — | **disallowed** (E10); manual audited ops only |

**Named interim states are valid states, never implicit gaps** (inv 25): graduation-pre-org-choice,
the dormant-adult-with-no-Login, "suspended pending fresh consent", and `migration-pending`. Each carries
a Failure-Modes table (repo UX-resilience rule).

**The time-trigger rail = one unified daily sweep (MMT-ADR-0009).** A single Inngest cron + per-Person
fan-out (mirroring `daily-snapshot.ts`) evaluates all time-based conditions in one pass —
**age/threshold (E1), residence re-eval (E2), inactivity-expiry/dormancy (E5)** — idempotency-keyed
`personId + day`, per-Person failure isolation. Phase-E note: the age scan can't filter to
recently-active Persons (a dormant account still ages) → an index on `birth_date` / `last_activity`.

---

## §6 — The v1 family-join / consolidation primitive

A minimal **"join my family" ships in v1** (E12, PM-required), built on a **shared invite/consolidation
primitive** that also serves D1 add-child-own-device and the E1 self-takeover (MMT-ADR-0010).

- **Provisioning = child completes their own Clerk sign-up** (existing JIT `findOrCreateAccount`), then
  the self-provisioned Login is **attached to the family graph against the existing `person_id`** via a
  named **`migration-pending`** interim. **Not** parent-creates-credential (no Clerk admin-write / no
  password handoff; and only invite-flow is coherent with the E1 self-takeover).
- **v1 journey (consent-capable teen, parent-initiated):** parent buys Family → invites their
  existing-account teen → teen accepts → **home-org reassignment** (add the family Membership **before**
  decommissioning the teen's empty org-of-one; never orphan, inv 21/25). Parent becomes
  **admin + Payer + an *optional* Mentorship the teen grants** (inv 19) — **never auto-Guardianship**
  (the teen self-consents, inv 14/19). The teen's person + history are preserved (inv 20/21).
- **v1 collapses to a single home org → sidesteps multi-org federation (E7).**
- **Billing → option B (join-with-disclaimer):** teen with an active store sub joins immediately
  (family quota seat) and keeps paying their own store sub until they self-cancel (store-delegated
  billing rules out a server-side refund), with an explicit double-charge warning + nudge.
- **Scope held (Phase-D-deferred):** the below-consent-age teen join (Guardianship + VPC, R13); the
  **child-initiated** request-to-join (E13 — v1 is parent-initiated invite). Minor-initiated
  **Guardianship** stays banned (inv 28/30).

---

## §7 — Handoff to Phase E + open legal

**Status: Phase E RATIFIED 2026-06-04 — the items below are the design *intent*; their physical realization
is `data-model.md` §2–§4 and the two new ADRs. Items not closed by Phase E (E3 value, retention *values*,
break-tests) remain on the F/legal tracks as named seams.**

**To Phase E (data model) — now realized in `data-model.md` + MMT-ADR-0011/0012:**
- Physical schema for every entity/edge/attribute above + the `profiles`→`person` rename surface.
  **→** `data-model.md` §2 (table inventory) + §4 (per-table rationale). The squash is `MMT-ADR-0012`.
- **E3 — recorded-Payer identity under Family Sharing / Ask-to-Buy:** *which* Person a store-completed
  purchase records as Payer. Bounded blast radius (Payer is access-inert) — a billing-attribution
  question, not a security boundary (ADR-0002). **→** column in place (`subscription.payer_person_id`),
  value remains a Phase-F product + counsel call.
- The **ADR-0008 derivation query** (the one authority resolver) + its break-tests (incl. F1-BT-a
  no-self-fallback regression against the live `getFamilyOwnerProfileId` bug). **→** schema is the input;
  resolver + break-tests are Phase F.
- The **scheduler** function pair (ADR-0009) + the `birth_date` / `last_activity` index. **→** indexes in
  `data-model.md` §4.1; the sweep is now also the owner of consent refresh at age transitions (closes the
  `I-C4` live defect) + the moved-country grace window (`I-E3`).
- The **`migration-pending`** state machine + Failure-Modes tables (ADR-0010). **→** `data-model.md` §6.4
  (per-failure-mode table).
- The **segmented-deletion seam** (retain-financial / purge-learning) the retention carve-out forces.
  **→** `data-model.md` §4.9 (`person_retain` per-class set) + §6.1 (the `I-C1` fix-by-structure).

**To counsel (REQ-2 register — none gate F as a whole; see ROADMAP threads):** E4 one-of/all-of rule;
dormancy period + pre-deletion notice + retention carve-outs; parent-delete permissibility (get a binary
read before… already T✓ via inv 21 amendment); minor double-billing disclosure + grace; VPC scope.
**G7 vendor pick** (KWS vs k-ID) is the technical reviewer's procurement call, after legal requirements.

---

## §8 — Decisions ledger

| Decision | Ruling | ADR | Status |
|---|---|---|---|
| Core entity & role model (entities/roles/Person≠Login) | as ont Grill #1 | **MMT-ADR-0007** (reconstructed) | locked |
| Guardianship capability placement (D1/E9) | Option A — global edge, derived operation | **MMT-ADR-0008** | locked |
| Multi-org governance — consent/visibility (E7) | ruled by the ADR-0008 derivation | MMT-ADR-0008 | locked |
| Multi-org governance — billing/quota (E7) | v1 single home org; federation deferred | MMT-ADR-0010 | v1 ruled; federation → post-v1 |
| Durable transition scheduler (inv 24) | Option 1 — unified daily sweep | **MMT-ADR-0009** | locked |
| Family-join / consolidation primitive (E12, D1, E1-takeover) | invite-flow + consolidation; billing opt B | **MMT-ADR-0010** | v1 ruled |
| Separated parents one-vs-two Person (E8) | reachability locked; v1 build scope | — | product + legal (PM) |
| Recorded-Payer under Family Sharing (E3) | — | — | → Phase E |
| Co-guardian one-of/all-of (E4) | set *shape* locked; rule → counsel | — | → counsel |
| De-credential (T6/E10) | disallowed; manual audited ops only | — | locked |

**Phase D exit gate met:** entities / roles / consent model / tenancy locked; org/membership re-derived,
not inherited. **→ Phase E (data model) is unblocked.**
