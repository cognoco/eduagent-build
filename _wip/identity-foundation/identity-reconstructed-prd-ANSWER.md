# Identity Foundation — Answer to the Reconstructed PRD

**Status:** RATIFIED PRODUCT INTENT (PM-approved in working session). **Date:** 2026-06-01
**Answers:** `identity-reconstructed-prd.md` — specifically its §11 open-questions agenda, and the
`[GAP]/[CONFLICT]/[question]` tags throughout.
**Relationship to strategy:** Consistent with `README.md` (pre-launch **clean cut**, T1 reverted)
and its guardrails — every model shape below is **derived from product intent first**, not carried
forward from the archived plans. Where this lands on a structure that resembles the archived
"Approach A" (an `organizations` table), that is an *intent-derived outcome with the drift-causing
parts deliberately stripped out* — see §7 and Part VII.

**Provenance legend (how to read against the PRD):**
- **[RATIFIED]** — a PRD `[STATED]`/`[INFERRED]` item, now confirmed as intent.
- **[CORRECTED]** — a PRD `[STATED]` item that was wrong (usually legally) and is replaced.
- **[DECIDED]** — a PRD `[GAP]`/`[question]` now answered.
- **[OPEN-LEGAL]** — answered as engineering intent, but needs counsel sign-off before a paid launch.
- **[REVISED 2026-06-01]** — a previously-ratified answer in this doc, changed in the 2026-06-01 working session (auth provider; mentor age gate).
- **[DERIVED]** — a journey / UX consequence that follows necessarily from the ratified model above; not a new product decision, just the model made walk-able. (Parts X–XII.)
- **[NEEDS-RATIFICATION]** — a genuine product/UX decision surfaced while drawing the journeys that the ratified model does **not** force; flagged for an explicit PM call before build.

---

## Part I — Direct answers to the PRD §11 questions

The PRD's §11 is the agenda. Here are the eight answers; the rest of this document is the supporting
detail.

1. **Target user — broadened or 11–15 parent-managed?** → **[DECIDED] Broadened, and stated as a
   decision.** The product serves **serious learners of any age, age-neutral**: solo adults,
   independent credentialed teens, *and* parent-managed children. The "homework-helper" wedge is GTM
   framing, not an audience cap. Parent-managed family tutoring is **one mode among several**, not the
   whole product.

2. **Role-capability matrix?** → **[DECIDED]** — see **Part IV**. Capability derives from
   *relationships*, not a fused role flag: intrinsic self-ownership, an age-agnostic `admin` role, an
   edge-scoped `mentor`, an edge-bound `guardian`, and an adult `Payer` field (no learning-data access).

3. **Consent under own-logins?** → **[DECIDED] / [OPEN-LEGAL]** — see **Part III**. A login confers
   **no** consent capacity. Consent is a function of **age + jurisdiction**, captured on a dyadic
   guardianship edge, and is required below the local consent age (13–16) regardless of whether the
   minor has their own login.

4. **One owner per org?** → **[CORRECTED]** "Owner" is dissolved. There is no single fused owner.
   There is an age-agnostic **`admin`** (can be more than one; transferable) and a separate adult
   **`Payer`** on the subscription. "Exactly one owner" was an artifact of the fused model and is
   dropped.

5. **Multi-org membership — whose subscription / consent / visibility?** → **[DECIDED]** — see
   **§8**. **Billing and consent follow the *home* org**; a second org (e.g. a tutor's roster) grants
   **edge-scoped visibility only** and never changes who pays or who consents.

6. **Credential default thresholds — product choice or legal requirement?** → **[CORRECTED] Both,
   split apart.** The managed-vs-own-login *default* is a soft, overridable UX choice. The **13–16
   consent age** and the **18 payer age** are **hard legal gates**, not defaults. Conflating them
   (archived D4) was the bug.

7. **Success criteria — what does "done" mean at the product level?** → **[DECIDED]** — see
   **Part VIII**. "Done" is the invariants list holding true under test, *not* "36 audit gaps closed."
   The audit is a regression checklist, not the definition of done.

8. **Transition strategy — clean cut vs incremental?** → **[RATIFIED] Clean cut** (already the
   README decision). Build the corrected model directly, re-seed dev/staging, no flag, no backfill,
   no dual-model; T1 reverted forward-only per README guardrail #4. See **Part VII**.

---

## Part II — Product vision & target user  *(answers PRD §1)*

**[RATIFIED] Vision:** *Every person — including a child — owns their own identity and learning
history permanently. People can be grouped (a family today; a tutor's roster or a school later) and
a group can hold a subscription, but grouping never owns the person or their data. Each person gets
the **maximum autonomy the law allows at their age and jurisdiction**; guardians and payers are a
**minimal legal overlay, not a control regime**. A learner can move from parent-managed to their own
login — and later out of a family entirely — without losing anything.*

**[DECIDED] Audience (now explicit):** consumer-first — solo adult learners, independent teens
(13–17), and parent-managed children (11–12). Institutional/B2B selling is **not a near-term goal**
but the model must not foreclose it (see **Part VI**).

This vision **replaces "close 36 audit gaps" as the source of intent.** The gaps become a regression
checklist, not the design driver.

---

## Part III — The consent / age model  *(fills PRD §7 — the load-bearing gap)* — [DECIDED] / [OPEN-LEGAL]

### III.1 — There is no single "minor" flag  *(corrects PRD §2, §5)*

The archived `Adult/Minor` boolean is **[CORRECTED]**. Age drives **three independent things**, on
**three different scales**:

| Axis | Question | Threshold |
|---|---|---|
| **Consent capacity** | Can this person consent to their own data processing? | **13–16, per-market** (COPPA 13; GDPR 13–16; Norway 13) |
| **Contract/payment capacity** | Can this person be the paying contract-holder? | **18, flat** across US / EU / Norway |
| **Content level** | What tone/complexity/content? | **continuous gradient — never a gate** |

These are resolved by **one server-side function** — the single home for all legal age logic:

```
resolveConsentRequirement(person, jurisdiction, platformSignal)
  → { consentAge, requiresGuardianConsent, payerEligible, contentBand }
```

- `consentAge` from a per-market table (Norway 13, Germany/NL/HU/LT/LU/SK 16, etc.), **defaulting to
  16 when jurisdiction is unknown** (safe everywhere; GDPR's ceiling).
- `requiresGuardianConsent = age < consentAge`.
- `payerEligible = age >= 18`.
- `contentBand` for theming/copy only — **never** used for gating.

Per-market (not a flat 16) is the choice because it **preserves the max-independence principle in
the home market**: a 14-year-old Norwegian self-consents instead of being forced to attach a parent.

### III.2 — The keystone simplification — [DECIDED]

> **Self-sign-up is 13+ only. The 11–12 cohort can only be *created by a guardian* (parent-initiated).**

This erases the worst attack surface (an 11-year-old self-registering alone with a Google account
they lied to create), matches reality (no 11-year-old has a standalone account or a card), keeps
"the child owns their own Person/data" intact (the guardian *creates and consents*, never
*operates*), and guarantees verifiable consent for under-13s runs through a guardian who is
**present** at setup.

### III.3 — Consent is a dyadic guardianship edge, not a role  *(fills §7, corrects §3/§4)*

Consent is "**guardian G consented for ward W, policy version V, at time T, revocable**." That is a
**per-pair fact** an org-wide role cannot express (one parent with three children has three distinct,
independently-revocable consent records). So:

- Promote **`family_links`** (guardian person → ward person) to a first-class **Guardianship edge**.
- Hang the consent record (**`consent_states`**) off that edge, strengthened with:
  `verification_method` (`platform` | `email_plus` | `vpc_vendor`), `jurisdiction`, `policy_version`
  (exists), and a snapshot of any platform age/consent signal.
- The guardianship edge lives **alongside** membership — it is **never** a role in the role set.

### III.4 — Verifiable parental consent — [DECIDED] / [OPEN-LEGAL]

Your current parent-email flow is "email-plus," which COPPA permits **only when the child's data is
not disclosed to third parties** — but EduAgent sends learning content to LLM providers (third
parties). So **email-plus is insufficient VPC for the under-13 (11–12) cohort.**

- **Build nothing here — buy it.** Use the **platform** parental-consent mechanism (Apple Significant
  Change / PermissionKit; Google Play parental approval) where the account is Family-managed and the
  region is live, and a **VPC vendor** (k-ID, SuperAwesome / Kids Web Services-style) for the
  guardian-consent step elsewhere. Mirror the outcome into `consent_states`.
- **[OPEN-LEGAL]:** the under-13 VPC method for an LLM-backed product is the #1 item for counsel.

### III.5 — Age verification architecture (front + back) — [DECIDED]

**Principle: defense in depth.** Self-declared age at the door, upgraded by the platform signal where
live, with the consent record as the artifact that unlocks data processing.

**Principle: minimum friction. [REVISED 2026-06-01]** Sign-up must be as friction-less as possible —
the fewest steps, **no provider lock-in**, and no field that isn't legally load-bearing. Every gate in
the flow below earns its place by closing a consent/age obligation; nothing is added for "cleaner
identity" alone. Birth year is collected because it drives `resolveConsentRequirement` (III.1), not as
profiling.

**Auth: [REVISED 2026-06-01] keep current Clerk auth as-is — do NOT restrict to Apple + Google
sign-in.** Email/password stays available alongside whatever OAuth providers are enabled; the goal is
the most friction-less sign-up possible. The OAuth-only restriction was reconsidered and dropped
because it **solves no consent or age-assurance problem**: the platform **Age Signals** APIs (Apple
Declared Age Range, Google Play Age Signals) are **OS/device-level** and queryable regardless of how
the user authenticated — they were never gated on Apple/Google *sign-in*. So the originally-cited
benefits (relay emails, "positions us for platform signals") do not require provider lock-in, and the
lock-in only adds sign-up friction. The login method stays decoupled from identity: a login confers no
consent capacity (III.3), and one Person may hold multiple emails / OAuth logins via Clerk.
*(Store-compliance reminder, not an identity constraint: iOS Guideline 4.8 still requires Sign in with
Apple **if** Google sign-in is offered — it does not require dropping email/password.)*

**Front end onboarding:**
1. Sign in (**any enabled method — email/password or OAuth; no provider restriction**, friction-minimised).
2. Collect **birth year** (matches `computeAgeBracket`; data-minimising). At a threshold boundary,
   resolve to the **younger** side (conservative).
3. Query the platform **Age Signals** API (Apple Declared Age Range / Google Play Age Signals) —
   **OS/device-level, independent of the sign-in provider**. Reconcile against self-declared and
   **take the stricter**. Platform "unknown" (most of EU/NO today) → fall back to self-declared.
4. Branch on the resolved band:
   - **16+** → independent learner, self-consent, no guardian. (13–17 still cannot be Payer.)
   - **13–15** → consent per `resolveConsentRequirement` (self in NO/13-markets; guardian in
     16-markets) → holding state where guardian consent is required.
   - **Under 13** → never reaches self-serve; exists only via guardian-initiated creation.
5. **Holding state** (consent-required, not yet granted): a kid-friendly **"ask a grown-up"** screen
   that captures the guardian / launches platform consent. **Not a dead-end** (honours never-lock /
   human-override). Core learning (anything sent to the LLM) stays gated until consent lands.
6. **Payment never appears in a minor's UI** (see §8).

**Back end:**
- **Consent-gate middleware** on every data-processing route: if `requiresGuardianConsent` and no
  valid consent record on the guardianship edge → throw typed **`ConsentRequiredError`** (fits the
  repo's typed-error-hierarchy + UX-resilience rules). One central gate, not per-screen checks.
- **Platform-signal ingestion**: an Expo native module bridging the Age Signals APIs, plus handlers
  for the significant-change parental-approval callbacks and Google's **revocation** notifications →
  re-evaluate the gate on change.
- **`resolveConsentRequirement`** is the single source of legal truth (jurisdiction → consent age,
  payer eligibility). Per-market table lives here, testable and auditable.

### III.6 — Two sign-up entry paths (self-serve + invitation) — [DECIDED] [REVISED 2026-06-01]

A Person enters through **one of two paths**; both land on the same Person + org + membership model.

**Path A — Self-serve sign-up (13+ only).** The III.5 flow: the person signs up themselves (any auth
method), declares age, and an **org-of-one** plus a `{student}` membership are auto-created. Under-13
cannot use this path (III.2).

**Path B — Invitation link.** An existing member invites someone into an **existing** org via a claim
link. Three shapes:
1. **Guardian creates / invites a ward** — the *only* path for 11–12 (also usable for 13+). The
   guardian initiates from their org; the ward gets a **managed** login by default (own login if 13+
   and the guardian opts in), a `{student}` membership in the guardian's org, and a **guardianship
   edge** + consent record. This is the III.2 "guardian-created" keystone made concrete.
2. **Adult invited as co-admin / co-guardian** — joins with `{admin}` (plus a guardianship edge per
   ward where applicable). The second-parent case.
3. **Mentor invited for a specific mentee** (e.g. a tutor) — joins with `{mentor}` and a **mentor edge
   to that one mentee**, never org-wide visibility. The mentor may be **any age**.

**Rules for Path B:**
- The invite **attaches to (or creates) the right Person and edges** — it must **never** create a
  parallel duplicate Person when one already exists (this is what keeps a merge tool out of scope).
- The link is **single-use, expiring, and scoped to the exact role(s)/edge it grants** (reusing a link
  cannot escalate privilege).
- Consent + billing still follow the **home org** (§8); an invite into a *second* org (a tutor's
  roster) grants **edge-scoped visibility only** and changes neither who pays nor who consents.
- Claiming a link still runs the age/consent resolution (III.1/III.5): an invited minor still gates on
  consent; an invited adult self-consents.

---

## Part IV — Roles & capability matrix  *(fills PRD §4)* — [DECIDED]

The fused "owner" is dissolved. Capability is derived from relationships.

> **How to read the columns.** These are **capability *sources***, not the membership-role set. Two of
> them are membership roles (**Admin**, **Mentor**); **Guardian** is an edge and **Payer** is a
> subscription field. The third membership role — **`student`** — is **deliberately not its own column
> because it grants no capability beyond the Self baseline**: a student's entire power *is* intrinsic
> self-ownership, so it shares the **Self / `{student}`** column. `student` still exists as a real
> membership role — it marks *who the org serves* (learner-seat counting) — it simply adds nothing to
> the capability surface. (Self itself is not a role; it is the baseline every Person carries.)

| Capability | **Self / `{student}`** (the member, own data) | **Admin** (org role) | **Guardian** (edge → ward) | **Mentor** (edge → mentee) | **Payer** (subscription field) |
|---|---|---|---|---|---|
| Read/write **own** learning data | ✅ intrinsic | — | — | — | — |
| Manage org (members, invites, settings) | — | ✅ | — | — | — |
| Consent / act-for a specific minor | — | — | ✅ (act-for only below consent age) | — | — |
| See/help a **specific** person's learning data | — | ❌ (membership ≠ data access) | ✅ (that ward) | ✅ (that mentee) | ❌ |
| Manage subscription / billing | — | — | — | — | ✅ |
| **Age gate** | any age (11+) | **age-agnostic** | adult | **any age (11+)** | **≥ 18** |

Key rules:
- **Self-ownership is intrinsic, not granted** — this dissolves archived **D6** (a child writing
  their own work is ownership, not a special case). `student` stays a **membership role** but is
  **capability-light**: it marks "this member learns here" and grants nothing beyond the intrinsic
  self-ownership every Person already has.
- **[REVISED 2026-06-01] Membership carries a role *set* `{admin, mentor, student}`; a Person holds
  any combination, at any age.** `student` and `mentor` are both **any-age and freely combinable** —
  e.g. an older child is `{student, mentor}` (learns here AND mentors a younger sibling), an adult
  tutor is `{mentor}` only, a plain learner is `{student}`. Neither carries an age gate; adult-only
  stays on **Guardian** and **Payer**.
- **Mentor/guardian visibility is edge-scoped** — org membership grants only "you can see who is in
  the org," never their learning data. This fixes the archived **org-wide-mentor privacy leak** (a
  tutor invited for one child must not see the whole family). Archived D2 (org-wide mentor) is
  **[CORRECTED]**.
- **Admin has no learning-data access** without an edge. **Payer** has no learning-data access at all.
- **[REVISED 2026-06-01] Mentor has no age gate — a mentor may be any age (11+).** Mentoring is
  edge-scoped *help/visibility* for a specific mentee, not a legal-consent function, so it carries no
  adult requirement (a peer, an older sibling, a study buddy all qualify). The edge is still granted by
  the mentee — or, below the consent age, by the mentee's guardian — so a minor mentor never gains
  unilateral access. Adult-only stays on **Guardian** (legal consent) and **Payer** (≥18 contract
  capacity); those are unchanged.

---

## Part V — Independence & visibility rules — [DECIDED]

**Principle:** maximum autonomy the law allows; guardian/payer is a minimal overlay. Teens (13–17)
get **their own login by default** (own account, maximal independence). A person owns their account
at **every** age — "managed vs credentialed" is login *mechanics*, not ownership.

**Per-band autonomy ceiling:**

| Band | Owns account | Own login (default) | Self-consent | Self-pay | Guardian/Payer role |
|---|---|---|---|---|---|
| **11–12** | ✅ | managed default (own login possible if guardian sets up) | ❌ guardian mandatory (every market) | ❌ | consent + payer; **never operates** |
| **13–15** | ✅ | **own login** | per-market (NO yes; DE no) | ❌ | consent only where law requires; payer if paid |
| **16–17** | ✅ | own login | ✅ everywhere | ❌ | optional; none required |
| **18+** | ✅ | own login | ✅ | ✅ | n/a |

**Visibility consequence (decided toward teen privacy):** a parent who **pays** for an independent
teen (16+, or self-consenting 13–15) does **not** automatically **see** their learning. Above the
consent age the teen is the data subject and controls their data; visibility is **opt-in, granted by
the teen** (prompt the teen to optionally share progress with the payer). The wallet does not buy
oversight.

---

## Part VI — Future-proofing (institutions / B2B) — [DECIDED]

Not a near-term goal, but the model must not corner us. **What corners you is fusing access/billing/
consent into a group — not the absence of orgs.** Keep these four cheap seams open and build **zero**
institutional features:

1. **Scope learning data to `person_id`, never to a group id.** (This is the exact mistake the legacy
   `accounts` model made — the one we're escaping.) A group is always an overlay.
2. **Access is edge-derived, never "same tenant."** Teacher↔student later is just another edge.
3. **Payer is a separable, growable field**: `subscription.payer_person_id` (adult) now; add
   `payer_org_id` + a "exactly one set" check when B2B comes — a trivial additive migration.
4. **Keep a thin `organizations` table as a dormant grouping/billing seam.**

A school, when it comes, is then **additive**: a bag of student-Persons + teacher↔student edges + an
institutional Payer + (optional) rostering integration (Clever / Google Classroom). Nothing in the
consumer model moves.

---

## Part VII — The corrected core model & transition  *(resolves PRD §3 and §10)*

### VII.1 — The model (intent-derived) — [DECIDED]

| Entity / relationship | Role in the model |
|---|---|
| **Person** (`profiles`) | Identity + own learning data, permanent. Managed (`clerk_user_id` null) or credentialed. The **scoping key** for all learning data. |
| **Organization** (`organizations`) | **Thin** grouping + billing container. Always exists (org-of-one). The dormant B2B seam — does **no** access/consent work. |
| **Membership** (`memberships`) | Person ↔ org link granting **existence-visibility** only. Carries a **role set `{admin, mentor, student}`** — a Person holds **any combination, at any age**: **`admin`** (age-agnostic org management), **`mentor`** (can mentor here; data-visibility is **edge-scoped** to linked mentees, never org-wide), **`student`** (learns here; capability-light — grants nothing beyond intrinsic self-ownership, but marks *who the org serves*, e.g. learner-seat counting). E.g. older child = `{student, mentor}`, adult tutor = `{mentor}`, plain learner = `{student}`. |
| **Guardianship edge** (`family_links` + `consent_states`) | Dyadic guardian → ward, carrying the consent record. The legally load-bearing relationship. |
| **Subscription** | On the org. Carries **`payer_person_id`** with invariant **payer age ≥ 18**. Future: `payer_org_id`. |

> **Honest note on "keeping Approach A":** this keeps the archived plan's **org *table*** (preserving
> the B2B seam) while **rejecting everything that made it drift** — the fused owner, org-wide roles
> carrying access, the org-as-tenancy doing heavy lifting, the single-owner assumption. The real
> semantics move to **person-scoped data + dyadic edges + a separable payer**. Per README guardrail
> #2, this is *re-derived from intent*, not carried forward. At the capability layer it is nearly
> isomorphic to a relationship-first ("Approach B") model; the only retained difference is that the
> grouping is a first-class table rather than a thin construct — kept deliberately, for B2B optionality.

### VII.2 — Transition — [RATIFIED] clean cut

Consistent with `README.md`: **clean cut.** Build the corrected model directly; re-seed dev/staging;
**no** `MODE_IDENTITY_V1` flag, **no** backfill-from-accounts, **no** dual-model shims. **Revert T1**
forward-only (per README guardrail #4 — a forward drop-migration or fold into the clean re-baseline;
do not delete applied migration `0106` in isolation). The corrected model is **not** grown on top of
T1's `0106`; it is authored clean from this intent. The archived §10 "incremental vs clean" conflict
is therefore **closed in favour of clean cut.**

---

## Part VIII — Resolved invariants (the definition of "done") — [DECIDED]

A reviewer signs off when these hold under test (each gets a happy-path **and** a break test):

1. Every Person ∈ ≥ 1 org (org-of-one auto-created at signup).
2. **Learning data is scoped to `person_id`**, never to org/account id.
3. A Person's **own** learning data is read+write by that Person, regardless of roles (self-ownership).
4. **Mentor/guardian data-visibility is edge-scoped**; membership alone grants only existence-visibility.
5. `admin` is **age-agnostic**; **Payer must be ≥ 18**; the two are separate; neither is the other.
6. A Person below their jurisdiction's consent age (per `resolveConsentRequirement`) **cannot have
   learning data processed** without a valid consent record on a guardianship edge.
7. **Under-13 (11–12) are guardian-created only**; no self-sign-up below 13.
8. **Auth is unrestricted (email/password + OAuth), optimised for friction-less sign-up**; age is
   self-declared at onboarding and reconciled with the platform signal where available — OS-level, so
   independent of the sign-in provider (stricter wins).
9. **Billing + consent follow the home org**; a second org grants edge-scoped visibility only.
10. A paying adult does **not** gain visibility into a self-consenting teen's data without the teen's
    opt-in grant.
11. **Two sign-up entry paths exist** — self-serve (13+) and invitation link (guardian-creates-ward,
    co-admin, or mentor-for-mentee) — and an invitation **attaches to an existing Person / creates the
    right edges, never a duplicate Person**; links are single-use, expiring, and role/edge-scoped.
12. **[DERIVED] Graduation preserves identity.** Managed → credentialed (a managed ward claims their
    own login) keeps the **same `person_id`** and all learning history — no new Person, no data loss
    (Journey J4). The break test: history row count and `person_id` are identical before and after.
13. **[DERIVED] Consent revoke is real, not cosmetic.** A guardian can withdraw consent from the UI and
    LLM data-processing for that ward **actually stops** — the system never shows a withdrawal promise
    it cannot keep (Journey J7). This directly retires the live broken-promise bug
    (`drift-map-exec-summary.md` §"the one risk").
14. **[DERIVED] Export and departure are per-Person.** A Person (or their guardian, below consent age)
    can export their own data and leave an org **without** the Person or their learning history being
    deleted (Journeys J8, J9). Leaving a group detaches edges/membership only.
15. **[DERIVED] A managed minor is never orphaned.** A managed ward's Person + data **survive** guardian
    or org departure and remain claimable later via graduation — `family_links` deletion must **not**
    cascade-delete the ward's Person (Journey J8). (Today it cascades — see Part XII crosswalk.)
16. **[DERIVED] The store payer reconciles to `payer_person_id`.** The IAP/RevenueCat payment identity
    maps to a `payer_person_id` that satisfies the ≥18 invariant, and **payment never originates in a
    minor's UI** (Journey J13).
17. **[DERIVED] A 13–17 independent learner has a paid-plan path — via an attached adult Payer, not
    self-pay.** Self-pay stays ≥18 (invariant 5), so a paid (Plus) plan for an independent teen is
    reached **only** by attaching an **adult `payer_person_id` (≥18)** to the teen's **own** org-of-one:
    payer-only, granting billing responsibility and **no** learning-data visibility (Part V — the wallet
    does not buy oversight; visibility stays the teen's opt-in, J12). The **free tier is always the
    no-payer default**, so an independent teen is **never** hard-blocked from learning while unpaid
    (honours never-lock). Resolves the "no payer exists for a paid 16–17 independent" gap. Journey J14.
18. **[DERIVED] No self-consent, and no consent dead-end.** Two break tests, from a real symptom observed
    2026-06-01 (an adult signs in and lands directly on "parent or guardian must approve", is never asked
    for age, and is effectively asked to consent *to themselves*):
    - **(a) No self-authority.** A Person with **no guardianship edge** is never offered or recorded as
      their **own** parental-consent authority. This forbids the legacy `getFamilyOwnerProfileId`
      self-fallback (`consent.ts:1144` returns the caller's own profile when no `family_links` exist).
      Above the consent age → self-consent; below it with no guardian → blocked from self-creation
      (III.2), never "approve yourself."
    - **(b) No age dead-end.** A Person stuck consent-required because of a **wrong or missing birth
      year must have an in-product path to correct their age** — today there is none (birth-date
      correction `onboard-3` is unbuilt), so a profile with a bad/absent age is a hard dead-end in the
      holding gate, violating never-lock. The clean-cut must collect age before the gate can trigger, and
      let a mis-set age be corrected (with the bracket-crossing guard from the profile-setup plan).
    Break tests: a signed-in account with no guardianship edge must never reach a self-pointing
    "approve" screen; and correcting an erroneously-minor age must clear the wrongly-required consent
    state.

---

## Part IX — What still needs sign-off (honest open items)

- **[OPEN-LEGAL]** Under-13 verifiable parental consent for an LLM-backed product (III.4) — the
  sharpest edge; confirm the VPC method (platform vs vendor) with counsel before a paid launch.
- **[OPEN-LEGAL]** The per-market consent-age table (III.1) — confirm the jurisdiction list and the
  16-default for unknown regions.
- **[OPEN-LEGAL]** US App-Store-Accountability obligations (Utah/Texas/Louisiana, mid-litigation in
  2026) before any US launch.
- **[DECISION-DEFERRED]** VPC vendor selection (k-ID vs SuperAwesome/KWS vs other).
- **[SEQUENCING]** Exact timing of platform Age-Signals integration — launch-viable in NO/EU on
  self-declared + guardian-consent without it; add it for US readiness.
- **[NEEDS-RATIFICATION]** **Store-payer ↔ `payer_person_id` mapping under Family Sharing.** The model
  records a `payer_person_id` (≥18); the *store* charges whoever owns the Apple/Google account (under
  Family Sharing, the family organiser, who may not be the same human). How the IAP identity is bound to
  `payer_person_id`, and what happens when they differ, is undrawn — see Journey J13.
- **[NEEDS-RATIFICATION]** **Birthday-crossing autonomy upgrade.** When a ward crosses 13 or their
  market's consent age, does the guardianship edge / consent requirement **auto-expire**, or does it
  require an explicit teen-takeover step? Part V states the *ceiling* per band but not the *transition
  event* — see Journey J11.
- **[NEEDS-RATIFICATION]** **Unified multi-role surface for the family operator.** One adult is commonly
  `{admin}` + guardian×N + payer simultaneously. Whether the UI presents one fused "parent" experience
  (today's `ParentHomeScreen` + study/family mode) or distinct role surfaces is a product call the
  capability matrix deliberately leaves open — see Part XII crosswalk and Journey J-Family-Operator.

---

## Part X — Personas & context of use  *(fills PRD §2 persona gap)* — [DERIVED]

The capability matrix (Part IV) says *what* each role may do; it does not say *who* these humans are or
*where* they use the app. A developer building screens needs the context. Five personas; every screen
should name which it serves.

| Persona | Who / age band | Device & context | Primary goal | Identity shape | Load-bearing constraint |
|---|---|---|---|---|---|
| **Solo adult learner** | 18+, self-directed | Own phone, private | Learn a subject for themselves | org-of-one, `{student}`, self-pay | Zero family/consent overhead must ever appear. |
| **Independent teen** | 13–17, own login | Own phone, private | Learn independently; a parent *may* pay | own org or invited; `{student}`; self-consent per market | Above consent age they are the data subject — a paying parent gets **no** visibility without their opt-in (Part V). |
| **Parent-managed child** | 11–12 (managed) | Shared family tablet *or* own device set up by guardian | Learn under a guardian who set them up | guardian's org, `{student}`, managed login, guardianship edge | Guardian-created only (III.2); core learning gated until VPC consent lands (III.4). |
| **Family operator** | The adult guardian/payer | Own phone; switches between own learning and the family | Set up & oversee children, pay, optionally learn too | `{admin}` + guardian×N + payer; often `{student}` too | One human wearing 3–4 hats — see the unified-surface open item (Part IX) and crosswalk (Part XII). |
| **Mentor / tutor** | Any age (11+) | Own phone | Help one specific mentee | `{mentor}` + edge to that mentee only | Edge-scoped: must **never** see the whole org/family (the archived D2 leak). Near-term lightweight; B2B deferred (Part VI). |

> **The dominant journey is none of the above-as-identity — it is *a person learning*.** Identity/consent/
> billing is the minimal overlay around that core loop. Every journey below exists to get a person *into*
> the learning loop and keep them there; none of it is the product, all of it is the gate.

---

## Part XI — End-to-end user journeys + failure modes  *(fills PRD §6 — the journeys nobody wrote)*

Part III.6 ratified the sign-up *rules*; this part makes them (and the seven archived lifecycle flows)
**walk-able**, each with the **Failure Modes table** the repo's UX-resilience rules require (every
feature spec must answer: *State · Trigger · User sees · Recovery* — no Recovery cell may be empty).
All journeys are **[DERIVED]** from the ratified model unless a step is tagged **[NEEDS-RATIFICATION]**.

### J1 — Self-serve onboarding (13+: adult & independent teen)  *(extends III.5)*
Sign in (any enabled method) → declare birth year → platform Age-Signal reconcile (stricter wins) →
band branch → org-of-one + `{student}` membership auto-created → land in the learning loop. Adult:
straight through. Teen 13–15 in a 16-market: drops into the **holding state** (J3) until guardian
consent lands; teen in a 13-market or 16+: straight through, self-consent recorded.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Age-Signal "unknown" | Most of EU/NO today | Nothing — falls back to self-declared | Proceeds on self-declared band; no dead-end |
| Self-declared < 13 on self-serve | A child lies down to 11–12, or truthfully enters 12 | "EduAgent needs a grown-up to set this up" | Route to **J2 guardian-creation** ("ask a grown-up"); never a hard reject |
| Self-declared vs platform conflict | Device says 15, user typed 19 | Treated as the **younger** (15) band | Can request platform re-check; stricter always wins |
| Birth year mis-entered | Typo at the gate | — | **Editable** later (today a wrong birthday can never be corrected — a known live dead-end this fixes) |

### J2 — Guardian creates an 11–12 ward (the III.2 keystone)  *(closes the load-bearing new flow)*
From the family operator's org: "Add a child" → name + birth year → **VPC consent step** (platform
parental approval where live, else VPC vendor — III.4) → on success: ward Person + `{student}`
membership + **guardianship edge** + `consent_states` record created → ward is usable (managed login by
default; own login if guardian opts in and ward is 13+).

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| VPC vendor / platform down | Consent provider unavailable | "We couldn't verify consent right now" | Ward saved in **consent-pending**; learning gated; retry later — not lost |
| Guardian abandons mid-setup | App closed before consent completes | Half-created ward in pending state | Resume from family screen; pending ward clearly flagged |
| Guardian is <18 | An adult-only role attempted by a minor | Blocked with reason | Cannot create a ward; guardian role is adult-only (Part IV) |
| Duplicate child | Guardian adds a ward who already exists elsewhere | — | Invite/attach path (III.6 Path B) — **never** a duplicate Person |

### J3 — Consent holding-state → granted → unlock
The minor's "ask a grown-up" wait screen (browse-only preview, no LLM) + the guardian's completion side.
Auto-polls; unlocks the learning loop the moment a valid consent record lands on the edge.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Consent email/notification never arrives | Spam, wrong address | "Still waiting…" + Resend + **Change recipient** | Resend (capped 3) / change address (capped 3) |
| Long wait | Guardian not present | Browse-subjects + sample preview (not a blank wall) | Manual "Check again" + 15s auto-refresh |
| Consent granted | Guardian approves | Immediate unlock to learning | — |

### J4 — Managed → credentialed graduation  *(the Part II promise, today absent in code)*
A managed ward (or the guardian on their behalf) claims an own login. **Same `person_id`**, all history
intact (invariant 12). Above consent age, the graduated teen becomes their own data subject.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Login collides with an existing account | Teen already had their own EduAgent login | — | Attach to existing Person (no duplicate); **merge of two pre-existing Persons stays out of scope** (D5) |
| Graduation across the consent age | Ward graduates at 13/16 | Becomes self-consenting; guardian visibility converts to opt-in (J12) | Ties into J11 birthday-crossing |
| Guardian initiates without ward present | Managed 11–12 | Guardian completes; ward keeps managed login until 13 | No data moves; identity unchanged |

### J5 — Invitation: mentor-for-mentee claim  *(III.6 Path B.3, made walk-able)*
Mentee (or their guardian, below consent age) generates a single-use, expiring, edge-scoped link →
mentor claims it → mentor joins with `{mentor}` + an edge **to that one mentee** only.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Link expired / reused | Stale or shared link | "This invite is no longer valid" | Request a fresh link; reuse **cannot** escalate scope |
| Mentor is a minor | Any-age mentor (Part IV) | Allowed; edge still granted by mentee/guardian | No unilateral access |
| Mentor tries to see siblings | Edge-scoped enforcement | Only the one mentee's data is visible | By design — the D2 leak fix |

### J6 — Invitation: co-admin / co-guardian (second parent)  *(III.6 Path B.2)*
Existing admin invites another adult → joins with `{admin}` (+ a guardianship edge per ward where
applicable). **[NEEDS-RATIFICATION]:** co-guardian consent precedence when two guardians disagree
(the matrix has a single Guardian column).

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Invitee is <18 | Co-guardian/admin role is adult-bound for guardian; admin is age-agnostic | Admin OK; guardian edge blocked if <18 | Can be `{admin}` without guardian edges |
| Two guardians, conflicting consent | One withdraws, one restores | **[NEEDS-RATIFICATION]** precedence rule | Define before build (default: most-restrictive wins) |

### J7 — Self-service consent revoke + restore  *(retires the live broken promise)*
Guardian withdraws from the child-management screen → LLM processing for that ward **stops** → 7-day
grace → restore is available throughout. The UI promise and the system behaviour must match (invariant 13).

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Withdraw | Guardian taps withdraw | Confirm → ward enters withdrawn/grace; learning blocked | **Restore** within grace |
| Grace expires | 7 days, no restore | Ward data scheduled for deletion | Per data-retention policy; export offered first (J9) |
| Withdrawn ward opens app | — | "Access paused — ask your grown-up," not a crash | Switch profile / sign out; restore by guardian |

### J8 — Leave org / remove member, data preserved  *(+ the managed-minor paradox)*
A membership is revoked (self or by admin); edges detach; the **Person and learning history survive**
(invariants 14–15). **The hard case [NEEDS-RATIFICATION]:** a *managed* 11–12 ward has **no login** to
retain their own data — so guardian/org departure must not orphan or delete them. Today `family_links`
ON DELETE CASCADE would delete the ward; the clean-cut model must break that cascade.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Adult/teen leaves org | Self-initiated | Membership gone; own data retained | Re-join later via invite; data intact |
| Guardian removes a managed ward | Admin action | Confirm with consequence stated | Ward Person retained, claimable via graduation (J4) — **not** deleted |
| Guardian deletes own account | Last admin leaves | **[NEEDS-RATIFICATION]** ward custody | Ward must be re-homable, never silently destroyed |

### J9 — Per-person data export
A Person (or guardian below consent age) exports **their own** data, not the whole org's (closes
archived consent-3). Available to every band, including a managed ward via their guardian.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Non-owner child requests export | Today blocked (live gap) | Export available for own data | Guardian can export on a managed ward's behalf |
| Export during withdrawal grace | J7 in progress | Export offered before deletion | Ensures GDPR data-portability before erasure |

### J10 — Admin / ownership transfer
`admin` is transferable and may be held by more than one Person (Part I.4). Transfer = grant `{admin}`
to another member and (optionally) drop your own — no data moves, the org is unchanged.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Sole admin wants out | Only one admin | Must grant `{admin}` before leaving | Org never left admin-less |
| Payer ≠ admin after transfer | New admin isn't the payer | Allowed — payer is a separate field | Billing follows `payer_person_id`, not admin |

### J11 — Birthday-crossing autonomy upgrade  *(role/edge lifecycle — [NEEDS-RATIFICATION])*
A ward crosses 13 (or their market's consent age, or 16/18). Part V defines the *ceiling* per band; the
*transition* is undrawn. Open call: does the guardianship edge/consent **auto-expire**, or require an
explicit teen-takeover? Recommended default below; PM to ratify.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Ward turns own-market consent age | Birthday | **Recommend:** prompt teen to take over self-consent; guardian visibility → opt-in (J12) | Until taken over, status quo holds (no sudden lockout) |
| Ward turns 18 | Birthday | Becomes Payer-eligible; guardian overlay drops | Own org/payer if they leave the family |

### J12 — Teen → payer visibility opt-in  *(Part V's promise made walk-able)*
Above consent age the teen is the data subject; a paying parent sees **nothing** unless the teen opts
in. Prompt the teen to optionally share progress with the payer; revocable any time.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Parent pays, teen hasn't shared | Default | Parent sees billing only, no learning data | Teen may grant; "the wallet does not buy oversight" |
| Teen revokes share | Teen action | Parent visibility ends immediately | Re-grantable; teen controls it |

### J13 — Billing / payer reconciliation  *(RevenueCat ↔ `payer_person_id` — [NEEDS-RATIFICATION])*
Payment is IAP via RevenueCat, keyed to the store account; the model records `payer_person_id` (≥18).
Under Apple Family Sharing the store charges the family **organiser**, who may differ from the recorded
payer. The binding (and the mismatch handling) is undrawn. Payment never appears in a minor's UI; a
minor's paywall offers only "ask a grown-up to subscribe" (today's `ChildPaywall` "notify parent").

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Store payer ≠ `payer_person_id` | Family Sharing organiser pays | **[NEEDS-RATIFICATION]** which identity governs quota/consent | Define mapping before build |
| Minor hits paywall | Quota/expiry on a managed ward | "Ask a grown-up to subscribe" (no purchase UI) | Notify-parent (24h cooldown) |
| Silent payment failure | Card declined, webhook lag | **Must escalate** (metric/Inngest, not console.warn) per repo billing rules | Owner notified; not a silent dead-end |

### J14 — Adult Payer attaches to an independent teen's paid plan (13–17)  *(resolves the no-eligible-payer gap)*
An independent teen (own org-of-one, self-consenting) wants Plus but cannot self-pay (<18, invariant 5).
They request an adult to cover it → the adult accepts as **Payer only** on the teen's org — no `{admin}`,
no guardian edge, no visibility (Part V). The adult must be ≥18. **Two shapes:** (a) teen keeps their own
org and the adult attaches as `payer_person_id` (billing-only); (b) teen instead joins the adult's org as
a member, so billing/quota follow that **home org** (§8, shared pool) — the ordinary family case.
Visibility stays the teen's opt-in (J12) in both. The free tier is the default if no payer attaches.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Teen taps a paid plan | <18, no eligible payer | "Ask an adult to cover this plan" — **no purchase UI in the minor's hands** | Sends a payer request (mirrors today's `ChildPaywall` notify-parent, 24h cooldown) |
| No adult attaches | Request ignored / declined | Stays on **free tier** — full learning, capped quota | Never a hard block; re-request later |
| Adult accepts | Adult ≥18 confirms + completes IAP | Adult becomes `payer_person_id`; billing-only, **no learning visibility** | Teen may separately opt-in to share progress (J12) |
| Store charges a different adult | Family Sharing organiser ≠ intended payer | Reconcile store identity → `payer_person_id` | Ties to J13 **[NEEDS-RATIFICATION]** |

### J-Family-Operator — the fused multi-role surface  *(the common case — [NEEDS-RATIFICATION])*
One adult = `{admin}` + guardian×N + (often) `{student}` + payer. They toggle between **their own
learning** and **the family they operate** (today: study/family `mode` + `ParentHomeScreen`). Whether
this stays one fused surface or splits into role tabs is the open product call in Part IX.

---

## Part XII — Role-vocabulary crosswalk  *(new model ↔ what exists in code)* — [DERIVED]

A clean cut still has to land in a codebase that already speaks a **different** role vocabulary. Two
vocabularies now coexist and a developer needs the map or they will build a third. **The new model is
the source of truth; `resolveNavigationContract` and the gating sites in `docs/audience-matrix.md` must
be re-pointed at it.**

| New-model concept (this doc) | Today's code vocabulary | Where it lives today | Crosswalk note |
|---|---|---|---|
| **`{student}` / Self (own learning surface)** | `learner` tab shape | `resolveTabShape`, `STUDY_TABS` (`navigation-contract.ts`) | A solo adult, an independent teen, and a child-as-learner all render the `learner` shape. |
| **`{admin}` + guardian×N (family operator)** | `guardian` tab shape + `mode='family'` | `resolveTabShape`, `FAMILY_TABS`/`LEGACY_GUARDIAN_TABS`, `ParentHomeScreen` | The old `guardian` shape ≈ "has `{admin}` and ≥1 guardianship edge." V0 5-tab must not regress (hard constraint). |
| **The dissolved `owner`** | `isOwner` boolean (one flag) | `profiles.isOwner`, `assertNotProxyMode`, ~13 `isOwner` gate sites (audience-matrix F5) | **Splits three ways:** org-management → `{admin}`; billing rows → **Payer**; act-for-a-child → **guardianship edge**. Each current `isOwner` gate must be re-pointed at the *correct one* of the three, not blanket-mapped. |
| **Guardian "act-for" a managed ward** | proxy mode / `isParentProxy` / `X-Proxy-Mode` | `useParentProxy`, `proxy-guard.ts` (currently unreachable from UI) | Proxy mode is the natural mechanism for guardian act-for below consent age — decide whether clean-cut wires it live or retires it. |
| **Consent gate on the edge** | `consentStatus` + `consentMiddleware` | `middleware/consent.ts`, `consent_states` | Keep the central-middleware pattern; move enforcement key from profile to the **guardianship edge** (III.3). |
| **`mentor` (edge-scoped)** | `membershipRoleEnum` `'mentor'` (backfilled, **unwired**) | `memberships` table, migration 0106 | Enum exists but **no route reads it** and `memberships`/`organizations` aren't exported from `schema/index.ts`. Clean cut wires it for the first time. |
| **Per-jurisdiction consent age** | flat `age <= 16` | `services/consent.ts` | Replace the single threshold with `resolveConsentRequirement` + per-market table (III.1). |
| **`payer_person_id` (≥18)** | implicit account holder | `subscriptions.account_id`, RevenueCat customer | No explicit payer today; J13 makes it explicit and reconciles it to the store identity. |

**Two-vocabulary risk:** until the crosswalk is executed, `resolveNavigationContract` (new) and
`resolveTabShape`/`isOwner` (old) describe the same humans in incompatible terms. The clean cut should
land `resolveNavigationContract` **consuming the new role set**, with the audience-matrix F-sites as the
migration checklist — not leave both alive.

---

## Sources (legal / platform grounding for Part III)

- US minors' contracts voidable; majority 18 — https://rvcc.pressbooks.pub/businesslaw131interactive/chapter/8-2-minors-or-infants/
- Norway majority 18 + guardian consent for minor financial obligations — https://www.international-guardianship.com/pdf/GBC/GBC_Norway.pdf
- EU: majority 18, minors need guardian consent to contract; German pocket-money clause — https://www.evz.de/en/shopping-internet/internet-fraud/subscription-traps/contracts-with-minors.html
- GDPR Art. 8 digital-consent age 13–16 by member state — https://gdpr-info.eu/art-8-gdpr/
- GDPR vs COPPA (under-13) — https://iapp.org/news/a/gdpr-matchup-the-childrens-online-privacy-protection-act
- Apple Family Sharing (organizer 18+, Ask-to-Buy under-18) — https://www.apple.com/legal/internet-services/itunes/us/terms.html
- Apple Declared Age Range API — https://developer.apple.com/documentation/declaredagerange/
- Google Play Age Signals API (Family Link supervision, parental approval) — https://developer.android.com/google/play/age-signals/overview
- Utah App Store Accountability Act — https://www.stoel.com/insights/publications/utahs-app-store-accountability-act-goes-into-effect
- Texas app age-verification law (May 2026) — https://www.texastribune.org/2026/05/28/texas-apple-google-app-store-age-verification/
