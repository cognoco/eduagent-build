# Identity Foundation — PRD (identity domain canon)

**Layer:** L1 canon (identity domain — product behaviour). **Traces to:** `ontology.md` (the
invariants `inv 1`–`inv 30` + vocabulary), `CONTEXT.md` (identity glossary), the identity ADRs
(`MMT-ADR-0001`–`0015`), and the sibling identity canon (`domain-model.md`, `data-model.md`). Compliance
obligations live in `docs/compliance/identity-compliance-register.md`.

**What this is.** The behavioural canon for the identity foundation: the principles, the capability model,
the consent/age behaviour, the lifecycle/transition requirements (R1–R13), and the settled product/UX
rulings (Part 10) — every body claim anchored to the structural canon it rests on.

**Anchor key (every body claim cites one):**

- `(inv N)` — invariant N from `ontology.md` §4 (the 30 ratified invariants).
- `(§X)` — a section of `ontology.md`.
- `(CONTEXT: term)` — a ratified glossary entry in `CONTEXT.md`.
- `(repo: rule)` — an engineering rule in the repo `CLAUDE.md` (e.g. UX-resilience, typed errors).
- `[DERIVED: …]` — not stated verbatim in the canon but **strictly forced** by the cited invariant(s);
  the derivation is shown so it can be checked.

---

## Part 1 — Principles

These are the load-bearing commitments, each a restatement of canon.

1. **A Person owns their own identity and learning data, permanently.** Learning data is scoped to
   `person_id` (inv 2); a Person's own data is read+write by that Person regardless of roles, because
   self-ownership is **intrinsic to the Person**, not granted by a role (inv 7; CONTEXT: learner). It
   survives account-detachment (inv 20) and is **never orphaned** by an edge or membership deletion (inv 21).
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

**"Done" is the 30 invariants holding under test, each with a break test** (repo: security-fix
red-green). It is **not** "the legacy 36-gap audit closed" — that audit is a regression checklist (Part 8).

---

## Part 2 — Entities & actors

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
- **Capacity** — the end a Person occupies on an edge; `supporter`/`guardian` are capacities, **never
  roles** (CONTEXT: capacity; inv 6).
- **Guardianship** — a dyadic **guardian → charge** edge carrying the **Consent** record; **Layer 1**
  (consent authority); withdrawable; grants separable capabilities (CONTEXT: Guardianship; §2.2; inv 23).
  - **charge** ≡ **consent-gated learner** — a learner below their jurisdiction's consent age (CONTEXT:
    charge).
- **Supportership** — a dyadic **supporter → supportee** edge granting **scoped** visibility/help for one
  specific supportee; **Layer 2**; carries **no** consent authority; the supporter may be any age
  (CONTEXT: Supportership, supporter; §2.3; inv 9, 14).
- **Payer** — the Person designated for an Organization's Subscription; a Subscription designation,
  **not** a role, **access-inert** (no data access) (CONTEXT: Payer; inv 17). **Payer *capacity* is
  delegated, not adjudicated:** for store-mediated payment (the only channel for the foreseeable future) the
  store is **merchant of record** and the sole capacity adjudicator — no age gate of ours. A flat **≥18**
  worst-case default (inv 29) applies **only** to a future non-store rail where *we* are merchant of record,
  **not** a per-jurisdiction derivation — over-restricting payment is harmless (an adult Payer can be
  attached, R11) where over-restricting consent would block lawful learning.
- **Mentor** — the learner's **AI tutor** (the AI entity). The human supervisory capacity is the
  **supporter** (above); the AI is the `mentor`. ("Mate" / "AI Mate" is a product-voice synonym noted in
  `CONTEXT.md` only, never used in canon.)
- **AgeConsentDecision** — the single resolved-decision object the app reads for a Person's consent
  state; the COPPA-portable seam (CONTEXT: AgeConsentDecision; §3.2). Computed by
  `resolveConsentRequirement(age × residence_jurisdiction)` (§3.2).

---

## Part 3 — Capability model

The legacy fused "owner" is **dissolved**; capability derives from **relationships**, not a role flag
(CONTEXT: Owner ✗ superseded → split into admin / Payer / Guardianship). Five capability sources, only
two of which are roles:

| Capability | **Self** (own data) | **`admin`** | **`guardian`** (edge → charge) | **`supporter`** (edge → supportee) | **Payer** |
| --- | --- | --- | --- | --- | --- |
| Read/write **own** learning data | ✅ intrinsic (inv 7) | — | — | — | — |
| Manage org (members, invites, settings, billing-admin) | — | ✅ (CONTEXT: admin) | — | — | — |
| Hold consent authority / act-for a charge | — | — | ✅ (Layer 1, §2.2) | — | — |
| See/help a **specific** person's learning data | — | ❌ (inv 8) | ✅ that charge (inv 8) | ✅ that supportee, edge-scoped (inv 9) | ❌ (inv 17) |
| Manage subscription / billing | — | — | — | — | ✅ (CONTEXT: Payer) |
| **Age gate** | any age | age-agnostic (inv 17) | adult (consent authority, §2.2) | any age (inv 14; CONTEXT: supporter) | store-delegated; ≥18 only on a future non-store rail (inv 17) |

**Rules (each cites its anchor):**

- Roles are **`{admin, learner}`** only; `supporter`/`guardian` are capacities on edges (inv 5, 6). The
  **first member of an Organization is `admin`** (inv 5).
- **`learner` is opt-in, never auto-mandatory** (inv 5; CONTEXT: learner "not auto-assigned, chosen at
  onboarding"). `[DERIVED: a Person may hold a Membership whose role set is {admin} with no learner — e.g.
  an adult who only operates a family — directly from "learner not mandatory" + "first member is admin".]`
- **Self-ownership is intrinsic, not granted (inv 7).** `learner` activates the learning surface and
  marks participation; it grants nothing beyond the ownership every Person already has.
- **Data access is edge-derived (inv 8); supporter visibility is edge-scoped to the named supportee
  (inv 9)** — never org-wide. An external tutor is edge-only (own org-of-one + cross-org Supportership
  edge) and cannot see the family roster (§2.3).
- **Two supervisory layers** (CONTEXT: Guardianship, Supportership): **Layer 1 — Guardianship** (consent
  authority; adult; withdrawable) and **Layer 2 — Supportership** (granted visibility; any age).
  **Neither auto-implies the other** (inv 14); a supporter never holds consent authority (inv 14) and
  never needs to be a guardian.
- **Supportership authority:** a Supportership is granted by the **supportee if consent-capable, else by
  the guardian** (inv 15); guardian-granted supporterships must be **re-confirmed** by the learner on
  graduation, else they lapse (inv 16).
- **`admin` ≠ Payer:** `admin` is age-agnostic; **Payer capacity is store-delegated** (the store
  adjudicates for store-mediated payment; a flat ≥18 default applies only to a future non-store rail —
  inv 17); the two are separate, neither implies the other.

---

## Part 4 — Consent & age behaviour

### 4.1 — Age drives three independent things, on three scales  *(inv 10)*

There is **no `minor` boolean** (inv 10; CONTEXT: Consent "never a boolean"). Age drives **consent
capacity** (the jurisdiction's consent age, 13–16; inv 10) and **content level** (a continuous gradient,
theming only, **never a gate** — CONTEXT: Age Bracket; §3.3). **Payment capacity is *not* age-driven on
the store rail** — it is store-delegated (inv 17); a flat 18 applies only to a future non-store rail where
we are merchant of record. Numeric cohort labels are **banished**: use *consent-gated* (a charge),
*consent-capable*, *adult*.

### 4.2 — Two complementary pieces  *(§3.2)*

- **`resolveConsentRequirement(age × residence_jurisdiction)`** — the **policy function**: what the law
  requires (§3.2; CONTEXT: AgeConsentDecision). `residence_jurisdiction` is a **time-versioned** Person
  attribute keyed off residence, not current location (§3.4; CONTEXT: residence_jurisdiction).
- **`AgeConsentDecision`** — the **resolved object** the app reads and never looks behind: requirement +
  whether satisfied + how proven + expiry/receipt; the single COPPA-portable seam (§3.2). Field *shape*
  is locked (§3.2); enum *values* are pinned in `data-model.md`.

### 4.3 — The behavioural rules (each an invariant)

- **Age-gate precedes collection (inv 26).** Signup captures an age-range first; **no profile or learning
  data is persisted until lawful basis exists** (`AgeConsentDecision` resolves to allowed). The age
  screen is the only permitted pre-basis collection.
- **Consent is recorded per purpose (inv 27),** never blanket — separate records for
  `{core, thirdPartyShare, targetedAds, aiTraining}` (§3.2; CONTEXT: Consent), required even when launch
  uses only `core`. A human supporter seeing a charge's data is **not** one of these purposes — it is a
  Supportership edge + a per-purpose disclosure obligation (§3.2; see `docs/compliance/identity-compliance-register.md`).
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
  — never a crash, never a blank wall. `[DERIVED: "central, typed" from inv 11 + the repo's typed-error
  and "classify at the API boundary" rules.]`

### 4.4 — Verifiable parental consent for a charge

Email-plus is **insufficient VPC** once a charge's data is disclosed to third parties (LLM providers)
(CONTEXT: VPC; §3.2 third-party purposes). Behaviour: **buy, don't build** — platform parental-consent
where live, a VPC vendor elsewhere, outcome mirrored into the Consent record (CONTEXT: VPC). The vendor
choice and the under-13 VPC method are **open** (tracked in ROADMAP; see `docs/compliance/identity-compliance-register.md`).

---

## Part 5 — Independence & visibility

A Person **owns their account at every age**; managed vs credentialed is *login mechanics*, not ownership
(§3.1; CONTEXT: Person). The autonomy ceiling, stated as **tiers** (the thresholds are the jurisdiction's
consent age and a flat 18 — not numeric cohorts):

| Tier | Owns own data | Self-consent | Self-pay (Payer) | Overlay |
| --- | --- | --- | --- | --- |
| **Consent-gated** (a charge) | ✅ (inv 7) | ❌ guardian consent required (inv 10–11) | ❌ never reaches self-pay — can't self-serve (R2) | guardian consent (Layer 1) + an adult Payer; guardian never operates the learning `[DERIVED: inv 23 separates consent-authority from operate; CONTEXT: charge]` |
| **Consent-capable** (≥ consent age, <18) | ✅ (inv 7) | ✅ where law permits (inv 10) | ✅ where the store permits (inv 17) | self-pays via their own store account where allowed, else an adult Payer is attached (R11); consent only where required |
| **Adult** (≥18) | ✅ (inv 7) | ✅ | ✅ store-mediated (inv 17) | none required |

**The wallet does not buy oversight (inv 19).** A parent who pays for a consent-capable learner gains
**no** visibility into their learning without the learner's opt-in; above the consent age the learner is
the data subject and controls their data (inv 19).

**Self-pay is store-delegated (inv 17).** Capacity for store-mediated payment is adjudicated by the store
(merchant of record), not by us — a consent-capable minor self-pays where their store account allows; a
flat ≥18 default applies only to a future non-store rail. Orthogonal to consent (inv 22), so it does not
touch the consent floor. (Whether to surface under-18 self-pay in the UX is ruled in Part 10.)

---

## Part 6 — Lifecycle & transition safety

Non-negotiable safety properties binding every flow:

- **Account-detachment preserves identity (inv 20).** Managed → credentialed (**account-detachment**;
  inv 20) keeps the same `person_id` + all history; consent and guardianship edge ride through
  unchanged. *(Ruled 2026-06-09, OQ-11 — `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md` §1.1.)* Break test: row count and `person_id` identical before/after.
- **No orphans (inv 21).** Edge deletion (guardianship / supportership / membership) never cascade-deletes
  the Person or their history — a managed Person (charge *or* the rare managed adult) is never orphaned.
- **Time-triggered transitions are scheduler-driven (inv 24).** Consent-age / 18 crossings and
  `residence_jurisdiction` re-evaluation fire with **no user action** — a dormant account still
  transitions on its birthday — so they cannot live only in request handlers; a durable scheduler
  re-evaluates each Person on the relevant dates. `[DERIVED requirement: a background scheduler must exist
  — directly from inv 24; this is also the repo end-to-end-tracing rule: "verify something actually
  dispatches the event."]`
- **Transitions are append-only + audited; every interim state is a *named valid state* (inv 25)** —
  consent-pending, graduation-pre-org-choice, suspended-pending-fresh-consent — never an implicit gap.
  Each carries a Failure-Modes table (repo: UX-resilience, no dead-ends).

---

## Part 7 — Required transitions & flows

The invariants **force these flows to exist**. This part states each as a *requirement with its anchor*.
The detailed walk-throughs (screens, copy, per-state Failure-Modes tables) are authored at the spec/plan
layer; the settled product rulings that shape them are in Part 10.

- **R1 — Self-serve signup exists for consent-capable Persons and up.** Resolves age first (inv 26),
  auto-creates an org-of-one with the Person as `admin` (inv 1, 5), and lets them **elect** `learner`
  and/or a supporter capacity (inv 5 not-mandatory). A consent-gated Person cannot self-serve
  `[DERIVED: inv 13 "guardian-created only below the floor"]`.
- **R2 — Guardian-creates-charge is the only path below the consent floor (inv 13).** Produces a charge
  Person + `learner` membership + Guardianship edge + per-purpose Consent (inv 11, 27) at a proportionate
  assurance level (inv 30; VPC, §4.4).
- **R3 — A consent holding state exists** as a named valid interim state with no dead-end (inv 25, 26;
  repo: UX-resilience) and unlocks the moment valid Consent lands (inv 11).
- **R4a — Account-detachment (managed → credentialed) exists and preserves identity (inv 20).** The
  action-triggered login transition attaches a Login to the existing `person_id` via the invite-flow
  (`MMT-ADR-0010`); consent and guardianship edge are untouched; guardian-grantable at any age,
  child-claimable at 13+ (inv 13). *(Ruled 2026-06-09, OQ-11 — `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md` §1.1/§1.3/§4.1/§4.2.)*
- **R4b — Graduation (consent-capability crossing) exists, scheduler-driven (inv 24, 16, 19).** On
  crossing the consent age it converts guardian visibility to learner-opt-in (inv 19) and lapses
  unconfirmed guardian-granted supporterships (inv 16). Distinct from account-detachment (R4a) — time-
  triggered, not action-triggered. *(Ruled 2026-06-09, OQ-11 — `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md` §1.2/§4.3.)*
- **R5 — Self-service consent withdrawal exists and actually stops processing (inv 12)** — the UI promise
  and system behaviour must match (inv 12; repo: silent-recovery-banned for the escalation path).
- **R6 — Leaving / removal preserves the Person and history (inv 21);** edges detach, the Person is
  retained and re-claimable.
- **R7 — Per-Person export exists** for a Person or their guardian `[DERIVED: inv 2 person-scoping + inv
  21 retention make a per-Person (not per-org) export the only consistent shape]`.
- **R8 — Supportership grant exists, edge-scoped (inv 9), authorized per inv 15, re-confirmed per inv 16.**
- **R9 — Threshold-crossing re-evaluation exists, scheduler-driven (inv 24);** the *mechanism* is
  **per-dimension** (Part 10): visibility→opt-in (inv 19), supporterships lapse-unless-reconfirmed
  (inv 16), explicit consent self-takeover (inv 20).
- **R10 — `residence_jurisdiction`-change re-evaluation exists (inv 12, 24; §3.4);** the *response* is
  **suspend-into-R3 + re-prompt-as-exit** (Part 10); grace-window length is a counsel parameter.
- **R11 — Payment capacity is store-delegated (inv 17).** For store-mediated payment the store (merchant
  of record) adjudicates capacity; we impose no age gate. A consent-capable minor may self-pay where their
  store account permits, else an adult Payer is attached. *(A charge never reaches this flow — can't
  self-serve, R2.)* Which Person the store-completed purchase records as Payer under Family Sharing is
  open (tracked in ROADMAP). A flat ≥18 gate returns only on a future non-store rail.
- **R12 — Visibility opt-in exists and is learner-controlled (inv 19).**
- **R13 — Guardian attachment to an *existing* Person exists.** A Guardianship edge + per-purpose Consent
  can be attached to an already-existing self-registered Person who has transitioned into needing consent
  (e.g. a `residence_jurisdiction` change re-engages the gate, inv 12/24); they sit in the R3 holding
  state until it resolves. Distinct from R2, which *creates* a new managed charge. `[DERIVED: inv 12 + 24
  + 11 + 25 + R1]`. The initiation flow (minor-invites-guardian vs guardian-claims) and guardian-authority
  verification are ruled in Part 10 / tracked in ROADMAP.

---

## Part 8 — Definition of "done"

Done = **the 30 ontology invariants hold true under test**, each with a happy-path **and** a break test
written in the security-fix red-green pattern (repo: security-fix break-test). The legacy 36-gap audit is
a **regression checklist**, not the definition.

**Named break-tests beyond the 30** (derivable consequences elevated to *mandatory tests* because they
guard a real observed defect):

- **No-self-consent break-test.** A consent-gated Person with **no Guardianship edge** can neither have
  data processed **nor** be recorded as their own consent authority. Derives from §2.2 (dyadic, adult
  guardian) + inv 11 (consent over guardian edges) + inv 28. Red-green against the live self-fallback bug
  in the legacy family-owner resolver: write the negative-path test → passes → revert the guard → fails →
  restore.
- **No-consent-dead-end break-test.** A wrong/missing birth year routes to an **in-product correction
  path**, never a dead-end (inv 25 + repo UX-resilience). **Correction flow (ruled, Part 10):** an edit
  that does not cross the consent boundary just saves (honest typo, adult→adult); an edit that *would*
  cross the boundary — flipping the person between "needs a parent" and "doesn't" — requires a light
  verification step instead of instant trust, so a real adult can get unstuck but a child cannot type
  their way past the consent gate. Neither half is a 31st invariant — both trace to existing canon.

Carried open requirements that gate a *paid launch* but are not ours to close (the consent-scope
disclosure, the six-item legal register, the DPIA, the real age floor) live in
`docs/compliance/identity-compliance-register.md` + ROADMAP.

---

## Part 9 — Crosswalk: new model ↔ today's code

The clean cut lands in a codebase speaking the legacy vocabulary. The map (ontology current-code
crosswalk; CONTEXT ✗/⚠ entries):

| New-model concept | Today's code | Crosswalk note |
| --- | --- | --- |
| Person | `profiles` | rename surface; fused to a login today |
| Login | `accounts.clerk_user_id` / `profiles.clerk_user_id` | decouple from Person |
| Organization | `accounts` (fused) → inert `organizations` | wire the inert table; keep thin |
| Membership `{admin, learner}` | `family_links` + `isOwner` (live) → inert `memberships.roles[]` | live authz is the `isOwner` bool |
| The dissolved `owner` | `isOwner` boolean (CONTEXT: Owner ✗) | **splits three ways** — admin / Payer / Guardianship; re-point each `isOwner` site at the correct one |
| Guardian act-for | proxy mode / `isParentProxy` (CONTEXT: Parent Proxy ⚠) | candidate mechanism for guardian act-for; keep/retire decision pending |
| Consent gate on the edge | `consentStatus` + `consentMiddleware` | keep central middleware; move the key from profile to the Guardianship edge |
| `supporter` capacity (edge-scoped) | legacy `membershipRoleEnum 'mentor'` backfilled, **unwired** | wire it for the first time — **as a capacity on a Supportership edge, not a role** |
| `AgeConsentDecision` + per-jurisdiction age | flat `age<=16`, `MINIMUM_AGE=11` | replace with `resolveConsentRequirement` + worst-case table |
| Payer (store-delegated; ≥18 only on a future non-store rail) | implicit account holder | make explicit; capacity adjudicated by the store as merchant of record; reconcile recorded-Payer identity (ROADMAP) |

**Two-vocabulary risk:** until the crosswalk is executed, `resolveNavigationContract` (new) and
`resolveTabShape`/`isOwner` (old) describe the same humans incompatibly. The clean cut should land
`resolveNavigationContract` consuming the new role set, with the historical audience snapshot (`docs/flows/audience-matrix.md`)
sites as the checklist — not leave both alive.

---

## Part 10 — Settled product & UX rulings

The product/UX decisions that flesh out the Part-7 requirements, ratified and lifted to canon. (The
ratification trail + the architecture ripples behind them are in `_wip/identity-foundation/_history/identity-foundation-prd-provenance.md`
+ the ADRs; the compliance obligations are in `docs/compliance/identity-compliance-register.md`.)

**Personas (adopted as derived, anchored to the model).** Solo adult; independent consent-capable minor;
charge (guardian-managed); family operator (admin + guardian×N + Payer ± learner); supporter/tutor (any
age, edge-only); and the managed-adult "grandparent" (UC-1, §9). Copy to be authored at the spec layer.

**Login mode & child-login provisioning.**
- Self-signup → the Person gets their **own login (credentialed), no age-based steering** (the consent
  gate still catches under-age self-signups).
- **Parent-adds-child asks "own device/account, or yours?"** Own device → a **credentialed charge** (own
  login *and* still consent-gated); parent's device → a **managed charge**. The consent-giver is unchanged
  (the parent consents either way — no safety regression). On-model: login-presence ⊥ consent-requirement
  (§3.1, inv 4).
- **Child-own-login uses the invite-flow** — the child completes their own Clerk sign-up (JIT
  provisioning), attached to the existing `person_id` via a `migration-pending` interim — never
  parent-creates-credential (`MMT-ADR-0010`).

**Consent holding state.**
- The consent-pending preview is **browse-only and must remain no-AI / no-collection / no-network** — that
  is the only reason it is lawful pre-consent; the real AI stays hard-blocked at app *and* server (403).
- Consent caps (locked, as built): **3 resends, 3 recipient-email changes, 7-day link, a ~30–60s
  resend cooldown, and a 7-day withdrawal grace window.**

**Age / consent edits.**
- **Stricter-wins:** take the stricter of the self-declared age and the platform Age-Signal (inv 29
  generalised).
- A profile edit that **does not cross the consent boundary just saves**; an edit that **would cross it**
  (flips the Person between "needs a parent" and "doesn't") requires a **light verification step**, not
  instant trust.

**Threshold crossings — per-dimension, never monolithic (inv 22).**
- At a consent-age / 18 crossing: **guardian visibility → learner opt-in, default OFF** (inv 19 — never
  auto-on); **guardian-granted supporterships lapse unless re-confirmed** (inv 16); **account-control
  self-takeover is explicit, status-quo-until-taken** (inv 20). The scheduler fires the re-eval regardless
  (inv 24).
- **Visibility default-off is load-bearing** (≈99% of teens turn the parent's view off). The birthday
  teen-prompt ("you control this now — keep sharing, or turn it off?") + a reshare / ask-to-keep path
  serve the ~1% who want a parent in the loop; if the prompt is too costly to build, the **fallback is
  auto-off + a reshare button** — never auto-on (auto-on would violate inv 19).
- **Account-control takeover is a prompt, not automatic.** The system invites the now-capable teen to take
  over and make it their own account; everything stays status-quo until they accept (inv 20). Taking over
  requires the teen to set up their own login (so it can't be silent).

**Residence change.**
- **Response = suspend + re-prompt** (not either/or): if the new jurisdiction's standard isn't satisfied
  and the Person is now consent-gated, processing **suspends into the R3 holding state** (inv 11/12/25),
  scheduler-detected (inv 24); **re-prompt is the exit** (for a guardian-less self-registered minor, via
  R13). Only bites those crossing *into* needing guardian consent (adults unaffected).
- **Suspended state reuses the browse-only preview** (the same no-AI "while you wait" preview) **plus a
  clear explainer** — not a cold lock.
- **Residence is a declared setting (source of truth); never gate on current location** (a holiday or VPN
  never re-gates, §3.4). A **soft nudge** fires **only when** signals suggest a *sustained* change **AND**
  the new jurisdiction would actually change this Person's consent requirement; **never auto-pause on a
  signal alone** — only the Person confirming the new residence changes anything.

**Payer / billing.**
- **Store-delegated, no product block.** A self-signed-up under-18 *owner* keeps seeing "Upgrade" (the
  store — Ask-to-Buy / payment method — is the sole gatekeeper); a managed child on a parent's account
  sees **"Notify Parent"** (no Upgrade).

**Last-guardian departure.**
- Replace the silent cascade-delete with an **explicit choice** presented to the departing consenting
  parent at account deletion: (i) **export** the child's data; (ii) **attach another consenting adult**
  (offered, not forced; = R13); (iii) **delete** the child's data. Scoped to genuine under-consent-age
  charges only.
- **managed ≠ consent-gated:** a capable managed Person's export/delete routes to **themselves** (inv
  7/19), never to the parent.
- **Abandonment** is covered by a general **dormancy-deletion policy** applied to all accounts (~24 months
  inactivity → warn + export window → cleanup), riding the durable scheduler (inv 24, 25).

**Supporter ceiling & notes wall.**
*(Ruled 2026-06-09, OQ-11 — `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md` §1.5/§4.4.)*
- **Supporter ceiling = the recap/grades layer.** A supporter sees curated summaries (recaps, subjects,
  mastery, streaks, activity) **only** — never notes, mentor memory, or transcripts. The
  recap/grades layer is reached **only through a valid Supportership edge** (inv 9, 15); consent-authority
  alone grants **no** visibility.
- **A post-detachment guardian-as-consent-holder sees summaries only via a Supportership edge.** Once the
  charge has a Login (account-detachment), `MMT-ADR-0008` suppresses the derived guardian `view`
  (`view ⇐ guardian-link ∧ shared-org ∧ charge-has-no-Login` — the Login breaks the derivation), so a
  consent-holding guardian who is *not also* a supportee-granted supporter sees nothing. Curated summaries
  for the detached case ride the **guardian-granted Supportership edge** (decision-capture §2 tier table,
  inv 15), not the consent edge — consent ≠ visibility (inv 22).
- **Notes stay walled at every tier.** Guardian access to a managed charge's full data (including notes
  and transcripts) runs through the **explicit, audited export/rights path only** (inv 21
  erasure/export pattern) — never ambient browsing.
- **Mentor-memory management is a derived capability** (`operate`/`manage`; `MMT-ADR-0008` derivation:
  `guardian-link ∧ shared-org ∧ charge-has-no-Login`). It is structurally **suppressed by
  account-detachment** — a credentialed charge has a Login, so the derivation does not fire. No
  per-screen flag; the capability derivation is the gate.
- **Any future widening** of supporter or guardian data access must be **two-way-transparent** (the
  child's UI states what the supporter/guardian can see) — never covert.

**Proxy mode — no re-entry.**
*(Ruled 2026-06-09, OQ-11 — `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md` §1.6/§4.4.)*
- **No user-facing entry point.** Zero production call sites pass `proxyMode: true`
  (`use-parent-proxy.ts:11-17`, `profile.ts:373` — comments only); proxy is dormant plumbing.
  **Ruling: keep the mechanics** (candidate for guardian act-for, Part 9 crosswalk), but **never
  re-wire a user-facing entry point without an explicit ADR.** Any future proxy surface requires
  its own ADR + two-way-transparency obligation.

**De-credential.**
- **Disallowed; no self-service, no UI.** Account-detachment is one-directional (inv 20) — once a
  Login is attached, removing it (de-credentialing) is **not a user-accessible operation**. Any genuine
  edge case (data repair, mistaken account, legal/ops request) is a **manual, audited backend/ops
  intervention** that still honours canon — it may not strip a consent-capable learner's data control
  (inv 19) or orphan a Person (inv 21), and is append-only + audited (inv 25).
  *(Ruled 2026-06-09, OQ-11 — `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md` §4.5.)*

**Family-operator surface.**
- **Split spaces, purpose-led landing.** The multi-role person sees separate spaces (a family/supporting
  space and a "my own learning" space) with a runtime Study/Family switch, led by an explicit "What brings
  you here?" purpose choice at signup. A family-door with **no child yet lands on a focused "add your first
  child" setup screen** — **not a hard gate** (skipping it falls through to the learner home; never force
  add-child). Must still serve an **admin-only** operator (learner-optional).

**Join-my-family (v1).**
- A minimal **"join my family" ships in v1:** a parent buys Family, invites their **existing-account,
  self-consenting teen**, the teen accepts → the teen **joins the parent's family org** (shares the Family
  quota seat); the parent becomes **admin + Payer**; and the **teen grants the parent an opt-in
  Supportership** — **no auto-Guardianship** (the teen self-consents, inv 14/19).
- The teen's **Person + learning history are preserved** (inv 20/21); the teen's existing subscription is
  reconciled (inv 18); the sequence **never orphans** — add the Membership *before* decommissioning the
  teen's now-empty org-of-one, via a named `migration-pending` interim (inv 21, 25).
- **Billing = option B (join-with-disclaimer):** the joining teen with an active store sub joins
  immediately (covered by family quota) and keeps paying their own store sub until they self-cancel
  (store-delegated billing rules out a server-side refund), with an explicit **double-charge warning** + a
  follow-up nudge.
- **Ban minor-initiated Guardianship** — a minor may not nominate their own consent authority (fails inv
  28/30). The legitimate "minor reaches out first" path is a **request to join** (authority always flows
  adult-side; the adult accepts + provides VPC, mirroring inv 15/16). v1 = **parent-initiated invite,
  consent-capable teen**; the below-consent-age teen variant (needs guardianship + VPC via R13) and
  child-initiated request-to-join stay deferred (ROADMAP).

**Separated parents.**
- The **one-Person model is kept reachable** (Person ≠ Login + global consent edge + multi-org
  Membership); only regressing to the fused/account-bound shape would foreclose it, and the clean cut
  forbids that. Whether v1 *builds* shared-custody / one-vs-two-Persons is a product + legal call (ROADMAP).
