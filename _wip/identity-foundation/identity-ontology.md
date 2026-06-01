# Identity Foundation — Ontology v1 (RATIFIED)

**Status:** **RATIFIED v1 — Grill #1 complete, 2026-06-01.** All nine conflicts (C1–C9), the
role/edge/**capacity** model, and the §4 invariants are ratified (decision trail in §R; agenda/status
in §0). Open items tracked as flags in §8. CONTEXT.md identity glossary extracted in lockstep.
**Next:** fold in the two finished spikes, then draft `identity-foundation-prd.md` in this vocabulary.
**Date:** 2026-06-01 · **Owner:** PM + Claude (ratified inline via `/grill-with-docs`).

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
  inside that Clerk User via account-linking; **Clerk owns authentication only** (ADR 0001). Retire the
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

### §2.4 — Payer  **[✅ RATIFIED]**
- **Definition:** the Person (**≥18**) responsible for a Subscription's billing. **A field on the
  Subscription, not a role and not a visibility grant.**
- **Labels:** `payer_person_id` (doc 2) · today implicit in the account holder (`subscriptions.
  account_id`, no explicit payer).
- **Standard name:** Stripe customer's billing contact.
- **Ratified:** `Subscription.payer_person_id`, invariant age ≥ 18, **no learning-data access**.
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

### §3.2 — Consent requirement — `age × jurisdiction → policy`  **[ALIGNED via spike]**
- **Not** a `minor` boolean. Resolved by one server function (doc 2 `resolveConsentRequirement`;
  spike `AgeConsentDecision`). **Two names for one thing — reconcile in grill** (lean to the spike's
  `AgeConsentDecision` shape since it's the more complete, method-typed/per-purpose version).
- Drives: `consentAge` (per-market table, default 16 unknown), `requiresGuardianConsent`,
  `payerEligible (≥18)`, `contentBand` (theming only, **never** gating).
- Code today: flat `age <= 16` + `MINIMUM_AGE = 11` in `services/consent.ts:197` (CC-06) — the drift.

### §3.3 — Content band / age bracket  **[ALIGNED]**
- `computeAgeBracket` (`@eduagent/schemas`) — theming + copy **only**, never feature-gating
  (CONTEXT.md:42). Keep as-is; it is the one identity-adjacent term that is *not* drifting.

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
    **flag-combinations, not entities**; payer-eligibility (≥18) is the **same age ladder, a different rung**.
11. A **consent-gated** Person cannot have learning data processed without a **valid Consent on a
    Guardianship edge** (held by the guardian; or self-held once consent-capable).
12. Consent is **method-typed + per-purpose**, jurisdiction-stamped, and **withdrawable** — never a boolean.
13. Below the credential-eligibility floor, Persons are **guardian-created only** (no self-sign-up). *(The
    exact floor is a pending product decision — FLAG-2.)*

**D — Capacities: guardianship & mentorship**
14. **Guardianship (consent authority, Layer 1)** and **Mentorship (granted visibility, Layer 2)** are
    distinct edges; **neither auto-implies the other**; a mentor **never** holds consent authority.
15. A **Mentorship is authorized by the mentee if consent-capable, else by the guardian** (for a charge).
16. **Graduation re-confirms mentorships:** when a charge becomes consent-capable, guardian-granted
    mentorships must be **re-confirmed by the now-consent-capable learner**, else they lapse.

**E — Billing & autonomy**
17. `admin` is **age-agnostic**; **Payer ≥ 18**; the two are separate, neither implies the other.
18. **Billing + consent follow the home Organization**; a second-org edge grants edge-scoped visibility
    only — changing neither who pays nor who consents.
19. A paying adult gains **no** visibility into a self-consenting learner's data without that learner's
    **opt-in**.

**F — Lifecycle & safety**
20. **Graduation preserves identity:** managed → credentialed keeps the **same `person_id`** + all history.
21. Edge deletion (guardianship / mentorship / membership) **never cascade-deletes** the Person or their
    learning history — a managed Person (charge *or* the rare managed adult) is **never orphaned**.
    *(Today `family_links` cascades — the live bug, PPA-R11.)*

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
  (ORG-08; doc 2 §8). → PRD / Phase D.
- **Transition events** — managed→credentialed, consent-age crossing, 18-graduation: the *mechanics*
  (auto vs explicit step) (doc 2 J4/J11). → PRD.
- **Consent mechanism** — which VPC vendor realises the Consent entity (KWS/k-ID) (spike §D). →
  Phase D/E; ontology only commits to "method-typed, pluggable."
- **Where this ontology ultimately lives** — fold into CONTEXT.md vs stay beside it. → Phase C.
- **Physical schema** — tables/columns/migrations, the `Person` rename surface. → Phase E.

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
