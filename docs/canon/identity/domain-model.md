# Identity Foundation — Domain Model

**Layer:** L1 canon (identity domain). **Traces to:** the identity ontology (vocabulary + the numbered
invariants `inv 1`–`inv 30`) and `MMT-ADR-0001` (own the graph), `0002` (Payer store-delegated),
`0007`–`0010` (Phase-D entity/role, guardianship, scheduler, family-join). Ratification provenance:
`_wip/identity-foundation/_history/domain-model-provenance.md`.

**What this is.** The consolidated domain model for the identity foundation — the entity/relationship
graph, the authority model, the consent model, the tenancy/governance posture, the transition lifecycle,
and the v1 family-join primitive, in the ontology's vocabulary. It **consolidates and rules**; it does
not restate the ontology line-by-line.

**What this is NOT.** Not physical schema (tables / columns / migrations = `data-model.md`). Not
behaviour / journeys / copy (= `prd.md`).

---

## §1 — The entity–relationship model

The clean cut splits the three things today's `accounts` row fuses — **human**, **login**, **tenant** —
into separate entities, and scopes all learning data to the **human** (`MMT-ADR-0007`).

```
                 0..1                         M:N (role set {admin, learner})
   Login ●───────────────● Person ●──────────────────────────────● Organization
 (Clerk User)            │   │  │                                      │ 1
                         │   │  │  ◀── Guardianship edge (global) ──▶  │
                         │   │  └──────● Person (charge)               ● Subscription
                         │   │                                          · Payer = a Person (designation)
                         │   └─────────● Person (supportee)
                         │      ◀── Supportership edge (dyadic, scoped) ──▶
                         └── attributes: residence_jurisdiction (time-versioned),
                             login-presence (managed|credentialed), AgeConsentDecision (computed)
```

| Concept | Kind | One-line definition | Trace |
|---|---|---|---|
| **Person** | entity | one human; permanent subject of learning data, consent, identity — login or not. Scoping key for every learning record. | ontology §1.1; `MMT-ADR-0007` |
| **Login** | entity | the authentication binding to a Clerk User; **0..1 per Person** (absence = *managed*, presence = *credentialed*). | ontology §1.2; `MMT-ADR-0001`/`0007` |
| **Organization** | entity | thin grouping + billing container; auto-created org-of-one at signup; **never owns a Person or their data**. | ontology §1.3; `MMT-ADR-0007` |
| **Subscription** | entity | entitlement + billing state on the Organization; carries the Payer. | ontology §1.4 |
| **Membership** | edge (M:N) | Person ↔ Organization, carrying role set `{admin, learner}`; grants **existence-visibility only**. | ontology §2.1 |
| **Guardianship** | edge (dyadic, **global**) | guardian → charge; carries **consent-authority + the consent record**; Layer 1. | ontology §2.2; `MMT-ADR-0008` |
| **Supportership** | edge (dyadic, scoped) | supporter → supportee; **edge-scoped** visibility/help; Layer 2; **no** consent authority. | ontology §2.3 |
| **Payer** | designation | a Person responsible for a Subscription's billing; **access-inert**. | ontology §2.4; `MMT-ADR-0002` |
| `residence_jurisdiction` | attribute (Person) | time-versioned; the jurisdiction input to consent; keyed off residence, not location. | ontology §3.4 |
| login-presence | attribute (Person) | managed ⊥ credentialed; **independent of** consent-requirement (all 4 combos valid). | ontology §3.1 |
| `AgeConsentDecision` | computed | the resolved consent decision the app reads (requirement + satisfaction + method + expiry). | ontology §3.2 |

**The three deliberate divergences from the standard model** (everything else adopts the standard
name): **Person** (credential-less human), **Guardianship**, **Consent**. That short list is the whole
reason this can't be bought off the shelf (ontology §5).

---

## §2 — Roles, capacities & the three-layer authority model

- **Membership roles = `{admin, learner}`** only (`MMT-ADR-0007`). `admin` = org management, age-agnostic,
  ≥1 per org, transferable, no data access without an edge. `learner` = activates the learning surface,
  capability-light, not auto-mandatory. **The first member of an org is `admin`** (inv 5).
- **`supporter` / `guardian` are capacities on edges, never roles** (inv 6). A role is standing in an org;
  a capacity is the end you occupy on a dyadic edge.
- **Self-ownership is intrinsic to Person** — a Person reads+writes their **own** data regardless of
  roles (inv 7); `learner` activates the surface, it does not grant ownership.
- **Access to *another* Person's data is edge-derived** (a guardian or supporter capacity); Membership
  alone grants only existence-visibility (inv 8). **Supporter visibility is edge-scoped to the named
  supportee**, never org-wide (inv 9).

**The three concerns that must never fuse** (inv 22) — most transition bugs are a conflation of two:

| Concern | Carried by | Layer |
|---|---|---|
| **Consent authority** (give/withdraw lawful basis) | Guardianship edge (global) | Layer 1 |
| **Billing control** | Payer designation + `admin` | — |
| **Data visibility** | Supportership edge / derived guardian view | Layer 2 |

---

## §3 — The consent model

Consent is **computed, never stamped** (inv 2). Two complementary pieces (ontology §3.2):

- **`resolveConsentRequirement(age × residence_jurisdiction)`** — the **policy function** (what the law
  requires). Worst-case default: ships strictest (16 / VPC-always), relaxed **per *verified*
  jurisdiction as config — never country-by-country code** (inv 29).
- **`AgeConsentDecision`** — the resolved-decision object the app reads and never looks behind: the
  single **COPPA-portable seam**. Fields (shape locked; enum values pinned in `data-model.md`): `ageBand`,
  `consentStatus`, `assuranceLevel`, `consentMethod`, `jurisdiction`,
  `purposeScope {core, thirdPartyShare, targetedAds, aiTraining}`, `retentionExpiresAt`, `receiptId`.

Rules that bind the model:
- **Consent is method-typed, per-purpose, withdrawable, jurisdiction-relative** (inv 12, 27). A record
  valid under jurisdiction A may not satisfy B, so it does not auto-transfer across a residence change.
- **Consent-authority is Layer-1 Guardianship** (global edge, `MMT-ADR-0008`); evaluated over the **set**
  of guardian-of edges (`consentSatisfied = f({edges}, the jurisdiction's one-of/all-of rule)`, inv 11).
  The one-of/all-of rule itself is legal — **pending counsel**; the set *shape* is locked.
- **Age-gate precedes collection** (inv 26): an age-range is captured first; **no profile or learning
  data is persisted until lawful basis is established.**
- **Consent ≠ contract** (inv 28): a consent-gated Person's processing rests on verifiable guardian
  consent, never on the guardian's account-holder status.
- **Below the credential-eligibility floor → guardian-created only** (inv 13). **The floor is 13** —
  the child-claimable account-detachment age, closing inv 13's open floor decision (account-detachment is
  guardian-grantable at any age; child-claimable at 13+). Per-jurisdiction policy + app-store-rating may
  raise the floor (be **stricter**) for a given jurisdiction, **never lower it below 13**.
  *(Ruled 2026-06-09, OQ-11 — `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md` §1.3/§4.2.)*
- **Decision transport** (`MMT-ADR-0001`): Clerk may carry the *resolved* decision as ~3 JWT claims;
  **we own** the consent receipts + age-assurance audit + event log in Neon. Clerk Organizations are not used.

The **VPC vendor** and the precise per-jurisdiction policy table are counsel/procurement calls; the
model commits only to "method-typed, pluggable, per-purpose."

---

## §4 — Tenancy & governance  *(org/membership re-derived, not inherited)*

- **Organization is thin** (`MMT-ADR-0007`): a grouping + billing container that does no access/consent
  work and never owns a Person. The danger was never the table — it was letting the org carry
  access/consent (the legacy `accounts` mistake). All real semantics live on Person + edges.
- **Billing + consent follow the home Organization** (inv 18): a second-org edge grants edge-scoped
  visibility only — changing neither who pays nor who consents.

**Guardianship capability placement — Option A (`MMT-ADR-0008`).** One **global** Guardianship edge
stores **consent-authority + the consent record only**; the operational capabilities
(`operate` / `manage` / `view`) are **derived at query time**:
`op(G, C) ⇐ (G —guardian-of→ C) ∧ (G, C co-members of the same org) ∧ (C has no Login)` — a
**credentialed charge suppresses guardian `operate`** (the tween divergence falls out of login-presence,
not a stored flag). The check lives in **one named resolver** (the clean successor to the buggy
`getFamilyOwnerProfileId`), never re-derived at call sites.

**Multi-org governance — split by axis:**
- **Consent / visibility axis → ruled** by the `MMT-ADR-0008` derivation: consent over the *set* of
  guardian edges; visibility = guardian-link ∧ shared org. This is what keeps the **separated-parents /
  one-Person model reachable** without building it — Person ≠ Login + a global consent edge + multi-org
  Membership express "one child, two guardian edges, two memberships" for free; only regressing to the
  fused/account-bound shape would foreclose it, and the clean cut forbids that.
- **Billing / quota axis → v1 collapses to a single home org** (`MMT-ADR-0010`): the v1 family-join is a
  *consolidation*, not a federation, so genuine multi-org billing/quota governance is **deferred beyond
  v1** (named, not dropped). Whether v1 *builds* shared-custody is a product + legal call.

---

## §5 — Transition lifecycle & the scheduler

A Person moves between states by **rebinding something to the *same* `person_id`**, never by creating a
new Person and migrating (inv 20 — this is why Person ≠ Login is load-bearing). Two trigger classes; the
distinction is load-bearing:

- **Action-triggered** — handled in-band (parent grants a login, adds a child, withdraws consent, a join).
- **Time-triggered** — fire with **no user action** (inv 24); a dormant account still transitions on its
  birthday → they **cannot live only in request handlers**.

**The transition catalogue** (requirements locked here; mechanism = `data-model.md`):

| Transition | Trigger | Rebinds | Behaviour |
|---|---|---|---|
| **account-detachment** (managed → credentialed; gets a Login) | action | a Login attaches to the existing `person_id`; consent + guardianship edge unchanged; guardian-grantable any age, child-claimable at 13+ | invite-flow (`MMT-ADR-0010`); *(ruled 2026-06-09, OQ-11 — `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md` §1.1/§1.3/§4.1/§4.2)* |
| consent gate lifts (crosses consent age) | **time** | `consentRequired` re-evaluates false; guardian visibility → **teen opt-in, default off** | per-dimension |
| **18-crossing** (minor → adult; guardianship dissolves) | **time** | guardianship dissolves; org/billing **offered**, not forced | named interim states |
| residence_jurisdiction change | action + scheduler backstop | `consentRequired` re-evaluates; gate may **re-engage** → suspend into a consent-holding state | suspend + re-prompt |
| guardianship mutation (add/remove/withdraw) | action | the guardian edge(s); consent authority may move | — |
| de-credential (credentialed → managed) | — | — | **disallowed**; manual audited ops only |

**Named interim states are valid states, never implicit gaps** (inv 25): graduation-pre-org-choice, the
dormant-adult-with-no-Login, "suspended pending fresh consent", and `migration-pending`. Each carries a
Failure-Modes table (repo UX-resilience rule).

**The time-trigger rail = one unified daily sweep (`MMT-ADR-0009`).** A single Inngest cron + per-Person
fan-out (mirroring `daily-snapshot.ts`) evaluates all time-based conditions in one pass —
age/threshold crossing, residence re-evaluation, inactivity-expiry/dormancy — idempotency-keyed
`personId + day`, with per-Person failure isolation. The age scan cannot filter to recently-active
Persons (a dormant account still ages), so it indexes on `birth_date` / `last_activity`
(`data-model.md` §4.1).

---

## §6 — The v1 family-join / consolidation primitive

A minimal **"join my family" ships in v1**, built on a **shared invite/consolidation primitive** that
also serves add-child-own-device and the consent-age self-takeover (`MMT-ADR-0010`).

- **Provisioning = child completes their own Clerk sign-up** (existing JIT `findOrCreateAccount`), then
  the self-provisioned Login is **attached to the family graph against the existing `person_id`** via a
  named **`migration-pending`** interim. **Not** parent-creates-credential (no Clerk admin-write / no
  password handoff; and only invite-flow is coherent with the self-takeover).
- **v1 journey (consent-capable teen, parent-initiated):** parent buys Family → invites their
  existing-account teen → teen accepts → **home-org reassignment** (add the family Membership **before**
  decommissioning the teen's empty org-of-one; never orphan). Parent becomes **admin + Payer + an
  *optional* Supportership the teen grants** (inv 19) — **never auto-Guardianship** (the teen
  self-consents, inv 14). The teen's person + history are preserved (inv 20/21).
- **v1 collapses to a single home org → sidesteps multi-org federation.**
- **Billing → join-with-disclaimer:** a teen with an active store sub joins immediately (family quota
  seat) and keeps paying their own store sub until they self-cancel (store-delegated billing rules out a
  server-side refund), with an explicit double-charge warning + nudge.
- **Scope held (deferred beyond v1):** the below-consent-age teen join (Guardianship + VPC); the
  **child-initiated** request-to-join (v1 is parent-initiated invite). Minor-initiated **Guardianship**
  stays banned (inv 28/30).
