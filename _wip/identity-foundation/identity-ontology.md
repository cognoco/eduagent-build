# Identity Foundation — Ontology v1.1 (RATIFIED)

**Status:** **RATIFIED v1 — Grill #1 complete, 2026-06-01.** All nine conflicts (C1–C9), the
role/edge/**capacity** model, and the §4 invariants are ratified (decision trail in §R; agenda/status
in §0). Open items tracked as flags in §8. CONTEXT.md identity glossary extracted in lockstep.
**Next:** fold in the two finished spikes, then draft `identity-foundation-prd.md` in this vocabulary.
**Date:** 2026-06-01 · **Owner:** PM + Claude (ratified inline via `/grill-with-docs`).

**Amendments:** **v1.1 (2026-06-02)** — Payer *capacity* is **store-delegated** for store-mediated payment
(inv 17/10, §2.4, §3.2 refined; MMT-ADR-0002). Rectifies the 2026-06-01 "payer-eligibility = same age ladder"
framing, whose self-imposed ≥18 rung is impractical on a store-only channel. See §R (newest entry).

**What this is.** The single *structural* terminus for the identity foundation: the entities, their
one-line definitions, the relationships between them, and the invariants that bind them — in one
agreed vocabulary that the PRD is *written in*, the data model *persists*, and CONTEXT.md *extracts
its glossary from*. It is the referee that stops the term-drift the three streams keep producing.

**What this is NOT.** Not physical schema (columns/tables/migrations = Phase E). Not the PRD
(behaviour/journeys = `identity-foundation-prd.md`). Not a decision on *where it ultimately lives*
(fold into CONTEXT.md vs stay beside it = Phase C, deferred).

**The four sources each concept is reconciled against:**
- **Intent** — `identity-reconstructed-prd-ANSWER.md` (doc 2, richest single statement of intent).
- **Standard models** — Clerk data model + B2B-SaaS RBAC/ABAC (adopt standard names where they fit).
- **Domain spikes** — `domain-model-options.md` (tenancy/IdP), `age-consent-spike.md` (age/consent).
- **Current code** — `packages/database/src/schema/profiles.ts`, the auth/consent services, and the
  **existing** `CONTEXT.md` identity glossary (which encodes the *old fused model* — cited as drift,
  not authority).

**The one rule that kills most drift:** *adopt the standard-model term unless the domain forces a
divergence; when it diverges, record why.* This converts vocabulary fights from taste ("what should
we call it") into tests ("does the standard term fit — yes/no").

**Decision legend:** **[✅ RATIFIED]** decided in Grill #1 (trail in §R) · **[PROPOSED]** original strawman
pick, now superseded by the ratified outcome · **[HOT]** *(historical)* was a live conflict ·
**[HOT]** a live conflict that must be decided in the grill · **[ALIGNED]** sources already agree,
low-risk · **[DEFER]** real decision, but downstream of this ontology (parked, not dropped).

---

## §R — Ratification log (Grill #1)

Decisions land here as they're ruled, newest first. The §0 table and §1–§4 bodies are updated in lockstep.
Spike **folds** are logged here too (a fold reconciles a finished spike's decisions into this vocabulary).

- **Phase D — domain model ratified (4 rulings + 4 ADRs) — RATIFIED 2026-06-03 (architect).** The Phase-D
  consolidated domain model (`domain-model.md`) locks entities / roles / consent / tenancy and the ADR layer
  gains its first identity ADRs. **(1) Core entity & role model → MMT-ADR-0007** (reconstructed) — records the
  *why* behind C1/C2/C4/C5/C6/C8/C9 (Person ≠ Login; roles `{admin, learner}`; mentor/guardian = capacities;
  Owner dissolved). **(2) Guardianship D1 → Option A → MMT-ADR-0008** — **one *global* Guardianship edge stores
  consent-authority + the consent record only; `operate`/`manage`/`view` are *derived* at query time**
  (`guardian-link ∧ shared-org ∧ charge-has-no-Login`), not stored per-org; the credentialed-tween divergence
  falls out of login-presence; the check lives in **one named resolver** (successor to `getFamilyOwnerProfileId`).
  This **also rules the consent/visibility half of multi-org governance (E7)** — consent over the *set* of
  guardian edges (inv 11), visibility = guardian-link ∧ shared org — keeping the separated-parents one-Person
  model reachable (E8) for free. *(Supersedes the §6 "org-scoped operation" lean below.)* **(3) Durable scheduler
  (inv 24) → Option 1 → MMT-ADR-0009** — one unified daily Inngest sweep evaluates all time-triggered transitions
  (E1 age / E2 residence / E5 dormancy) in a single per-Person pass, idempotency `personId+day`, mirroring
  `daily-snapshot.ts`. **(4) Family-join / consolidation primitive → MMT-ADR-0010** — invite-flow (child completes
  own Clerk sign-up via JIT `findOrCreateAccount`, attached to the existing `person_id` via `migration-pending`)
  + home-org reassignment; **v1 collapses to a single home org → sidesteps multi-org billing/quota federation
  (E7, Phase-D-deferred)**; billing = option B (join-with-disclaimer). **Bodies updated in lockstep:** inv 23
  (D1 parenthetical → ruled), inv 24 (scheduler → ADR-0009), §6 (Multi-org / Transition-events / Guardianship-D1
  flipped from `[DEFER]` to ruled). **CONTEXT.md:** Guardianship entry (global-edge / derived-operation).
  **Carried forward:** separated-parents v1 *build* scope (E8 → product + legal); recorded-Payer under Family
  Sharing (E3 → Phase E); co-guardian one-of/all-of rule (E4 → counsel); VPC vendor (G7). **→ Phase E unblocked.**

- **Payer capacity → store-delegated (amendment, ontology v1.1) — RATIFIED 2026-06-02 (T-axis).**
  Supersedes the **payer-rung framing** of the 2026-06-01 entries below — both the "Age tiers are
  flag-combinations… payer-eligibility is the same complex" entry **and** the "Payer ≥18 / a minor cannot be
  Payer" clauses of the C2/C3/C4 cluster (those entries stand as dated record; this clause is the live rule). **Payment capacity for store-mediated payment is delegated to the store
  as merchant of record** — the store's purchase flow is the sole capacity adjudicator; we impose **no age
  gate of our own** on that rail (the only payment channel for the foreseeable future). A flat **≥18**
  worst-case gate (inv 29) governs **only** a future **non-store** rail, where *we* are merchant of record —
  and even there it is a blunt default, **not** a `jurisdiction × age` derivation engine. **The consent rung
  (13–16) is untouched** and stays on the age ladder; only the **payer rung comes off it** for store payment.
  Safe because Payer is **access-inert** (no learning-data access) and **consent-orthogonal** (inv 22):
  over-restricting payment is harmless (an adult Payer can always be attached, R11) where over-restricting
  consent would block lawful learning. **Bodies updated in lockstep:** inv 10 (payer rider), inv 17, §2.4,
  §3.2. **CONTEXT.md:** Payer + minor glossary entries. **MMT-ADR-0002.** **Carried open:** which Person the
  store records as Payer under Family Sharing / Ask-to-Buy (E3 / §6 — now the active sub-question); whether to
  *expose* under-18 self-pay (PRD, P-axis); app-store family policy + counsel (FLAG-2, REQ-2) gate paid launch.

- **Fold #2 — `age-consent-spike.md` (age assurance & VPC) folded in — 2026-06-01 (PM confirmed Q1–Q5).**
  Executed the **C7 strike** on this spike (its §E/§G "Clerk Orgs for access" loses to MMT-ADR-0001; the surviving
  half — own the consent receipts/audit in Neon, Clerk carries only the *resolved decision* as JWT claims — is
  kept, §3.2). **§3.2 rewritten** to close the Grill-#1 reconcile TODO: `resolveConsentRequirement` (the policy
  function) and `AgeConsentDecision` (the resolved-decision object the app reads) are **complementary, not
  rivals**; object fields locked, enum *values* illustrative. **New invariants §4.26–30:** age-gate precedes
  collection; consent recorded **per-purpose** `{core, thirdPartyShare, targetedAds, aiTraining}`; **consent ≠
  contract** (parental consent is load-bearing, not the guardian's account-holder status); **worst-case-default**
  policy table; **assurance is proportionate** (self-declaration insufficient for young children). **§8:** REQ-1
  sharpened (per-purpose disclosure), **FLAG-2 reframed** (the floor is a per-jurisdiction policy value + a
  product/app-store call, not a single number; any-age charge lawful with VPC), new **REQ-2** (6-item
  legal-review register) + **REQ-3** (DPIA gates launch). **§6:** vendor-selection criteria + platform-signal /
  store-compliance recorded. Spike left as a dated artifact (vocabulary + C7 banner only).

- **Fold #1 — `domain-model-options.md` (tenancy/IdP spike) folded in — 2026-06-01.** The spike's headline
  (own-the-graph) was already ratified as C7 / MMT-ADR-0001; this fold harvested its *residual* commitments into
  the ontology in ratified vocabulary. **Added:** §3.4 `residence_jurisdiction` (time-versioned Person
  attribute) and §3.5 the v1 authorization posture (RBAC + ABAC attributes + first-class edges; no policy
  engine). **Strengthened:** §4.11 — consent satisfaction is evaluated over a *set* of guardian edges (shape
  locked; the one-of/all-of rule is legal, deferred §6); §4.12 — consent satisfaction is *jurisdiction-relative*
  (a record valid under A may not satisfy B). **New invariants §4.22–25:** the three-way separation of consent
  authority ≠ billing ≠ visibility; guardianship grants *separable capabilities* (not one bundled flag — Q4(b));
  time-triggered transitions need a durable scheduler; transitions are append-only with *named* interim states.
  **Deferred → §6:** separated-parents one-vs-two Person; guardianship D1 (global vs org-scoped); T6
  de-credential; entry-point / self-registered-minor consent; open IdP cost & lock-in items. The spike is left
  as a **dated discovery artifact** (vocabulary-superseded banner only; `Credential`→Login, `proxied`→managed,
  `ward`→charge not rewritten inline).

- **Mentorship authorization & capacity independence — RATIFIED 2026-06-01 (folds into §4).**
  - **Guardianship and Mentorship are independent capacities; neither auto-implies the other.** A guardian
    already has oversight of their charge via Layer 1, so being a guardian does **not** auto-make you a *mentor*
    (the active-help capacity) — separate edge (default-*offered* for one's own charge, but distinct). A
    **mentor never implies a guardian** (auto-conferring consent authority on a tutor would be a legal error).
  - **A Mentorship is authorized by the mentee if consent-capable (≥ their consent age), else by the guardian
    (for a charge).** A parent does **not** auto-mentor a consent-capable child — incl. an 18-year-old or any
    self-consenting minor on the parent's org; the **learner grants** the edge. For a charge, the guardian
    grants it (and may grant it to themselves). (#14)
  - **Graduation re-confirms mentorships.** When a charge becomes consent-capable, guardian-granted mentorships
    must be **re-confirmed by the now-consent-capable learner**, else they lapse (mirrors guardian-oversight →
    teen-opt-in). (#15)

- **Age tiers are flag-combinations, not entities; payer-eligibility is the same complex — RATIFIED 2026-06-01.**
  One `resolveConsentRequirement(age × jurisdiction)` emits the capability flags; the three "tiers" are just
  combinations, never boxes: **consent-gated** (`requiresGuardianConsent`, below consent age) → **consent-capable
  minor** (self-consents, **not** `payerEligible`) → **adult** (`payerEligible`, ≥18). The **18 payer/contract
  rung and the 13–16 consent rung are the same age ladder, different thresholds** — payer-eligibility is *not* a
  separate concern. Numeric cohort labels ("under-13", "11-12", "11-15/17") are **banished** → use consent-gated /
  charge / minor / adult (see CLEANUP-3).

- **Mentor & guardian = capacities, not roles; role set → `{admin, learner}` — RATIFIED 2026-06-01.** The
  test: a **role** is a Person's self-contained standing in an org ("I am an admin/learner here"); an **edge**
  is a one-to-one tie to a *named* Person ("I am the mentor/guardian *of X*" — meaningless without the other
  person). By that test **`mentor` and `guardian` are not roles** — they are **capacities** (the ratified term
  for the position a Person occupies at one end of an edge; chosen over "party"/"end"; avoids colliding with
  RBAC "role"). So **membership roles = `{admin, learner}`** only; **Mentorship** and **Guardianship** are
  **edges** whose ends are capacities (`mentor`/`mentee`, `guardian`/`charge`). One Person → one role-set, any
  number of capacities. Revises the earlier `{admin, mentor, learner}` and **closes C5**: both supervisory ties
  are edges (symmetric with each other), only admin/learner are roles. External tutor = **edge-only** (own
  org-of-one + cross-org Mentorship edge → cannot see the family roster, fixing RC-02/D2); a guardian needs no
  Mentorship edge to their own charge (Layer-1 oversight already covers it).

- **C2 / C3 / C4 + roles & guardianship cluster — RATIFIED 2026-06-01.**
  - **Owner dissolved.** Org management → **`admin`** (age-agnostic, ≥1 per org, transferable). Billing →
    **Payer** (a Subscription *designation* pointing at a Person **≥18**, billing-only, **no** learning-data
    access — **not** a role; `Billing Contact` was the conventional alt, `Payer` kept for the ≥18-responsibility
    semantics). Act-for-a-child → **Guardianship** edge (never part of `admin`; `isOwner` never *was*
    guardianship — corrected).
  - **Membership carries a role SET `{admin, learner}`** — any combination, mostly any age. `student` →
    **`learner`** (app-consistent, age-neutral, off the legacy `_Avoid_` list). `learner` is the marker that
    **activates the core learning surface**; self-ownership of one's own data is **intrinsic to Person** and
    needs no role. **Not auto-mandatory.** **Invariant: the first member of an Organization is an `admin`;** at
    onboarding a new adult chooses whether to learn (`learner`) and/or to mentor (a **capacity**, below).
  - **`mentor` is the HUMAN supervisory *capacity*** (an edge-end, **not** a role — see the capacity entry
    above); the **AI is rebranded "Mate" / "AI Mate"** (MentoMATE) — see CLEANUP-2. Mentor data-visibility is
    **edge-scoped** to specific mentees, **never** org-wide.
  - **Guardianship is a relationship/record, NOT a role (C3).** It records that an adult gave verifiable
    consent for a consent-gated learner → a **Guardian → charge** edge carrying the consent record. Far-end
    term: **`charge`** (formal/vernacular) ≡ **consent-gated learner** (technical synonym). Physical: edge
    table `guardianships(guardian_person_id, learner_person_id, consent…)` — no bespoke far-end entity.
  - **Two-layer model (the key insight from this session).** **Layer 1 — Consent authority (Guardianship):**
    one/few consenting adults; establishes lawful basis to process a consent-gated learner's data; withdrawable.
    **Layer 2 — Supervisory access (a granted visibility edge, e.g. Mentorship):** *who may see/help* a specific
    learner; granted by the guardian (below consent age) or by the data subject (above). **A mentor never needs
    guardianship** — they operate under the existing consent via a Layer-2 grant. (Edge-scoped, per-mentee:
    fixes the org-wide-mentor leak, RC-02/D2.) See REQ-1 for the consent-scope-disclosure obligation.
  - **`minor` = under-18** — the **contract/Payer threshold** (a minor cannot be Payer), *distinct* from the
    consent gate (`requiresGuardianConsent`, 13–16 jurisdictional). Acceptable casual shorthand for a charge (a
    charge is always a minor) but **one-directional** (not every minor is a charge) and **never a code gate**.

- **C1 / C6 / C8 — The three core nouns — RATIFIED 2026-06-01.** **`Person`** (the human), **`Organization`**
  (the grouping), **`Login`** (the authentication binding). Grounding: the standards *split* on the human —
  Clerk/B2B-SaaS say "User" (login-coupled), but **NIST RBAC defines User as "a human being"** and **ABAC
  calls the principal "Subject" (the attribute-carrier)**; our `Person` is the RBAC-human / ABAC-Subject,
  named to shed the login coupling that "User" implies. `Organization` is the exact B2B-SaaS tenancy term
  (Person + Organization = the data-modeling **Party pattern**). The **login has no standard entity name**
  (RBAC/ABAC treat authentication as a *precondition*, not an entity; B2B-SaaS just calls it "User"), so it
  is our refinement: modeled as the **authentication binding to the Clerk User**, **0..1 per Person**,
  multi-method handled inside the one Clerk User via account-linking. **`Credential` was rejected** — in
  security it means an auth *factor* (password/token), a collision we won't carry. The fused **`account`
  concept is retired** (login→Login, tenant→Organization, human→Person). CONTEXT.md updated; legacy
  `Profile`/`Owner`/`Child Profile` marked under-revision.

- **C7 — Tenancy graph ownership — RATIFIED 2026-06-01.** **We own the entire Person / Organization /
  Membership / Guardianship graph in Neon; Clerk is the authentication + credential lifecycle only,
  never the tenancy/membership system of record.** Seam principle: *anything that must work for a
  person with no login (the managed child) cannot be Clerk's; everything about proving who a
  logged-in user is should be Clerk's.* Use Clerk to the max on the auth side (OAuth, passkeys,
  sessions, JWT, Expo SDK, account-linking, JWT-as-decision-transport); the only forgone capability
  is **Clerk Organizations-as-tenancy**, which is structurally unusable in the target model (can't
  hold a credential-less child; our authz is edge-scoped + attribute-driven, not org-role RBAC).
  **Supersedes** the `age-consent-spike.md §F/G` "Clerk Orgs for access" line — flag for its author at
  fold-in. B2B/schools future remains compatible (federate teacher auth via Clerk SSO without making
  Clerk the roster SoR). *(ADR candidate — see offer in chat.)*

---

## §0 — The hot conflicts (the grill agenda)

These are the decisions that actually matter. Everything in §1–§4 hangs off them. Each is expanded
below with options + pros/cons + a recommendation; this table is the index.

| # | The conflict | Sources in tension | My rec (PROPOSED) | Expanded in |
|---|---|---|---|---|
| **C1** | Name for **the human** — `Person` vs `Profile` vs `Learner` | intent=`Person`; code+CONTEXT=`Profile` | ✅ **RATIFIED** — `Person` (RBAC-human / ABAC-Subject); "Learner" is a hat; retire `Profile` | §1.1, §R |
| **C2** | Org-management role — `owner` vs `admin`; does "Owner" survive? | code enum=`owner`; doc 2 dissolves→`admin`+Payer | ✅ **RATIFIED** — `admin`; "Owner" dissolved (→ admin / Payer / Guardianship) | §R |
| **C3** | **Guardian — relationship/edge or role?** (doc 2 contradicts itself; CONTEXT calls "guardian" *retired*) | doc 2 both ways; CONTEXT=retired | ✅ **RATIFIED** — a relationship/edge (a **capacity**), never a role | §R |
| **C4** | role set; learner-marker a role?; mandatory? | code=`student`; doc 2=mandatory | ✅ **RATIFIED** — roles **`{admin, learner}`**; `student`→`learner`; not mandatory; **first member = admin** | §R |
| **C5** | mentor/guardian: roles or edges? one rel. or two? | doc 2 = two edges + mentor role | ✅ **RATIFIED** — two **edges** (Guardianship, Mentorship); ends are **capacities**; `mentor`/`guardian` not roles | §R |
| **C6** | Name for **the grouping** — `Organization` vs `Family` vs `Account` | intent/standard=`Organization`; code=`accounts` fused | ✅ **RATIFIED** — `Organization` (thin, B2B-SaaS term); "Family" = a label | §1.3, §R |
| **C7** | **Clerk Organizations: adopt, or own the graph in Neon?** | `domain-model-options §6`=own-in-Neon; `age-consent §F/G`=Clerk Orgs | ✅ **RATIFIED** — own in Neon; Clerk = auth only | §1.2, §5, §R |
| **C8** | name for **the login** — `Credential` vs `Account` vs `Login` | intent=`Credential`(0..1); code=`accounts` fused to login | ✅ **RATIFIED** — `Login` (binding to Clerk User, 0..1); `Credential` rejected (=auth factor); retire `account` | §1.2, §R |
| **C9** | One term for the **managed-vs-own-login axis** ("managed login" / "Netflix model" / "credentialed") | doc 2 uses 3+ phrasings | ✅ **RATIFIED (by adoption)** — **"managed"** (no Login) vs **"credentialed"** (has Login), a Person attribute | §R |

---

## §1 — Entities (the nouns)

Micro-template per entity: **definition** · **labels across sources** · **standard-model name** ·
**recommended canonical [status]** · **rationale**. Current-code mapping is cited so the crosswalk is
grounded, not remembered.

### §1.1 — Person  **[✅ RATIFIED — C1]**
- **Definition:** one human; the permanent subject of learning data, consent, and identity —
  **whether or not they can log in.** The scoping key for all learning data.
- **Labels in the wild:** `Person` (doc 2, domain-model-options) · `Profile` (code `profiles`,
  CONTEXT.md:17) · `Learner` (CONTEXT uses it everywhere as the role-in-context) · `Ward`/`member`
  (doc 2, contextually).
- **Standard name:** *User* / *Identity* / *Subject* (RBAC: the principal).
- **Ratified canonical: `Person`.** Keep **"Learner"** as a *context hat* (a Person
  who is learning), not a synonym for the entity. **Retire bare `Profile`** as the human's name.
- **Rationale / options:**
  - *Keep `Profile`* — pro: zero churn, the whole codebase + CONTEXT already says it; con: `Profile`
    is fused to "a login's sub-identity" (CONTEXT.md:17-19 "within a Clerk account") — the exact
    fusion we're breaking. It cannot name a credential-less human without redefining itself.
  - *Adopt `Person`* — pro: matches intent + the standard tenancy model; cleanly holds the
    credential-less child; signals the clean cut. Con: large rename surface (`profiles` table, every
    `profileId`, CONTEXT, audience-matrix). **Mitigated** — it's a clean cut anyway (re-seed, no
    backfill), so the rename is in-scope by definition.
  - *Net:* the rename cost is the one-time price of the decoupling that motivates the whole project.
    Recommend `Person`.

### §1.2 — Login  **[✅ RATIFIED — C7, C8]**
- **Definition:** the **authentication binding** between a Person and their Clerk User — the means by
  which a Person signs in. **Optional, 0..1 per Person.** Its *absence* is what "managed" means.
- **Labels:** `Login` (ratified) · ~~`Credential`~~ (doc 2 — rejected: =auth factor) · `account` /
  `clerk_user_id` (code — `accounts.clerk_user_id` `profiles.ts:54`, `profiles.clerk_user_id`
  `profiles.ts:85`).
- **Standard name:** Clerk **User** (we bind to it; we don't reuse the name). RBAC/ABAC give no entity
  name for "the login" — they treat authentication as a precondition.
- **Ratified: `Login`** = the binding to one Clerk User, **0..1 per Person**, multi-method handled
  inside that Clerk User via account-linking; **Clerk owns authentication only** (MMT-ADR-0001). Retire the
  fused `account`-as-login concept. `Credential` rejected for the security-factor collision.
- **Rationale:** the load-bearing decoupling is **Person ≠ Credential**. Today `accounts` fuses the
  human, the login, and the tenant into one row (`profiles.ts:50-69`). Splitting the *login* out as
  `Credential` is what lets one model hold both real account-holders and credential-less children.
  **C7 (Clerk Orgs) resolves here:** the deep-research verdict is *no hosted IdP can represent a
  credential-less member* (`domain-model-options §6`) — so the family graph is ours regardless, and
  adopting Clerk Organizations would force two membership representations. The `age-consent-spike
  §F/G` "Clerk Orgs for access" line is **the loser of C7** and should be reconciled to "Clerk =
  Credential only." *(Flag for the two authors to align.)*

### §1.3 — Organization  **[✅ RATIFIED — C6]**
- **Definition:** the **thin** grouping + billing container. Always exists (an org-of-one is
  auto-created at signup). Holds the Subscription. Does **no** access/consent work itself.
- **Labels:** `Organization` (doc 2, domain-model-options, standard) · `Family` (product copy) ·
  `account` (code — `accounts` currently plays tenant + billing + login all at once) · "roster" /
  "group" / "tenant".
- **Standard name:** **Organization** / Tenant (universal in B2B-SaaS).
- **Ratified canonical: `Organization`**, thin; **"Family" is a user-facing *label* on
  an Organization**, not a separate entity. Code `organizations` table exists already
  (`profiles.ts:145`, inert/T1) — clean-cut wires it for the first time.
- **Rationale:** "family vs tutor roster vs school" must be org **data**, not schema. The danger is
  not the table — it's letting the Organization carry access/consent (the legacy `accounts` mistake).
  Keep it as a dormant grouping/billing seam; all real semantics live on Person + edges. *(Counter to
  weigh in grill: do we even need a table pre-launch, or is org-of-one a derived construct until B2B?
  doc 2 §VI keeps the table deliberately for B2B optionality — that's the position to attack/confirm.)*

### §1.4 — Subscription  **[✅ RATIFIED]**
- **Definition:** entitlement + billing state, **attached to the Organization.** Carries the Payer.
- **Labels:** `Subscription` (all sources) · code `subscriptions` keyed on `account_id`
  (`billing.ts:37-47`; `organization_id` backfilled-but-inert, ORG-04).
- **Standard name:** Stripe **customer → subscription** (customer = org).
- **Ratified: `Subscription` on `Organization`.** Low controversy; the only
  live drift is the key migrating from `account_id` → org (ORG-09/RC-09).

### §1.5 — Role  **[✅ RATIFIED — C2, C4]**
- **Definition:** a capability label carried by a Membership — the RBAC role set. **Ratified set: `{admin,
  learner}`** (only these two are roles; `mentor`/`guardian` are **capacities** on edges, §2.2/§2.3).
- **Labels (sources, all superseded):** doc 2 = `{admin, mentor, student}` · code enum = `['owner', 'mentor',
  'student']` (`profiles.ts:44-48`, note `owner` not `admin`) · CONTEXT = `Owner`/`Child Profile` via `isOwner`.
- **Standard name:** RBAC **Role → Permission** (kept as *data*, not `if (isOwner)`).
- **Ratified:**
  - **`admin`** = org management (members/invites/settings/billing-admin). **Replaces code `owner`** (C2).
    Age-agnostic; ≥1 per org; transferable; >1 allowed. **No** learning-data access without an edge.
  - **`learner`** = "this member learns here" — the marker that **activates the learning surface** (`student`
    → `learner`, C4). Capability-light: self-ownership is **intrinsic to Person**, so `learner` grants nothing
    beyond it; it marks active participation + learner-seat counting. **Not auto-mandatory.**
  - `mentor` is **not a role** — it is a **capacity** on a Mentorship edge (§2.3); `owner` is **dissolved**
    (→ admin / Payer / Guardianship).
- **Why (C2/C4):** `owner` was the fused fossil (RC-01/PPA-R02), split three ways. `student`→`learner`, and
  non-mandatory because an adult who only mentors/pays/guards carries **no** learning role — their power is a
  capacity (mentor) or a Subscription field (Payer), not a `learner` role.

---

## §2 — Relationships (the edges)

Where the model lives. Membership grants *existence-visibility* only; **data access is edge-derived.**

### §2.1 — Membership  **[✅ RATIFIED]**
- **Definition:** the M:N link **Person ↔ Organization**, carrying the **role set `{admin, learner}`** (§1.5).
  Grants **existence-visibility** only ("you can see who is in this org"), never learning-data access.
- **Standard name:** **Membership** (carries roles) — universal.
- **Code today:** `memberships(person_id, roles[])` (`profiles.ts:168-203`, inert) — live substitute is
  `family_links` + `isOwner` (ORG-02, RC-01). Multi-org falls out of the M:N join (ORG-08).
- **Ratified:** first member of an org is `admin`; supervisory ties (mentor/guardian) are **edges, not roles**.

### §2.2 — Guardianship  **[✅ RATIFIED — C3]**
- **Definition:** a **dyadic edge** asserting an adult holds **consent authority / act-for rights**
  over a (typically below-consent-age or credential-less) Person. Carries the **Consent record**.
- **Labels:** `Guardianship edge` (doc 2 §III.3) · but doc 2 §IV *also* lists "Guardian" as a
  capability **column** (the self-contradiction the CHECK flags) · code = `family_links`
  (`profiles.ts:284-311`) + `consent_states` (`profiles.ts:313-376`) · CONTEXT.md:26 calls "guardian"
  a **retired** label.
- **Standard name:** none — **domain-specific** (this is the non-standard half; no IdP/RBAC models it).
- **Ratified: Guardianship is an EDGE, never a role.**
- **The edge grants *separable capabilities* (§4.23), not one bundled flag:** *consent-authority* / *operate* /
  *manage* / *view*. **Term discipline — `capability` ≠ `capacity`:** a **capacity** is *which end* of an edge
  a Person occupies (guardian vs charge); a **capability** is *what the edge authorizes* them to do. (Folded
  from `domain-model-options.md` §9; placement of the operate/manage/view facets — D1 — deferred, §6.)
- **Rationale (C3):** consent is "*guardian G consented for charge W, policy V, time T, revocable*" — a
  **per-pair** fact. One parent with three children has three independently-revocable records; an
  org-wide role cannot express that (doc 2 §III.3). So it is structurally an edge. doc 2 §IV's
  "Guardian column" is a **presentation convenience that leaked into the role model** — the grill
  should kill it and keep capability derived *from the edge*. (Answers the CHECK "Guardian is a role
  despite the earlier rule" — the rule wins; the column is the bug.) Note CONTEXT.md:26 "retired
  guardian" is about the old *tab-shape* label, **not** this consent relationship — a name collision
  to disambiguate, not a reason to avoid the word.
- **Far-end = `charge`**; the mentorship far-end = `mentee` (§2.3).

### §2.3 — Mentorship  **[✅ RATIFIED — C5]**
- **Definition:** a **dyadic edge** granting a **mentor** (a capacity) **scoped visibility/help** for **one
  specific mentee** — never org-wide. Carries **no** consent authority (**Layer 2**).
- **Labels:** `mentor`/`mentee` are **capacities** (edge-ends), not roles · code = `family_links` (mentor
  backfilled, RC-03) · "tutor".
- **Standard name:** a scoped ReBAC relationship ("mentor-of").
- **Ratified (C5):** **Guardianship and Mentorship are two distinct edges** — consent authority ≠ visibility;
  fusing them is the §III.3 trap. `mentor`/`guardian` are **capacities, not roles** (symmetric: both are
  edge-ends). **Authorization:** a Mentorship is granted by the **mentee if consent-capable**, else by the
  **guardian** (for a charge); **graduation re-confirms** guardian-granted mentorships (§4.14–16). A
  single-child mentor is **edge-only** (own org-of-one + cross-org edge) → never sees the family roster (fixes
  RC-02/D2). UI may present guardian + mentor as one "supervisors of X" view **without** fusing the edges.

### §2.4 — Payer  **[✅ RATIFIED · amended v1.1 2026-06-02]**
- **Definition:** the Person responsible for a Subscription's billing. **A field on the
  Subscription, not a role and not a visibility grant.** **Access-inert** (no learning-data access).
- **Labels:** `payer_person_id` (doc 2) · today implicit in the account holder (`subscriptions.
  account_id`, no explicit payer).
- **Standard name:** Stripe customer's billing contact.
- **Ratified (v1.1):** `Subscription.payer_person_id`, **no learning-data access**. **Payer *capacity* is
  delegated, not adjudicated by us:** for store-mediated payment (the only channel for the foreseeable future)
  the store is **merchant of record** and the sole capacity adjudicator — we impose no eligibility test. We
  adjudicate capacity ourselves **only** on a channel where no store is merchant of record (a future
  direct/web rail); there the default is a **flat ≥18 worst-case gate (inv 29), not a `jurisdiction × age`
  derivation** — over-restricting payment is harmless (an adult Payer can be attached, R11) where
  over-restricting consent would block lawful learning. Per-jurisdiction relaxation stays available as config
  under the inv-29 pattern, **unbuilt unless a direct rail justifies it**. *(Open: which Person the store
  records as Payer under Family Sharing — E3 / §6.)*
  Future B2B: add `payer_org_id` + "exactly one set" check (doc 2 §VI) — `[DEFER]`.

---

## §3 — Axes & attributes (NOT entities)

The drift engine was turning *attributes* into entities/tables. These stay as computed attributes.

### §3.1 — Login presence — "managed" vs "credentialed"  **[✅ RATIFIED — C9]**
- A Person **has a Login (credentialed)** or **does not (managed)** — an **attribute of the Person**, not a
  cohort table or subtype. ("Netflix"/"proxied" dropped — "proxied" overloaded with the runtime proxy state.)
- **Two independent dimensions — do NOT fuse them.** *Login-presence* (managed ⊥ credentialed) is **separate**
  from *consent-requirement* (`requiresGuardianConsent`, age × jurisdiction). All four combinations are valid:

  | | **credentialed** (has Login) | **managed** (no Login) |
  |---|---|---|
  | **consent-gated** (a charge) | child with their **own device** → credentialed charge | guardian-set-up child → managed charge |
  | **consent-capable** | normal adult/teen | rare: capable adult, no Login (shared-device/"Netflix") → **FLAG-3** |

- **Therefore `charge` ≠ "no Login".** A charge is *consent-gated* (the consent dimension) and may be managed
  **or** credentialed. Device-sharing among *capable* users is solved by **login switching**, not managed profiles.

### §3.2 — Consent requirement & the consent decision  **[✅ FOLDED — Fold #2; closes the Grill-#1 reconcile TODO]**
- **Not** a `minor` boolean. Two **complementary** pieces (not rival names):
  - **`resolveConsentRequirement(age × residence_jurisdiction)`** — the **policy function**: what the *law
    requires* (e.g. a 14-year-old in Germany needs guardian consent). Knows the rule only.
  - **`AgeConsentDecision`** — the **resolved-decision object** the rest of the app reads (and never looks
    behind): requirement **+** whether it is satisfied **+** how it was proven **+** expiry/receipt. The single
    **COPPA-portable seam** — swap the verification method underneath and app code is unchanged.
- **`AgeConsentDecision` fields (shape locked; enum *values* illustrative, pinned Phase E):** `ageBand`
  (jurisdiction-relative) · `consentStatus` (`NOT_REQUIRED | REQUIRED_PENDING | GRANTED | REVOKED | EXPIRED`) ·
  `assuranceLevel` (`SELF_DECLARED | PLATFORM_GUARDIAN | VENDOR_VERIFIED | VPC_VERIFIED`) · `consentMethod`
  (`card | KBA | facial+review | platform:guardianDeclared | vendor:KWS …` — **never a bare boolean**) ·
  `jurisdiction` · `purposeScope { core, thirdPartyShare, targetedAds, aiTraining }` (§4.27) ·
  `retentionExpiresAt` · `receiptId` (→ ISO/IEC 27560 record).
- **Per-purpose, not global** (§4.27): the four `purposeScope` buckets are *secondary-/external-use* purposes —
  `core` (deliver the tutoring) / `thirdPartyShare` (data to an **external company** — analytics/ad SDKs) /
  `targetedAds` / `aiTraining` (train models on the child's work). **Distinct from internal helper access:** a
  human mentor seeing a charge's data is a **Mentorship edge + REQ-1 disclosure**, *not* a `purposeScope` bucket.
- **Policy as data, worst-case default** (§4.29): a `jurisdiction × ageBand → policy` table (EU digital-consent
  age runs **13–16**; DE/NL/IE/PL = 16). Ship **strictest (16 / VPC-always), relax per *verified* jurisdiction
  as config — never country-by-country code**. `contentBand` (theming only, **never** gating) rides the same
  age ladder; **payment capacity does *not*** — it is **store-delegated** (inv 17, amended v1.1), with a flat
  ≥18 default only on a future non-store rail.
- **Decision transport (MMT-ADR-0001):** Clerk may carry the *resolved* `AgeConsentDecision` as ~3 JWT claims
  (`ageBand`/`consentStatus`/`assuranceLevel`); **we own** the consent receipts + age-assurance audit + event
  log in Neon. Clerk **Organizations are not used** (the spike's "Clerk Orgs for access" line is superseded).
- Code today: flat `age <= 16` + `MINIMUM_AGE = 11` in `services/consent.ts:197` (CC-06) — the drift.

### §3.3 — Content band / age bracket  **[ALIGNED]**
- `computeAgeBracket` (`@eduagent/schemas`) — theming + copy **only**, never feature-gating
  (CONTEXT.md:42). Keep as-is; it is the one identity-adjacent term that is *not* drifting.

### §3.4 — Residence jurisdiction  **[✅ FOLDED — Fold #1 / P1]**
- A Person carries a **`residence_jurisdiction`**: a **first-class, time-versioned attribute** (history
  retained for audit — *"what policy was in force when we processed"*), keyed off **residence**, not current
  location (a holiday or VPN must not re-gate). It is the input to the consent computation (§3.2) that can
  change without a birthday.
- Consequence (drives transition T4 — §6): when it changes, `requiresGuardianConsent` re-evaluates under the
  **new** jurisdiction's threshold and the gate may **re-engage** with no age change — see §4.12
  (satisfaction is jurisdiction-relative) and §4.24 (the re-evaluation must be scheduler-driven, not
  request-only). *(Detection — declared vs inferred residence — and whether re-engagement suspends or merely
  re-prompts are deferred product/legal questions, §6.)*

### §3.5 — Authorization posture for v1  **[✅ FOLDED — Fold #1 / P7]**
- v1 authorization = **RBAC** (roles `{admin, learner}` as *data*, never `if (isOwner)`) **+ a small set of
  ABAC attributes** (age × `residence_jurisdiction` → consent policy; any age-gated capability) **+ first-class
  relationship edges** (Guardianship, Mentorship). **No external policy engine** (Zanzibar / OpenFGA / SpiceDB)
  at v1.
- Keep edges first-class so **ReBAC stays reachable** without retrofit. The test for "do we need an engine":
  permission decisions that must traverse *arbitrary-depth* relationship chains a roles-array + direct-edge
  check can't express. Revisit only if/when that appears.

---

## §4 — Invariants (the testable rules the PRD must honour)  **[✅ RATIFIED — Grill #1, 2026-06-01]**

The structural commitments. The PRD's behaviour must not contradict them; each becomes a break-test at
build. Ratified across Grill #1 — these are the **definition of "done"** the PRD is checked against.

**A — Identity & scoping**
1. Every Person belongs to ≥ 1 Organization (an *org-of-one* is auto-created at signup).
2. **Learning data is scoped to `person_id`** — never to org / Login / account id.
3. **Person ≠ Login:** a Person has **0 or 1** Login (managed = none, credentialed = one).
4. **Login-presence (managed/credentialed) and consent-requirement are independent** — all four
   combinations are valid; a **charge may be managed *or* credentialed** (see §3.1).

**B — Roles & access**
5. Membership roles = **`{admin, learner}`** only; the **first member of an Organization is an `admin`**.
6. `mentor`/`guardian` are **capacities on edges, never roles**.
7. A Person's **own** learning data is read+write by that Person regardless of roles (self-ownership is
   **intrinsic**; the `learner` role *activates the surface*, it does not grant ownership).
8. Access to **another** Person's learning data is **edge-derived** (a guardian or mentor capacity);
   Membership alone grants only **existence-visibility**.
9. **Mentor visibility is edge-scoped** to the named mentee — never org-wide.

**C — Consent & age**
10. Consent requirement is **computed from age × jurisdiction** (`requiresGuardianConsent`) — **never an
    `isMinor` boolean**. The three tiers (consent-gated → consent-capable minor → adult) are
    **flag-combinations, not entities**. **Payment capacity is *not* an age-ladder rung:** for store-mediated
    payment it is **store-delegated** (inv 17, v1.1); a flat ≥18 rung applies **only** to a future non-store rail.
11. A **consent-gated** Person cannot have learning data processed without **valid Consent**, evaluated over
    the **set of Guardianship edges** that bear on them — `consentSatisfied = f({guardian-of edges}, the
    jurisdiction's one-of/all-of rule)` — or self-held once consent-capable. *(The set shape is locked; the
    one-of/all-of rule itself is jurisdictional/legal — deferred, §6.)*
12. Consent is **method-typed + per-purpose**, **withdrawable**, and **jurisdiction-relative** — never a
    boolean. Satisfaction is **scoped to the standard under which it was obtained**: a record valid under
    jurisdiction A may not *satisfy* jurisdiction B, so a held consent does not automatically transfer across a
    `residence_jurisdiction` change (§3.4).
13. Below the credential-eligibility floor, Persons are **guardian-created only** (no self-sign-up). *(The
    exact floor is a pending product decision — FLAG-2.)*

**D — Capacities: guardianship & mentorship**
14. **Guardianship (consent authority, Layer 1)** and **Mentorship (granted visibility, Layer 2)** are
    distinct edges; **neither auto-implies the other**; a mentor **never** holds consent authority.
15. A **Mentorship is authorized by the mentee if consent-capable, else by the guardian** (for a charge).
16. **Graduation re-confirms mentorships:** when a charge becomes consent-capable, guardian-granted
    mentorships must be **re-confirmed by the now-consent-capable learner**, else they lapse.

**E — Billing & autonomy**
17. `admin` is **age-agnostic**. **Payer capacity is store-delegated for store-mediated payment** — the
    store (merchant of record) is the sole capacity adjudicator and we impose **no age gate of our own**; a
    flat **≥18** worst-case default (inv 29) governs **only** a future non-store rail. Payer is
    **access-inert** (no learning-data access) and **separate from `admin`** (neither implies the other).
    *(Recorded-Payer identity under Family Sharing → E3 / §6; under-18 exposure → PRD; launch gates → FLAG-2/REQ-2.)*
18. **Billing + consent follow the home Organization**; a second-org edge grants edge-scoped visibility
    only — changing neither who pays nor who consents.
19. A paying adult gains **no** visibility into a self-consenting learner's data without that learner's
    **opt-in**.

**F — Lifecycle & safety**
20. **Graduation preserves identity:** managed → credentialed keeps the **same `person_id`** + all history.
21. Edge deletion (guardianship / mentorship / membership) **never cascade-deletes** the Person or their
    learning history — a managed Person (charge *or* the rare managed adult) is **never orphaned as a
    *side-effect* of removing an edge**. An **explicit, authority-held, audited deletion** of a genuine
    under-consent-age charge's data (guardian-initiated, export offered first — inv 25) is a **distinct
    permitted operation**, not a cascade. The invariant forbids the *silent* orphan, not the guardian
    exercising the charge's erasure right. *(Today `family_links` cascades on edge deletion — the live
    bug, PPA-R11.)*

**G — Separation, guardianship depth & transition safety**  *(folded from `domain-model-options.md` §8–§10)*
22. **Three independent concerns — never fused:** **consent authority** ≠ **billing control** ≠ **data
    visibility**. (Layer-1 Guardianship, the Payer designation, and Layer-2 visibility edges are the three;
    most transition bugs trace to conflating two of them.)
23. **Guardianship grants *separable* capabilities**, never one bundled flag — *consent-authority* / *operate*
    (act-for) / *manage* (settings, billing scope) / *view*. They usually co-occur but must be allowed to
    diverge: the credentialed tween **operates** their own profile (no act-for) yet still needs a guardian's
    **consent-authority**. *(D1 RULED — MMT-ADR-0008, Option A: the **whole edge is global** and stores
    consent-authority + the consent record only; `operate`/`manage`/`view` are **derived** —
    `guardian-link ∧ shared-org ∧ charge-has-no-Login` — never stored per-org. Supersedes the earlier
    "org-scoped operation" §6 lean.)*
24. **Time-triggered transitions must be scheduler-driven.** Age / consent-threshold / 18 crossings and
    `residence_jurisdiction` re-evaluation fire with **no user action** — a dormant account still transitions
    on its birthday — so they **cannot live only in request handlers**; a durable scheduler re-evaluates each
    Person on the relevant dates. (The "wired-but-untriggered" trap: if nothing *schedules* it, the transition
    silently never happens.) *(Realized — MMT-ADR-0009: **one unified daily Inngest sweep** evaluates all
    time-triggered transitions in a single per-Person pass, mirroring `daily-snapshot.ts`.)*
25. **Transitions are append-only + audited, and every interim state is a *named valid state*** — graduation
    pre-org-choice, the dormant adult with no Login, "suspended pending fresh consent" after a jurisdiction
    re-engage — never an implicit gap. Each carries a Failure-Modes table (no dead-ends; repo UX-resilience rule).

**H — Consent mechanics (COPPA-ready)**  *(folded from `age-consent-spike.md`)*
26. **Age-gate precedes collection.** Signup captures an **age-range first** (neutral mechanism); **no profile
    or learning data is persisted until lawful basis is established** (`AgeConsentDecision` resolves to allowed).
    The age-screen itself is the only permitted pre-basis collection.
27. **Consent is recorded per purpose** — separate records for `{core, thirdPartyShare, targetedAds, aiTraining}`
    (§3.2) — **required even when launch uses only `core`** (COPPA-2025). Internal helper access (a mentor
    seeing a charge's data) is **not** a purpose bucket — it is a Mentorship edge + REQ-1 disclosure.
28. **Consent ≠ contract.** A consent-gated Person's processing rests on **verifiable guardian consent**
    (§4.11), **never** on the guardian's contract / account-holder status — the "parent is account-holder ⇒
    child covered" assumption is invalid (EDPB/ICO correction).
29. **Worst-case default.** The `jurisdiction × ageBand → policy` table ships **strictest** (16 / VPC-always)
    and is relaxed **per *verified* jurisdiction as config** — never country-by-country code.
30. **Assurance is proportionate.** Consent carries a *method* + an *assurance level*; the required level scales
    with age/risk — **self-declaration is not sufficient for young children**. (Ladder values → Phase D/E.)

---

## §5 — Standard-model crosswalk (adopt / diverge)

| Our concept | Standard term (Clerk / RBAC-ABAC) | Adopt or diverge | Why |
|---|---|---|---|
| Person | Clerk User / RBAC principal | **diverge** | standard "user" *is* the credential; we need a credential-less human |
| Credential | Clerk **User** | **adopt** | 1:1 with a Clerk User; Clerk = auth only |
| Organization | **Organization / Tenant** | **adopt** | standard tenant; kept thin |
| Membership | **Membership** (with roles) | **adopt** | M:N person↔org carrying roles |
| Roles `{admin, learner}` | **RBAC Role → Permission** | **adopt** (drop `owner`/`mentor`) | roles as data; mentor/guardian are **capacities** (edges) |
| Guardianship | — (none) | **diverge — domain-specific** | no IdP/RBAC models consent authority over a credential-less person |
| Mentorship | scoped ReBAC relation | **diverge (light)** | edge-scoped visibility; no engine needed at v1 |
| Subscription/Payer | Stripe customer→subscription | **adopt** | customer = org; payer = billing contact |
| Consent | — (none) | **diverge — domain-specific** | the non-standard half; method-typed/per-purpose |

**The deliberate divergences are exactly three:** Person (credential-less), Guardianship, Consent.
Everything else adopts the standard name. *That short list is the whole reason we can't just buy this
off the shelf — and it's the list to defend in the grill.*

---

## §6 — Deferred decisions (real, but downstream of this ontology)  **[DEFER]**

Parked so the ontology can land without them; each re-enters at the named phase.
- **Multi-org governance** — whose subscription/quota/consent/visibility when a Person is in two orgs
  (ORG-08; doc 2 §8). **RULED (Phase D) — split by axis:** *consent/visibility* → MMT-ADR-0008 (consent over the
  set of guardian edges; visibility = guardian-link ∧ shared org); *billing/quota* → MMT-ADR-0010 (v1 collapses
  to a single home org; genuine federation stays Phase-D-deferred, named not dropped).
- **Transition events** — managed→credentialed, consent-age crossing, 18-graduation: the *mechanics*
  (auto vs explicit step) (doc 2 J4/J11). The §4.24–25 invariants bind the *safety*. **Time-trigger rail RULED
  (Phase D) — MMT-ADR-0009** (unified daily sweep); the managed→credentialed / join mechanism = MMT-ADR-0010
  (invite-flow + `migration-pending`). Remaining product/UX detail → PRD.
- **Consent mechanism / VPC vendor** — which vendor realises age-assurance + VPC (**KWS vs k-ID — substitutes,
  pick one**). Selection criteria (Fold #2): **counterparty durability** (KWS = free Epic-subsidized infra vs
  k-ID = paid-but-contractual), **EU method coverage + completion** (KWS skews US/BR/KR methods — the EU gap is
  the real unknown), and a **per-event-at-onboarding, not per-MAU** cost shape. Consent receipts use **ISO/IEC
  27560**, owned in Neon. `[VENDOR OUTREACH]` → Phase D/E; ontology commits only to "method-typed, pluggable."
- **Platform age-signals & store compliance** (Fold #2) — iOS `DeclaredAgeRange` is **global**; Android Play
  Age Signals returns **null in NO/EU/UK** (US-states/BR only), so Europe's parental gate is **in-app + vendor**,
  not platform-signal-dependent; the **managed-charge-on-parent's-device** cohort has **no** platform signal on
  either OS (in-app parental setup — fine, the adult is present). **Play Families** is a hard Android ship-gate.
  → Phase D/E architecture + PRD journeys.
- **Where this ontology ultimately lives** — fold into CONTEXT.md vs stay beside it. → Phase C.
- **Physical schema** — tables/columns/migrations, the `Person` rename surface. → Phase E.

*Folded from `domain-model-options.md` (Fold #1):*
- **Separated parents — one Person or two, and is shared-custody in scope for v1?** (spike §10) A **Phase-B
  product + legal** call. The architectural **imperative is already satisfied** — *don't foreclose the
  one-Person model* — by Person ≠ Login (§4.3) + a global consent edge (§4.23) + multi-org Membership (ORG-08);
  the only thing that forecloses it is regressing to the fused/account-bound shape. Decision deferred; the
  reachability is locked. → Phase B / PRD.
- **Guardianship D1 — global vs org-scoped capability placement.** (spike §9) **RULED (Phase D) — Option A,
  MMT-ADR-0008:** the **whole edge is global** and stores consent-authority + the consent record only;
  `operate`/`manage`/`view` are **derived** (`guardian-link ∧ shared-org ∧ charge-has-no-Login`), **not** stored
  per-org. This *supersedes* the earlier "global consent + org-scoped operation" lean — operation is a query, not
  a second storage site; the credentialed-tween split and co-parent privacy fall out for free. Physical query
  shape → Phase E.
- **T6 — de-credential (credentialed → managed reversion).** (spike §8) Probably **disallowed**; a product
  choice, not to be built speculatively. → PRD.
- **Entry-point asymmetry & self-registered-minor consent.** (spike §8; drift-map §7A) Parent-creates-child
  (managed from the start) vs **minor-self-registers-first** (own Login, *no guardian yet* → who consents?).
  The self-registered-minor consent path is a known gap. → PRD journeys.
- **Open IdP items (no impact on MMT-ADR-0001).** (spike §6) Clerk **migration / lock-in cost** (password-hash &
  user portability — no verified claim); whether any **OSS / self-host** IdP can model a credential-less member
  natively; Auth0 / Stytch current per-MAU pricing. Relevant only if the own-the-graph commitment is later
  stress-tested. → revisit on demand (no scheduled phase).

---

## §7 — Current-code crosswalk (grounded, for the eventual clean cut)

| Ontology concept | Today's code | Cite | Note |
|---|---|---|---|
| Person | `profiles` | `profiles.ts:71` | rename surface; fused to a login today |
| Credential | `accounts.clerk_user_id`, `profiles.clerk_user_id` | `profiles.ts:54,85` | decouple from Person |
| Organization | `accounts` (fused) → `organizations` (inert) | `profiles.ts:50,145` | thin grouping; wire the inert table |
| Membership + roles | `family_links`+`isOwner` (live) → `memberships.roles[]` (inert) | `profiles.ts:91,168,284` | live authz is the `isOwner` bool (RC-01) |
| `admin` (was owner) | `isOwner` boolean; enum `'owner'` | `profiles.ts:44,91` | split three ways (admin/Payer/guardianship) |
| Guardianship + Consent | `family_links` + `consent_states` | `profiles.ts:284,313` | promote to first-class edge |
| Mentorship | `family_links` (mentor backfilled) | RC-03 | no route reads the role today |
| Consent requirement | flat `age<=16`, `MINIMUM_AGE=11` | `consent.ts:197` | replace with `resolveConsentRequirement` |
| Payer | implicit account holder | `billing.ts:37` | make explicit `payer_person_id` |
| Proxy (act-for runtime) | `isParentProxy` / `X-Proxy-Mode` | CONTEXT.md:34 | mechanism for guardian act-for; decide keep/retire |

> **CONTEXT.md is itself drift.** Its current identity glossary (Profile/Owner/Child Profile, with
> "guardian" *retired* and student/learner *avoided*) encodes the **old fused model**. Grill #1's
> output **overwrites** these lines, it does not extend them.

---

## §8 — Carried requirements & cleanup flags (do-not-lose)

Raised during Grill #1; not terminology decisions, but must not be lost. Migrate to the PRD / consent
spike / a cleanup pass as noted.

- **REQ-1 — Consent-scope disclosure for mentor/helper data-sharing. `[LEGAL REVIEW]`** A guardian's
  consent only *covers* a third-party helper (tutor/mentor) seeing the child's learning data **if the
  consent flow explicitly discloses that the guardian may grant such access.** The Layer-1/Layer-2 split
  (Guardianship = consent authority; a granted visibility edge = helper access) is only lawful when the
  consent text says so. **Action:** verify the current consent flow discloses this — the existing parental
  consent email (`apps/api/src/services/notifications.ts:368-369`) appears **not** to. Feeds the consent
  spike + PRD; counsel must confirm scope language before a paid launch. (Raised by PM, Grill #1 / C4.)
  **Fold #2 reinforcement:** COPPA-2025's per-purpose model (§4.27) makes this sharper — `aiTraining` and
  `thirdPartyShare` each need their *own* disclosed opt-in, so the consent text must **enumerate every purpose
  and every helper-access grant**, never a single blanket consent.

- **CLEANUP-1 — CONTEXT.md legacy examples confuse under the new model.** e.g. the old `_Avoid_: learner
  (every Profile is a learner)` reasoning is obsolete now that `learner` is a positive role. Sweep the
  CONTEXT.md identity section (and adjacent example clauses) for old-fused-model reasoning when the role
  cluster lands. (Raised by PM, Grill #1 / C4b.)

- **CLEANUP-2 — Rebrand the AI from "mentor" → "Mate"; `mentor` becomes the human capacity. [DECIDED, Grill #1]**
  Resolution of the mentor collision: **`mentor` = the human supervisory capacity**; the **AI is the learner's
  "Mate" / "AI Mate"** (leaning into MentoMATE). Consequence — a **copy sweep**: the ~70 user-facing strings
  in `apps/mobile/src/i18n/locales/en.json` that call the AI "mentor" ("your mentor", "Mentor memory",
  "Mentor language", "Tell Your Mentor", …) must be reworded to "Mate"/"your Mate". The human-overseer
  strings ("You're now mentoring {{childNames}}", `mentorSlot`/`mentorRead`/"Mentor's read on {{name}}")
  **stay** as `mentor`. **Scope flag:** this is a brand-voice change to the AI's name across all copy — PM
  owns it; sequence it as a deliberate copy pass, not a silent rename. (Raised + decided Grill #1.)

- **FLAG-2 — The hard "11" age floor contradicts the any-age-charge intent. `[PRODUCT DECISION]`** Product
  intent: any-age child can be a **charge** with guardian consent (even <11 — nothing learning-wise blocks
  homework help). But today an 11 floor is **hard-coded and pervasive**: `MINIMUM_AGE = 11`
  (`apps/api/src/services/consent.ts:197,246,275`) and — decisively — **`birthYearSchema` rejects age < 11 at
  the API boundary** (deliberately, BUG-577: `packages/schemas/src/profiles.ts:48`, `age.ts:32`,
  `apps/api/src/routes/profiles.test.ts:293`), plus all canonical copy frames "11–15"/"11–17"/"11+" (ToS
  `en.json:1313,1345`; `docs/ux-design-specification.md:36`; `docs/PRD.md:38,64,393`). **No documented rationale
  for 11 specifically** — reads as product scoping, not a legal line. **Action:** set the real floor (gated on
  the under-13 VPC solution — age-consent spike — **and** an app-store age-rating check), then remove the code
  floor + sweep copy. (Raised PM, Grill #1 / C9.)
  **Fold #2 update (age-consent spike):** the floor is **not a single number** — "13" is simultaneously a legal
  line (NO/UK/COPPA) *and* a product default, but the EU digital-consent age runs **13–16** (DE/NL/IE/PL = 16),
  so the gate is a **per-jurisdiction policy value** (§4.29), not a constant. The spike confirms **any-age charge
  is lawful *with VPC*** (nothing legal blocks a <11 charge given verifiable parental consent), so the real floor
  is a **product / app-store-rating scoping call layered on the worst-case-16 table**, not a legal hard stop.
  Still gated on the VPC solution + app-store rating.

- **FLAG-3 — Managed, consent-capable adult (no Login). `[RESOLVED, Grill #1]`** **Supported, no new machinery.**
  A managed consent-capable adult (the "Netflix-profile" grandparent) = an admin-created **`learner`** with **no
  guardianship and no consent gate** (she's above the consent age → `requiresGuardianConsent = false`), **operated
  by the admin who created her** (as a guardian operates a charge); her consent is the ordinary informal adult kind
  (no VPC). She **graduates** to her own Login if wanted, and §4.21 (never orphaned) covers her. Kills the earlier
  "require all capable Persons credentialed" lean. (Raised PM, resolved Grill #1 / C5.)

- **CLEANUP-3 — Banish numeric cohort labels.** "under-13", "11-12", "11-15", "11-17" as cohort shorthands are
  ambiguous (consent line = 13–16 jurisdictional; contract line = 18) and wrongly exclude younger children. Use
  **consent-gated** (condition) / **charge** (person) / **minor** (under-18) / **adult** (≥18) — never a number.
  **Status:** the *rule* is locked now (our artifacts use no numbers); the **copy sweep is deferred** to the
  PRD/canonical rebaseline and **gated on FLAG-2** — served-age-range claims (ToS "aged 11–17") can't be rewritten
  until the real floor is a decided fact. (Raised PM, Grill #1 / C9.)

- **REQ-2 — Consent legal-review register (folded from `age-consent-spike.md` §H). `[LEGAL REVIEW]`** Six
  questions counsel must close **before they enter a spec / before paid launch**; **none lockable by us**:
  (1) can contract basis (GDPR 6(1)(b)) carry *any* of a minor's core processing via the parent's account
  (likely no/limited — §4.28); (2) **cross-org consent** — whose consent governs a charge's data in a *second*
  Organization (interacts with multi-org governance, §6 — and the "external tutor = third-party share?" question
  from §3.2); (3) **graduation** — does the parent's original consent survive a managed→credentialed change, and
  how is legacy data handled; (4) COPPA **AI-training** separate-consent applicability to our AI features;
  (5) **EU AI-Act** high-risk trigger — does our adaptive path "steer" curriculum (Annex III 3(b));
  (6) **Ofcom** child-AI-chatbot secondary regs (pending — monitor). Owner: counsel. (Folded Fold #2.)

- **REQ-3 — DPIA is effectively mandatory; gate launch. `[COMPLIANCE]`** Children + AI + learning profiles ⇒ a
  Data Protection Impact Assessment is required (UK Children's Code + UK/EU GDPR Art 35) and should **gate
  launch**. Not an ontology item — a launch-checklist / PRD task. Owner: PM + counsel. (Folded Fold #2.)

## §9 — Supported use cases (carry to PRD personas/journeys)

Concrete scenarios the ratified model supports that the PRD must surface as personas/journeys (so they aren't
lost when behaviour is specified). Each is **[DERIVED]** from the model, not a new decision.

- **UC-1 — Managed shared-device profile (the "grandparent / Netflix" case). [carry to PRD personas]** A family
  **admin** creates a profile for a **consent-capable** Person (an adult, or a capable teen) who will **not** hold
  their own Login — e.g. a grandparent learning on the shared family tablet. Shape: a **managed Person + `learner`
  membership**, **no guardianship, no consent gate** (above the consent age → `requiresGuardianConsent = false`),
  **operated by the admin** (as a guardian operates a charge). They can **graduate** to their own Login later (same
  `person_id`, §4.20). Differs from a charge *only* in the absence of guardianship/consent edges. Extends doc 2's
  persona table (solo adult / family operator / mentor) with this **managed-adult** variant. (Raised PM, Grill #1.)
