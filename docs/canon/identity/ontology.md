# Identity Foundation — Ontology (identity domain canon)

**Layer:** L1 canon (identity domain). **Traces to:** the numbered invariants `inv 1`–`inv 30` (§4 is
their canonical home), `MMT-ADR-0001`/`0002`/`0007`–`0012`, and the sibling identity canon
(`domain-model.md`, `data-model.md`, `prd.md`). **CONTEXT.md extracts its identity glossary from this
doc.**

**What this is.** The single *structural* terminus for the identity foundation: the entities, their
one-line definitions, the relationships between them, and the invariants that bind them — in one
agreed vocabulary that the PRD is *written in*, the data model *persists*, and CONTEXT.md *extracts
its glossary from*. It is the referee that stops term-drift.

**What this is NOT.** Not physical schema (columns/tables/migrations = `data-model.md`). Not the PRD
(behaviour/journeys = `prd.md`). It is the *logical* model; the physical realization stands separately
and consistently beside it.

**The one rule that kills most drift:** *adopt the standard-model term unless the domain forces a
divergence; when it diverges, record why.* This converts vocabulary fights from taste ("what should
we call it") into tests ("does the standard term fit — yes/no").

The four sources each concept is reconciled against: **intent** (the reconstructed PRD), **standard
models** (Clerk data model + B2B-SaaS RBAC/ABAC — adopt standard names where they fit), **domain
spikes** (tenancy/IdP, age/consent), and **current code** (cited as drift, not authority).

---

## §1 — Entities (the nouns)

Micro-template per entity: **definition** · **standard-model name** · **canonical term** · **rationale**.

### §1.1 — Person
- **Definition:** one human; the permanent subject of learning data, consent, and identity —
  **whether or not they can log in.** The scoping key for all learning data.
- **Standard name:** *User* / *Identity* / *Subject* (RBAC: the principal).
- **Canonical: `Person`.** Keep **"Learner"** as a *context hat* (a Person who is learning), not a
  synonym for the entity.
- **Rationale:** the standards split on the human — Clerk/B2B-SaaS say "User" (login-coupled), but
  NIST RBAC defines User as "a human being" and ABAC calls the principal "Subject" (the attribute-
  carrier). `Person` is the RBAC-human / ABAC-Subject, named to shed the login coupling that "User"
  implies — it cleanly holds the credential-less child.

### §1.2 — Login
- **Definition:** the **authentication binding** between a Person and their Clerk User — the means by
  which a Person signs in. **Optional, 0..1 per Person.** Its *absence* is what "managed" means.
- **Standard name:** Clerk **User** (we bind to it; we don't reuse the name). RBAC/ABAC give no entity
  name for "the login" — they treat authentication as a precondition.
- **Canonical: `Login`** = the binding to one Clerk User, **0..1 per Person**, multi-method handled
  inside that Clerk User via account-linking; **Clerk owns authentication only** (`MMT-ADR-0001`).
- **Rationale:** the load-bearing decoupling is **Person ≠ Login** — what lets one model hold both
  real account-holders and credential-less children. `Credential` was rejected (in security it means
  an auth *factor* — a collision we won't carry); the fused `account`-as-login concept is retired.

### §1.3 — Organization
- **Definition:** the **thin** grouping + billing container. Always exists (an org-of-one is
  auto-created at signup). Holds the Subscription. Does **no** access/consent work itself.
- **Standard name:** **Organization** / Tenant (universal in B2B-SaaS).
- **Canonical: `Organization`**, thin; **"Family" is a user-facing *label* on an Organization**, not a
  separate entity.
- **Rationale:** "family vs tutor roster vs school" must be org **data**, not schema. The danger is not
  the table — it's letting the Organization carry access/consent. Keep it as a dormant grouping/billing
  seam; all real semantics live on Person + edges. The table is kept pre-launch for B2B optionality.

### §1.4 — Subscription
- **Definition:** entitlement + billing state, **attached to the Organization.** Carries the Payer.
- **Standard name:** Stripe **customer → subscription** (customer = org).
- **Canonical: `Subscription` on `Organization`.** Quota is derived from the plan tier.

### §1.5 — Role
- **Definition:** a capability label carried by a Membership — the RBAC role set. **Canonical set:
  `{admin, learner}`** (only these two are roles; `supporter`/`guardian` are **capacities** on edges,
  §2.2/§2.3).
- **Standard name:** RBAC **Role → Permission** (kept as *data*, never `if (isOwner)`).
- **Canonical:**
  - **`admin`** = org management (members/invites/settings/billing-admin). Replaces the dissolved
    `owner`. Age-agnostic; ≥1 per org; transferable; >1 allowed. **No** learning-data access without an
    edge.
  - **`learner`** = "this member learns here" — the marker that **activates the learning surface**.
    Capability-light: self-ownership is **intrinsic to Person**, so `learner` grants nothing beyond it;
    it marks active participation + learner-seat counting. **Not auto-mandatory.**
  - `supporter` is **not a role** — it is a **capacity** on a Supportership edge (§2.3); `owner` is
    **dissolved** (→ admin / Payer / Guardianship).
- **Why:** `owner` was the fused fossil, split three ways. `student`→`learner`, and non-mandatory
  because an adult who only supports/pays/guards carries **no** learning role — their power is a
  capacity (supporter) or a Subscription field (Payer), not a `learner` role.

---

## §2 — Relationships (the edges)

Where the model lives. Membership grants *existence-visibility* only; **data access is edge-derived.**

### §2.1 — Membership
- **Definition:** the M:N link **Person ↔ Organization**, carrying the **role set `{admin, learner}`**
  (§1.5). Grants **existence-visibility** only ("you can see who is in this org"), never learning-data
  access.
- **Standard name:** **Membership** (carries roles) — universal.
- **Canonical:** the first member of an org is `admin`; supervisory ties (supporter/guardian) are
  **edges, not roles**. Multi-org falls out of the M:N join.

### §2.2 — Guardianship
- **Definition:** a **dyadic edge** asserting an adult holds **consent authority / act-for rights**
  over a (typically below-consent-age or credential-less) Person. Carries the **Consent record**.
- **Standard name:** none — **domain-specific** (no IdP/RBAC models consent authority over a
  credential-less person).
- **Canonical: Guardianship is an EDGE, never a role.**
- **The edge grants *separable capabilities* (inv 23), not one bundled flag:** *consent-authority* /
  *operate* / *manage* / *view*. **Term discipline — `capability` ≠ `capacity`:** a **capacity** is
  *which end* of an edge a Person occupies (guardian vs charge); a **capability** is *what the edge
  authorizes* them to do.
- **Rationale:** consent is "*guardian G consented for charge W, policy V, time T, revocable*" — a
  **per-pair** fact. One parent with three children has three independently-revocable records; an
  org-wide role cannot express that. So it is structurally an edge, with capability derived *from* the
  edge.
- **Far-end = `charge`** (formal/vernacular) ≡ **consent-gated learner** (technical synonym); the
  supportership far-end = `supportee` (§2.3).

### §2.3 — Supportership
- **Definition:** a **dyadic edge** granting a **supporter** (a capacity) **scoped visibility/help** for
  **one specific supportee** — never org-wide. Carries **no** consent authority (**Layer 2**).
- **Standard name:** a scoped ReBAC relationship ("supporter-of").
- **Canonical:** **Guardianship and Supportership are two distinct edges** — consent authority ≠
  visibility; fusing them is the trap. `supporter`/`guardian` are **capacities, not roles** (symmetric:
  both are edge-ends). **Authorization:** a Supportership is granted by the **supportee if consent-
  capable**, else by the **guardian** (for a charge); **graduation re-confirms** guardian-granted
  supporterships (inv 14–16). A single-charge supporter is **edge-only** (own org-of-one + cross-org
  edge) → never sees the family roster. UI may present guardian + supporter as one "supervisors of X"
  view **without** fusing the edges.

### §2.4 — Payer
- **Definition:** the Person responsible for a Subscription's billing. **A field on the Subscription,
  not a role and not a visibility grant.** **Access-inert** (no learning-data access).
- **Standard name:** Stripe customer's billing contact.
- **Canonical:** `Subscription.payer_person_id`, **no learning-data access**. **Payer *capacity* is
  delegated, not adjudicated by us:** for store-mediated payment (the only channel for the foreseeable
  future) the store is **merchant of record** and the sole capacity adjudicator — we impose no
  eligibility test. We adjudicate capacity ourselves **only** on a channel where no store is merchant of
  record (a future direct/web rail); there the default is a **flat ≥18 worst-case gate (inv 29), not a
  `jurisdiction × age` derivation** — over-restricting payment is harmless (an adult Payer can be
  attached) where over-restricting consent would block lawful learning. Per-jurisdiction relaxation
  stays available as config under the inv-29 pattern, **unbuilt unless a direct rail justifies it**.
  *(Open: which Person the store records as Payer under Family Sharing — see ROADMAP.)* Future B2B
  adds `payer_org_id` + an "exactly one set" check.

---

## §3 — Axes & attributes (NOT entities)

The drift engine was turning *attributes* into entities/tables. These stay as computed attributes.

### §3.1 — Login presence — "managed" vs "credentialed"
- A Person **has a Login (credentialed)** or **does not (managed)** — an **attribute of the Person**,
  not a cohort table or subtype.
- **Two independent dimensions — do NOT fuse them.** *Login-presence* (managed ⊥ credentialed) is
  **separate** from *consent-requirement* (`requiresGuardianConsent`, age × jurisdiction). All four
  combinations are valid:

  | | **credentialed** (has Login) | **managed** (no Login) |
  |---|---|---|
  | **consent-gated** (a charge) | child with their **own device** → credentialed charge | guardian-set-up child → managed charge |
  | **consent-capable** | normal adult/teen | rare: capable adult, no Login (shared-device/"Netflix") |

- **Therefore `charge` ≠ "no Login".** A charge is *consent-gated* (the consent dimension) and may be
  managed **or** credentialed. Device-sharing among *capable* users is solved by **login switching**,
  not managed profiles.

### §3.2 — Consent requirement & the consent decision
- **Not** a `minor` boolean. Two **complementary** pieces (not rival names):
  - **`resolveConsentRequirement(age × residence_jurisdiction)`** — the **policy function**: what the
    *law requires* (e.g. a 14-year-old in Germany needs guardian consent). Knows the rule only.
  - **`AgeConsentDecision`** — the **resolved-decision object** the rest of the app reads (and never
    looks behind): requirement **+** whether it is satisfied **+** how it was proven **+** expiry/
    receipt. The single **COPPA-portable seam** — swap the verification method underneath and app code
    is unchanged.
- **`AgeConsentDecision` fields (shape locked; enum *values* illustrative, pinned in `data-model.md`):**
  `ageBand` (jurisdiction-relative) · `consentStatus`
  (`NOT_REQUIRED | REQUIRED_PENDING | GRANTED | REVOKED | EXPIRED`) · `assuranceLevel`
  (`SELF_DECLARED | PLATFORM_GUARDIAN | VENDOR_VERIFIED | VPC_VERIFIED`) · `consentMethod`
  (`card | KBA | facial+review | platform:guardianDeclared | vendor:KWS …` — **never a bare boolean**) ·
  `jurisdiction` · `purposeScope { core, thirdPartyShare, targetedAds, aiTraining }` (inv 27) ·
  `retentionExpiresAt` · `receiptId` (→ ISO/IEC 27560 record).
- **Per-purpose, not global** (inv 27): the four `purposeScope` buckets are *secondary-/external-use*
  purposes — `core` (deliver the tutoring) / `thirdPartyShare` (data to an **external company** —
  analytics/ad SDKs) / `targetedAds` / `aiTraining` (train models on the child's work). **Distinct from
  internal helper access:** a human supporter seeing a charge's data is a **Supportership edge + a
  disclosure obligation**, *not* a `purposeScope` bucket.
- **Policy as data, worst-case default** (inv 29): a `jurisdiction × ageBand → policy` table (EU
  digital-consent age runs **13–16**; DE/NL/IE/PL = 16). Ship **strictest (16 / VPC-always), relax per
  *verified* jurisdiction as config — never country-by-country code**. `contentBand` (theming only,
  **never** gating) rides the same age ladder; **payment capacity does *not*** — it is **store-
  delegated** (inv 17), with a flat ≥18 default only on a future non-store rail.
- **Decision transport (`MMT-ADR-0001`):** Clerk may carry the *resolved* `AgeConsentDecision` as ~3
  JWT claims (`ageBand`/`consentStatus`/`assuranceLevel`); **we own** the consent receipts + age-
  assurance audit + event log in Neon. Clerk **Organizations are not used**.

### §3.3 — Content band / age bracket
- `computeAgeBracket` (`@eduagent/schemas`) — theming + copy **only**, never feature-gating. Keep
  as-is; it is the one identity-adjacent term that is *not* drifting.

### §3.4 — Residence jurisdiction
- A Person carries a **`residence_jurisdiction`**: a **first-class, time-versioned attribute** (history
  retained for audit — *"what policy was in force when we processed"*), keyed off **residence**, not
  current location (a holiday or VPN must not re-gate). It is the input to the consent computation
  (§3.2) that can change without a birthday.
- Consequence (drives the residence-change transition — see `domain-model.md` lifecycle): when it
  changes, `requiresGuardianConsent` re-evaluates under the **new** jurisdiction's threshold and the
  gate may **re-engage** with no age change — see inv 12 (satisfaction is jurisdiction-relative) and
  inv 24 (the re-evaluation must be scheduler-driven, not request-only).

### §3.5 — Authorization posture for v1
- v1 authorization = **RBAC** (roles `{admin, learner}` as *data*, never `if (isOwner)`) **+ a small
  set of ABAC attributes** (age × `residence_jurisdiction` → consent policy; any age-gated capability)
  **+ first-class relationship edges** (Guardianship, Supportership). **No external policy engine**
  (Zanzibar / OpenFGA / SpiceDB) at v1.
- Keep edges first-class so **ReBAC stays reachable** without retrofit. The test for "do we need an
  engine": permission decisions that must traverse *arbitrary-depth* relationship chains a roles-array
  + direct-edge check can't express. Revisit only if/when that appears.

---

## §4 — Invariants (the testable rules the PRD must honour)

The structural commitments — the canonical `inv 1`–`inv 30` register. The PRD's behaviour must not
contradict them; each becomes a break-test at build. These are the **definition of "done"** the PRD is
checked against.

**A — Identity & scoping**
1. Every Person belongs to ≥ 1 Organization (an *org-of-one* is auto-created at signup).
2. **Learning data is scoped to `person_id`** — never to org / Login / account id.
3. **Person ≠ Login:** a Person has **0 or 1** Login (managed = none, credentialed = one).
4. **Login-presence (managed/credentialed) and consent-requirement are independent** — all four
   combinations are valid; a **charge may be managed *or* credentialed** (see §3.1).

**B — Roles & access**
5. Membership roles = **`{admin, learner}`** only; the **first member of an Organization is an `admin`**.
6. `supporter`/`guardian` are **capacities on edges, never roles**.
7. A Person's **own** learning data is read+write by that Person regardless of roles (self-ownership is
   **intrinsic**; the `learner` role *activates the surface*, it does not grant ownership).
8. Access to **another** Person's learning data is **edge-derived** (a guardian or supporter capacity);
   Membership alone grants only **existence-visibility**.
9. **Supporter visibility is edge-scoped** to the named supportee — never org-wide.

**C — Consent & age**
10. Consent requirement is **computed from age × jurisdiction** (`requiresGuardianConsent`) — **never an
    `isMinor` boolean**. The three tiers (consent-gated → consent-capable minor → adult) are
    **flag-combinations, not entities**. **Payment capacity is *not* an age-ladder rung:** for store-
    mediated payment it is **store-delegated** (inv 17); a flat ≥18 rung applies **only** to a future
    non-store rail.
11. A **consent-gated** Person cannot have learning data processed without **valid Consent**, evaluated
    over the **set of Guardianship edges** that bear on them — `consentSatisfied = f({guardian-of edges},
    the jurisdiction's one-of/all-of rule)` — or self-held once consent-capable. *(The set shape is
    locked; the one-of/all-of rule itself is jurisdictional/legal — see ROADMAP.)*
12. Consent is **method-typed + per-purpose**, **withdrawable**, and **jurisdiction-relative** — never a
    boolean. Satisfaction is **scoped to the standard under which it was obtained**: a record valid under
    jurisdiction A may not *satisfy* jurisdiction B, so a held consent does not automatically transfer
    across a `residence_jurisdiction` change (§3.4).
13. Below the credential-eligibility floor, Persons are **guardian-created only** (no self-sign-up).
    **13 is the child-claimable account-detachment floor** — below it, detachment is guardian-grantable
    only (via the "own device" path, Part 10). Guardian-grantable at any age; child-claimable at 13+.
    *(Ruled 2026-06-09, OQ-11 — `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md` §1.3.)*

**D — Capacities: guardianship & supportership**
14. **Guardianship (consent authority, Layer 1)** and **Supportership (granted visibility, Layer 2)** are
    distinct edges; **neither auto-implies the other**; a supporter **never** holds consent authority.
15. A **Supportership is authorized by the supportee if consent-capable, else by the guardian** (for a
    charge).
16. **Graduation re-confirms supporterships:** when a charge becomes consent-capable, guardian-granted
    supporterships must be **re-confirmed by the now-consent-capable learner**, else they lapse.

**E — Billing & autonomy**
17. `admin` is **age-agnostic**. **Payer *mechanics* (settlement, refunds, chargebacks, tax, purchase-
    capacity adjudication) are store-delegated for store-mediated payment** — the store is the merchant
    of record for those legs. **Store delegation does *not* discharge the four obligations that remain
    ours:** (a) the **COPPA / GDPR consent gate** (the LLM-disclosure consent chain — mandatory,
    independent of payment; the gate fires on the **LLM-disclosure trigger, not the payment trigger**, in
    every flow: solo teen, child-on-parent-phone via Family Sharing, moved-country pause); (b) the
    **minor's contractual incapacity** (common-law infancy; the store cannot bind a minor); (c) the
    **supplier-side withdrawal + digital-content conformity + unfair-terms** duties (survive merchant-of-
    record); (d) the **paywall/upsell copy to a minor** (independently regulated marketing). A flat
    **≥18** worst-case default (inv 29) governs **only** a future non-store rail. Payer is **access-inert**
    (no learning-data access) and **separate from `admin`** (neither implies the other).
18. **Billing + consent follow the home Organization**; a second-org edge grants edge-scoped visibility
    only — changing neither who pays nor who consents.
19. A paying adult gains **no** visibility into a self-consenting learner's data without that learner's
    **opt-in**.

**F — Lifecycle & safety**
20. **Account-detachment preserves identity:** managed → credentialed (**account-detachment** — the
    action-triggered, identity-preserving login transition via the invite-flow, `MMT-ADR-0010`) keeps the
    **same `person_id`** + all history. Consent is untouched — guardianship edge and consent record ride
    through unchanged. **"Graduation"** is reserved for the consent-capability crossing (inv 16 / §D
    effects); the 18-crossing stays its own threshold.
    *(Ruled 2026-06-09, OQ-11 — `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md` §1.1/§4.1.)*
21. Edge deletion (guardianship / supportership / membership) **never cascade-deletes** the Person or
    their learning history — a managed Person (charge *or* the rare managed adult) is **never orphaned as
    a *side-effect* of removing an edge**. An **explicit, authority-held, audited deletion** of a genuine
    under-consent-age charge's data (guardian-initiated, export offered first — inv 25) is a **distinct
    permitted operation**, not a cascade. The invariant forbids the *silent* orphan, not the guardian
    exercising the charge's erasure right.

**G — Separation, guardianship depth & transition safety**
22. **Three independent concerns — never fused:** **consent authority** ≠ **billing control** ≠ **data
    visibility**. (Layer-1 Guardianship, the Payer designation, and Layer-2 visibility edges are the
    three; most transition bugs trace to conflating two of them.)
23. **Guardianship grants *separable* capabilities**, never one bundled flag — *consent-authority* /
    *operate* (act-for) / *manage* (settings, billing scope) / *view*. They usually co-occur but must be
    allowed to diverge: the credentialed tween **operates** their own profile (no act-for) yet still needs
    a guardian's **consent-authority**. *(Ruled — `MMT-ADR-0008`, Option A: the **whole edge is global**
    and stores consent-authority + the consent record only; `operate`/`manage`/`view` are **derived** —
    `guardian-link ∧ shared-org ∧ charge-has-no-Login` — never stored per-org.)*
24. **Time-triggered transitions must be scheduler-driven.** Age / consent-threshold / 18 crossings and
    `residence_jurisdiction` re-evaluation fire with **no user action** — a dormant account still
    transitions on its birthday — so they **cannot live only in request handlers**; a durable scheduler
    re-evaluates each Person on the relevant dates. *(Realized — `MMT-ADR-0009`: **one unified daily
    Inngest sweep** evaluates all time-triggered transitions in a single per-Person pass.)*
25. **Transitions are append-only + audited, and every interim state is a *named valid state*** —
    graduation pre-org-choice, the dormant adult with no Login, "suspended pending fresh consent" after a
    jurisdiction re-engage — never an implicit gap. Each carries a Failure-Modes table (no dead-ends; repo
    UX-resilience rule).

**H — Consent mechanics (COPPA-ready)**
26. **Age-gate precedes collection.** Signup captures an **age-range first** (neutral mechanism); **no
    profile or learning data is persisted until lawful basis is established** (`AgeConsentDecision`
    resolves to allowed). The age-screen itself is the only permitted pre-basis collection.
27. **Consent is recorded per purpose** — separate records for
    `{core, thirdPartyShare, targetedAds, aiTraining}` (§3.2) — **required even when launch uses only
    `core`** (COPPA-2025). Internal helper access (a supporter seeing a charge's data) is **not** a
    purpose bucket — it is a Supportership edge + a disclosure obligation.
28. **Consent ≠ contract.** A consent-gated Person's processing rests on **verifiable guardian consent**
    (inv 11), **never** on the guardian's contract / account-holder status — the "parent is account-holder
    ⇒ child covered" assumption is invalid (EDPB/ICO correction).
29. **Worst-case default.** The `jurisdiction × ageBand → policy` table ships **strictest** (16 / VPC-
    always) and is relaxed **per *verified* jurisdiction as config** — never country-by-country code.
30. **Assurance is proportionate.** Consent carries a *method* + an *assurance level*; the required level
    scales with age/risk — **self-declaration is not sufficient for young children**.

---

## §5 — Standard-model crosswalk (adopt / diverge)

| Our concept | Standard term (Clerk / RBAC-ABAC) | Adopt or diverge | Why |
|---|---|---|---|
| Person | Clerk User / RBAC principal | **diverge** | standard "user" *is* the credential; we need a credential-less human |
| Login | Clerk **User** | **adopt** | 1:1 with a Clerk User; Clerk = auth only |
| Organization | **Organization / Tenant** | **adopt** | standard tenant; kept thin |
| Membership | **Membership** (with roles) | **adopt** | M:N person↔org carrying roles |
| Roles `{admin, learner}` | **RBAC Role → Permission** | **adopt** (drop `owner`/`supporter`) | roles as data; supporter/guardian are **capacities** (edges) |
| Guardianship | — (none) | **diverge — domain-specific** | no IdP/RBAC models consent authority over a credential-less person |
| Supportership | scoped ReBAC relation | **diverge (light)** | edge-scoped visibility; no engine needed at v1 |
| Subscription/Payer | Stripe customer→subscription | **adopt** | customer = org; payer = billing contact |
| Consent | — (none) | **diverge — domain-specific** | the non-standard half; method-typed/per-purpose |

**The deliberate divergences are exactly three:** Person (credential-less), Guardianship, Consent.
Everything else adopts the standard name. *That short list is the whole reason we can't just buy this
off the shelf.*
