# Identity Foundation — Domain-Model Options Brief

**Date:** 2026-06-01 · **Status:** DRAFT — discovery/options brief, **does not ratify anything.**
**Owner:** Claude (you ratify) · **Feeds:** Phase D (`domain-model.md` + ADRs); informs Phase B intent-lock.

> **⚠ Vocabulary superseded — folded into the ontology 2026-06-01 (Fold #1).** This is a **dated discovery
> artifact**; its decisions now live, in ratified terms, in `identity-ontology.md` (see §R "Fold #1"). The
> body below uses **pre-ratification names** — `Credential` → **Login**, `proxied` → **managed**, `ward` →
> **charge** — **rewritten inline 2026-06-06 per the charge-terminology sweep** (banner kept for traceability).
> For current vocabulary read the ontology + `CONTEXT.md`, not this file.

> **What this is.** The "architecture/discovery spike" the strategy notes (§3.2) call for: the
> highest-leverage research *before* the target model is drawn. It lays out the reference architecture,
> a candidate entity set, the cohort model we've reasoned to, and the **build-vs-buy fork** for the
> identity provider — as **options with decision drivers**, not a locked design.
>
> **What this is NOT** (guardrail-bound — see `README.md`):
> - It does **not** lock the domain model. That is Phase D, and Phase D depends on Phase B product
>   intent being ratified first (guardrail 1, guardrail 5). This brief *informs* both.
> - It does **not** design physical schema, tables, columns, or migrations (that is Phase E).
> - It does **not** inherit the archived `0106` org/membership table shapes as design input
>   (guardrail 2). Where `0106` appears, it is **evidence** (we already rebuilt an IdP's primitives),
>   never a template.
>
> **Research status:** the IdP comparison (§6) is now **complete** — folded in from deep-research run
> `wf_5264b7ff-69e` (2026-06-01; 109 agents, 26 sources, 24/25 claims confirmed). Citations inline; the
> three open items the spike did *not* settle are listed in §6 and §8.

---

## 1. The question this brief answers

> Identity, group membership, role-based permissions, and subscription billing are problems thousands
> of applications have solved. Is there a canonical reference architecture for it, is it flexible
> enough to absorb **our** variants (families, tutor rosters, solo learners, managed-vs-credentialed
> minors, multi-org membership) as **data** rather than hardcoded cases — and should we **own** that
> model or **lean on our identity provider (Clerk)** for it?

The answer to the first half is a confident **yes** (§2–§5). The second half is a real fork (§6) whose
decisive driver — the **proxied-child cohort** — this brief makes explicit.

---

## 2. The reference architecture

The canonical pattern is **B2B-SaaS multi-tenancy + RBAC**. It is best understood as **two orthogonal
axes**; conflating them is exactly what produced today's drift.

**Axis A — the entity model (who exists, who belongs to what):**

```
Person/Identity ──< Membership >── Organization/Tenant
                       │                   │
                    role set          Subscription
                       │
                  Role → Permission   (data, not code)
```

**Axis B — where authorization is *decided*** (a spectrum; pick how far to sit):

- **RBAC** — roles → permissions. Sufficient for most apps, almost certainly us at v1.
- **ABAC** — decisions depend on *attributes* (age, jurisdiction). Needed for consent-by-jurisdiction.
- **ReBAC** — decisions depend on *relationships* ("X is guardian-of Y", "mentor-in org Z"). Google's
  **Zanzibar** is the reference; **OpenFGA** / **SpiceDB** are the engines; **Cerbos / Oso / OPA** are
  lighter in-app options.

The two axes are **independent**: you can own Axis A in Neon *and* externalize Axis B to a policy
engine, or buy Axis A from an IdP *and* do plain in-app RBAC. (§6 is an Axis-A question; §7 is Axis-B.)

**Why this pattern cures our disease.** Its flexibility comes from *not encoding variants as schema*:
"family vs. tutor roster" is org **data**; "managed vs. credentialed" is a person **attribute**;
multi-org is native to the M:N membership join. That directly dissolves the "four parallel role
encodings" and "`isOwner` everywhere" findings (§5).

**Billing already fits:** Stripe's customer→subscription model assumes the *customer* (org) holds the
subscription — i.e. "subscription on the org."

---

## 3. Candidate entities (conceptual — not schema)

Described as domain concepts and their *responsibilities*, deliberately abstract. Physical shape is
Phase E.

| Entity | Responsibility | Notes |
|---|---|---|
| **Person** | One per human. The subject of data, consent, and learning — **whether or not they can log in.** | Decoupled from credential (see **Credential**). A proxied child is a Person with no Credential. Carries a time-versioned `residence_jurisdiction` (input to the consent computation — §8.3). |
| **Credential** | The means by which a Person authenticates (the IdP user / login). **Optional.** | 0..1 per Person. Its absence is what "proxied" *means*. This is the entity that maps to a Clerk User. |
| **Organization** | The tenant. Owns resources, holds the subscription. | "Family" and "tutor roster" are the same entity with different data. |
| **Membership** | The M:N link Person↔Organization, **carrying a role set.** | Multi-org falls out for free. A proxied child holds a Membership without holding a Credential. |
| **Role → Permission** | Capability mapping kept as **data**. | Replaces ad-hoc `isOwner` checks. The capability matrix (absent today — RC-07) lives here. |
| **Guardianship** | The relationship asserting an adult holds **consent authority / proxy rights** over a (typically credential-less or under-threshold) Person. | The "documents the guardianship the consent implies" relationship. ReBAC-shaped ("X guardian-of Y"); see §7. |
| **Subscription** | Entitlement + billing, **attached to the Organization.** | Maps to Stripe customer=org. |
| **Consent** | Per-Person record of consent state, withdrawable, **jurisdiction-aware as data.** | Genuinely domain-specific; the non-standard half. Mechanism deferred to the consent spike (Task 2). |

**The load-bearing decoupling:** **Person ≠ Credential.** Today the codebase fuses them (a profile is
assumed reachable only via an account owner's login). Splitting them is what lets one tenancy model
hold both real account-holders and proxied sub-profiles (§4).

---

## 4. The cohort model — one graph, two thresholds

Target users span primary-school age and up, so most users are minors. The old model fused two
*independent* facts — **legal consent status** and **authentication identity** — into a single
"managed minor = no login" concept. They come apart.

**Independent variables:**

- **Credential** — does this Person authenticate themselves? (has a Credential: yes/no)
- **Consent gate** — does processing require verifiable adult consent? (**age × jurisdiction → policy**)
- **Topology** — independent account-holder vs. member of someone's org.
- **Device possession** — *not a modelled axis.* It is merely the reason a parent opts a young child
  into a Credential; it collapses into the Credential axis as a parental/product **choice**.

**Two age thresholds → three minor bands (+ adults):**

1. **credential-eligibility floor** — below it, **proxied only** (no Credential).
2. **consent threshold** — above it, **no parental consent** required (jurisdiction-variable).
3. the **band between** — **credentialed *but* consent-gated.**

> The reconstructed intent already half-saw this: drift-map **CC-06** notes a *credential-eligibility
> age (~13)* distinct from the *consent age (≤16)* — two ages that were never built or reconciled.
> Because the consent threshold **varies by jurisdiction**, the band boundaries shift per user — which
> is precisely why consent must be a **computed attribute**, never a structural cohort baked into
> schema (honours the "express consent as data/config, never per-country branches" guardrail).

| Cohort | Credential | Consent gate | Topology |
|---|---|---|---|
| Adult owner | ✅ | — | owns org |
| Teen, above consent threshold | ✅ | ❌ | own org **or** family member |
| Tween, below threshold, has device | ✅ | ✅ | family member, **consent-gated** |
| Young child, managed (**proxied**) | ❌ | ✅ | **credential-less** sub-profile in family org |

**Design commitment (carried from the working session):**

- **ONE tenancy model, not two schemas.** There are two *product experiences* — the "SaaS" account
  (sign up, own your data, pay) and the "Netflix" account (one adult holds account + billing, others
  are managed sub-profiles) — but they are **two configurations of the same Person─Membership─Org
  graph**, distinguished by *values on the Credential axis + the Consent attribute*. Splitting them
  into two schemas/code-paths is **how the current drift happened** (four role encodings, `isOwner`
  everywhere, a proxy-guard that mis-handles anyone outside the 2-party owner/child world) and is
  explicitly rejected.
- **The proxied-child cohort is central and non-negotiable.** The model must natively hold a Person
  with a Membership and a Guardianship but **no Credential**. This is the single hardest constraint
  and the one that drives §6.

*(Transitions across the thresholds — proxied child gains a login; consent-gated minor crosses the
threshold; minor turns 18 and "graduates" — are the highest-risk part and are deferred to the next
working session. Flagged in §8.)*

---

## 5. How the candidate model dissolves the named drift

Maps the model above onto the concrete problems the drift map found (citations are drift-map IDs).

| Drift-map finding | How the model dissolves it |
|---|---|
| **T-1 / RC-01 — four parallel role encodings** (`isOwner` bool, `profileQuotaUsage.role`, `AgeGateRole`, inert `membershipRoleEnum`) | Collapse to **one**: Membership.role set + Role→Permission data. The other three become derived views or are retired. |
| **PPA-R02 — `isOwner` is the sole live authz discriminator** | Replaced by role/permission lookups + attribute checks. `isOwner` becomes (at most) a derived convenience, not the source of truth. |
| **RC-02 — proxy-guard mis-blocks Mentors / 2nd Owners** (`isOwner===false` ⇒ "child proxy") | Authorization keys off **role + guardianship relationship**, not a 2-valued owner flag, so a credentialed mentor or co-owner is expressible. |
| **RC-07 — no capability matrix anywhere** | The Role→Permission mapping **is** the matrix; it lives as data in one place. |
| **ORG-08 / multi-org gap** — person-in-two-orgs is schema-legal but unmodelled | Native to the M:N Membership join. (Governance — *whose* sub/quota/consent wins — is a Phase-B open question, §8.) |
| **CC-01/05 — consent stack has zero awareness of credentialed minor; `requestConsent` semantically wrong for a minor's own account** | Person≠Credential + Guardianship + Consent-as-attribute makes "consent for a credentialed minor" and "consent for a proxied child" the **same** mechanism with different data. |
| **Managed-vs-credentialed split** | Becomes the **Credential axis** (§4), not a new entity or table. |

---

## 6. The fork — build the tenancy model, or buy it from the IdP?

This is the spine. We **already use Clerk** as the IdP (JWT identity) and **Stripe** for billing — so
the fork is **not** "adopt Clerk"; it is **"use *more* of Clerk (its Organizations/memberships/roles)
vs. own that layer in Neon."**

**The decisive driver is the proxied child (§4).** Hosted IdP "organization membership" models are,
to the best of current knowledge, built on the assumption that **a member is an authenticated user
with their own credential.** A credential-less proxied child structurally cannot be a member in that
model. If that assumption holds across the providers (being verified in `wf_5264b7ff-69e`), then **no
hosted IdP can be the system of record for the family graph** — and the org/Guardianship/Membership
graph is **ours to own regardless of IdP.**

> **Irony worth stating:** migration `0106` already built `organizations` / `memberships` (with
> `roles[]`) / `clerk_user_id` / `subscriptions.organization_id` in Neon — backfilled, **read by
> nobody** (ORG-01/02/04/05). We have already paid to re-implement an IdP's org primitives and left
> them inert. That is *evidence about cost*, not a design to inherit (guardrail 2).

**The three options:**

| # | Option | Shape | Pro | Con |
|---|---|---|---|---|
| 1 | **Own it in Neon** | Clerk = pure auth (Credential only); Person/Org/Membership/Role/Guardianship all in Neon | Max control; can hold credential-less people; no per-org IdP fees; multi-org on our terms | We maintain the tenancy primitives, RBAC, seats forever |
| 2 | **Lean on Clerk Organizations** | Clerk owns Org/Membership/Roles natively | Least code for the credentialed cohort; member-mgmt UI, invites, org claims in JWT for free | **Cannot represent the proxied child** (no Credential ⇒ no member); consent/age ours anyway; another billing model if we adopt Clerk Billing over Stripe |
| 3 | **Hybrid** *(current hypothesis)* | Clerk owns **authentication for those who have a Credential**; Neon owns the **full Person/Org/Membership/Guardianship graph including credential-less people** | Honours the central proxied-child constraint; keeps Stripe; uses Clerk for what it's best at | Two stores to keep coherent (Clerk User ↔ Neon Person link); we still own tenancy |

**Hypothesis going into the research: "buy authentication, build tenancy" (Option 3).** Because the
proxied child is non-negotiable and lives outside any IdP's member model, the IdP question collapses
from *"who owns tenancy?"* to the narrower *"who is the best **authentication** layer for the
credentialed cohort, feeding our own graph?"* — on which **incumbency (already on Clerk), Expo SDK
maturity, and edge JWT verification (Hono on Cloudflare Workers)** matter more than whose Organizations
feature is richest. Held loosely pending the cited findings.

### Research verdict (deep-research run `wf_5264b7ff-69e`, 2026-06-01)

**The decisive finding landed exactly on the hinge — and it is settled (high confidence, corroborated
across all four providers' primary docs):**

> **No hosted IdP can represent a credential-less, proxied member.** Across Clerk, Auth0, WorkOS, and
> Stytch, *every organization member must be a fully authenticated user with their own credential.* A
> membership is created only on authentication (Clerk/Auth0 invitees must sign up; WorkOS's membership
> object has a mandatory `userId`; a Stytch Member *is* an authenticating identity). The
> pre-acceptance "invited" state is transient, never a permanent credential-less member.
> — clerk.com/docs/guides/organizations, auth0.com/docs/.../invite-members, workos.com/docs/reference/authkit/organization-membership, stytch.com/docs/b2b/guides/what-is-stytch-b2b-auth

**This eliminates Option 2 and collapses Options 1 and 3 into one answer.** Since the proxied child is
central (§4) and cannot live in *any* IdP's org model, the family/Membership/Guardianship graph is
**ours to own regardless of provider.** Putting the credentialed cohort in Clerk Organizations while
proxied children live in Neon would create **two membership representations** — the exact two-schema
split §4 rejects. Therefore the leading option is the clean one:

> **Keep Clerk for authentication (the Credential entity only); do NOT adopt Clerk Organizations; own
> the entire Person / Org / Membership / Guardianship graph in Neon.** "Buy authentication, build
> tenancy" — confirmed, with the sharpened rider that we buy *only* auth, not orgs.

**Provider comparison (mid-2026, cited):**

| Dimension | Clerk *(incumbent)* | Auth0 | WorkOS | Stytch |
|---|---|---|---|---|
| Credential-less member? | ❌ | ❌ | ❌ | ❌ — **uniform; this is the deciding constraint** |
| B2C/B2B orientation | B2C-strong; Orgs are an explicit **B2B** product (Slack/Linear/Vercel model) | general, enterprise-leaning | **enterprise-B2B** (per-connection SSO, SCIM) | B2C+B2B |
| Expo / RN SDK | **mature** Expo SDK (iOS/Android/web; native Sign-in-with-Apple/Google); native UI components still **beta** | SDK exists | **no native RN SDK** — browser-redirect only (`expo-auth-session`) | SDK exists |
| Hono on Cloudflare Workers | **best fit** — `@clerk/backend` built for V8 isolates, official `@hono/clerk-auth`, **networkless** PEM-key JWT verify via Web Crypto | works via JWKS | works | works |
| Auth pricing (B2C scale) | Free **50k MRU** (raised from 10k, Feb 2026); Pro $25/mo then $0.02/MRU | **not verified** here — known "pricey + enterprise-opaque" | AuthKit free to **1M MAU**, then $2,500/mo per 1M | Free **10k MAU**; per-MAU rate **not published** (opacity) |
| Orgs/B2B pricing | **$100/mo** Enhanced B2B add-on (100 MRO incl.; free plan caps 5 members/org) | not verified | per-connection SSO $125/conn (irrelevant to B2C) | **unlimited orgs free** |
| Native minors / VPC / guardian | ❌ | ❌ | ❌ | ❌ — **none offer it; COPPA VPC is the operator's duty** |

**Why a switch is not warranted on IdP grounds:**

1. The org-quality axis — the usual reason to switch IdP — is **moot**: no provider solves the
   proxied child, and we're owning tenancy in Neon either way. Clerk's $100/mo Organizations add-on
   and Stytch's "free unlimited orgs" both become irrelevant, because **we won't use either's orgs.**
2. **Stack fit favours the incumbent decisively:** Clerk is purpose-built for our exact backend
   (`@hono/clerk-auth` on Workers, networkless edge JWT verification) and has the most mature Expo SDK.
   WorkOS notably lacks a native RN SDK.
3. **Minors/consent is ours regardless:** no IdP provides verifiable parental consent, age gating, or
   guardian relationships; COPPA places the duty on the operator (2025 Final Rule, full compliance
   **2026-04-22**). This neutralizes any "switch for compliance features" argument.

**What the spike did NOT settle** (carried to §8): Auth0's current per-MAU price points (only its
membership model was verified); Stytch's actual 10k–100k per-MAU rate (sales-gated, third-party
figures only); **migration/lock-in cost of leaving Clerk later** (no claim survived verification); and
whether any **OSS/self-host** option (Ory/Keto, SuperTokens, Keycloak) can model credential-less
sub-profiles natively (no claim survived — axis unaddressed). None of these change the leading
recommendation, but the migration-cost and OSS questions matter if the *own-the-graph* commitment is
later stress-tested.

> *Currency caveat:* all pricing is sourced to live mid-2026 vendor pages but moves fast — re-verify
> before committing budget. The credential-less finding is structural (primary docs) and durable.

---

## 7. Authorization model — how far along Axis B for v1?

- **Start at RBAC** (Role→Permission as data) — it covers the bulk of the surface and is the direct
  cure for the `isOwner`-everywhere / no-matrix findings.
- **Layer ABAC attributes** for the genuinely attribute-driven decisions: **age × jurisdiction →
  consent policy**, and any age-gated capability. These must be attributes, not branches (§4).
- **Be ReBAC-*ready*, don't adopt an engine yet.** Our domain *is* a relationship graph (Guardianship,
  mentor-in-org) plus attribute rules, so model relationships as first-class (the **Guardianship**
  entity) — but a Zanzibar engine (OpenFGA/SpiceDB) is almost certainly not warranted at v1. The test
  for "do we need one" is when permission decisions require traversing arbitrary-depth relationship
  chains that a roles-array + direct-relationship check can't express. Revisit if/when that appears.

**Net for Phase D:** RBAC + a small set of ABAC attributes + first-class relationships, no external
policy engine at v1. Keep the *shape* relationship- and attribute-ready so consent-by-jurisdiction and
guardianship aren't retrofitted.

---

## 8. Transition mechanics

The steady-state matrix (§4) is the easy 80%. The model lives or dies on whether a Person can **move
between cells without losing identity, data, consent validity, or access** — and without a bespoke
code path per move. This section locks the *requirements* the transitions impose; mechanism is Phase E.

**Two trigger classes, and the distinction is load-bearing:**

- **Action-triggered** — a parent grants a login, adds a child, withdraws consent. Arrive as requests;
  handled in-band.
- **Time-triggered** — turning 13 / 16 / 18. Fire with **no user action**. A dormant account that
  never opens still legally transitions on a birthday. So transitions **cannot live only in request
  handlers** — they need a durable scheduler (Inngest scheduled function in this stack) that
  re-evaluates each Person on the relevant dates. This is precisely the drift map's
  "wired-but-untriggered" trap: if nothing *schedules* the re-evaluation, the transition silently
  never happens.

**The transition catalogue:**

| # | Transition | Trigger | What **rebinds** | Must **NOT** change | The trap |
|---|---|---|---|---|---|
| **T1** | Proxied → Credentialed (child gets a login) | action (parent opt-in) | a **Credential** attaches to the existing Person (`clerk_user_id` written for a non-owner) | the **Person** + all data, progress, consent records | creating a *new* user instead of late-binding → data orphaned, continuity broken |
| **T2** | Consent gate lifts (crosses consent threshold) | **time** | `consentRequired` re-evaluates to false | guardian's **billing control / visibility** don't auto-dissolve | silent: nothing fires → teen over-restricted, *or* processing runs on a now-ungrounded parental consent |
| **T3** | Minor → Adult at 18 ("graduation") | **time** | guardianship dissolves; Person becomes autonomous; possibly own org | **learning history travels with the Person** | promised in PRD, **not built** (PPA-R11); hits identity + consent + billing + portability + membership at once |
| **T4** | Jurisdiction change | action (moves country) | `consentRequired` re-evaluates under the **new** threshold — gate can **re-engage** with no birthday | — | a frozen `consented=true` is *wrong*; re-engaging may require **suspending processing** until fresh consent |
| **T5** | Guardianship mutation (added / removed / withdrawn / custody change) | action | the **Guardianship edge(s)**; consent authority may move | the charge Person persists | sole guardian withdraws consent for a below-threshold child → processing must **stop** (today's broken-revoke bug, CC-02/03/07) |
| **T6** | De-credential (revert to proxied) | action | — | — | probably **disallowed**; flag as product choice, don't build speculatively |

**Entry points** (not transitions, but set initial state and interact): parent-creates-child (proxied
from birth) vs. **minor-self-registers-first** (own credential, *no guardian yet* → who consents?).
The drift map §7A flagged self-registered-minor consent as broken; T1/T5 are the machinery that repairs
into it.

**The four invariants that make the transitions safe** (get these right and the moves stop being
special cases):

1. **Person is the immutable anchor; Credential / Consent / Membership / Guardianship are late-bound
   and mutable around it.** Every transition is "rebind something to the *same* Person," never "make a
   new person and migrate." This is *why* Person≠Credential is load-bearing — without it, T1 is a data
   migration, which is where loss happens.
2. **Consent is computed, never stamped.** `gate = required(age, jurisdiction) ∧ ¬satisfied(valid
   consent from the right authority)`, re-evaluated continuously. T2 and T4 then fall out with **zero
   special-case code** — the operational proof of "consent as data/config, no per-country branches."
3. **Keep separate the three things the old model fused:** **consent authority** ≠ **account/billing
   control** ≠ **data visibility**. T2 lifts consent-required without ending billing control; T3
   transfers billing without erasing shared history. Most transition bugs trace to conflating two of
   these three.
4. **Significant transitions are append-only + recovery-specified.** Consent/guardianship changes are
   legally material → audit trail, not overwrite. Per the repo's UX-resilience rule, each transition
   needs a **Failure Modes table** (Clerk user-create fails mid-T1; guardian unreachable when T4
   re-engages; payment fails at T3) — no dead-ends.

**What this demands of the Guardianship representation** (requirement only — the data-model treatment
is an open question, §9): T5 gives guardianship its own mutation lifecycle; T3 requires it be
**dissolvable independently of membership**; multi-guardian + guardian≠owner make it a relationship
between **two Persons**, not a property of one. So whatever representation Phase E picks must support a
**separate, mutable, auditable edge** (`Person —guardian-of→ Person`) — the ReBAC-shaped reading. This
brief locks the *requirement*, not the shape.

### 8.1 T3 deep dive — graduation (minor → adult at 18)

**Two flavours by pre-state:** *T3a* credentialed→adult (only authority/billing/membership shift);
*T3b* **proxied→adult** = **T1 + T3** — graduation *forces* a credential acquisition, because an
autonomous adult with no login is incoherent. If they never claim one → a named **dormant-adult** state
(data retained; no consent issue, they're their own subject now), not a bug.

**The core design split — automatic vs. offered:**
- **Automatic + immediate** (legally mandated): consent authority moves wholly to the Person; the
  `guardian-of` edge dissolves (audited); the proxy path is revoked (interacts with RC-02 — the guard
  must stop treating them as proxy-able).
- **Offered, not forced**: the org/billing migration. You can't unilaterally move someone's data to a
  new org, nor block a legally-required authority transfer on user input. So migration is a **prompt**
  resolved on next action — which creates an **interim state** ("turned 18, authority transferred, org
  choice pending") that must be explicitly valid (keeps access; family loses consent-based visibility;
  billing continues until chosen).

**Org fork:** stay in family org / leave to own "standalone Free account" (PRD) / ask. Lean **ask,
default to leave** (autonomy is the legal direction) — product+legal call (§9).

**Data portability is the hard core:** Person-anchor means `profileId` (and its data) never moves —
the saving grace. What moves is the **org association** + severing **shared/co-owned artifacts**.
Anywhere data is *org*-scoped rather than person-scoped, graduation = a re-parenting migration → a
**transactional, resumable Inngest step function**, never half-applied. GDPR Art. 20 (portability) is
a tailwind here, not just a burden.

### 8.2 T4 deep dive — jurisdiction change

**The scenario:** age 14, Country A threshold 13 (above → no gate) → moves to Country B threshold 16
(below → **gate re-engages**). Same age; policy moved under a static person. No birthday triggers it.

**Why it's uniquely hard:**
- **Detection:** billing country / IP geo / locale / storefront are all coarse, spoofable, or
  transient. Design fork: **declared** residence (attested, cleaner, gameable) vs. **inferred**
  (creepy, unreliable). Likely: declared at onboarding + re-prompt on a strong stable signal change,
  keyed off **residence, not current location** (holiday/VPN must not re-gate).
- **Re-engaging > lifting:** a person mid-use loses their processing basis. Suspend until fresh
  parental consent (hard "need a parent's permission to continue" stop) vs. grace period = a
  **legal-review** question, not eng.
- **Consent satisfaction is jurisdiction-relative, not global:** consent obtained under A's VPC
  standard may not *satisfy* B's, so a held record may not transfer across the move. `consentSatisfied`
  must be scoped to the jurisdiction/standard under which it was obtained.

**The proof it forces** — a stamped `consented=true` would leave a now-illegally-processed minor marked
"fine." Only correct shape:
```
consentRequired  = policy(age, residence_jurisdiction)                 // evaluated live
consentSatisfied = valid record from right authority, under that jurisdiction's standard
gate             = consentRequired ∧ ¬consentSatisfied
```

**Strategy connection:** under a **worst-case-default** rollout (strictest threshold everywhere) T4
**never re-engages a gate** — everyone is already gated at the strictest. T4 only bites once you
deliberately relax per-jurisdiction. So worst-case-first makes T4 a **non-event at launch** and a
problem you opt into later, on your schedule.

### 8.3 What T3 + T4 prove, and the modelling consequences

**T2, T3, and T4 are the same consent re-evaluation on different triggers** (age crosses a threshold /
age crosses 18 / jurisdiction changes the threshold) — not three features. If consent is computed,
they are one mechanism. The only *new* machinery T3 adds is the **graduation migration** (org
re-parent + billing detach + portability), which is identity/billing, not consent.

**Promoted modelling consequences (for Phase D/E):**
1. **`residence_jurisdiction` is a first-class, time-versioned attribute on Person** — an input to the
   consent computation that changes over time, with history for audit ("what policy was in force when
   we processed").
2. **The graduation migration is a transactional/resumable Inngest step-function requirement**, and the
   interim/limbo states (T3 pre-choice, T3b no-credential, T4 suspended-pending-consent) must each be
   **named valid states**, never implicit gaps.

---

## 9. Guardianship — representation options

First-class *in principle* is agreed (§3, §7); this section explores the **data-model treatment** the
transitions now give concrete requirements for. Leaning + options, **not a lock** — physical schema is
Phase E, and the hinge (D1) needs a product+legal ruling.

**Requirements (from §4 + §8):** R1 relationship between **two Persons** (not a property of one);
R2 many-to-many (multi-guardian; multi-charge); R3 own lifecycle (create/modify/dissolve — T3, T5);
R4 append-only auditable (GDPR 7(3); fixes CC-02/03/07); R5 **dissolvable independently of membership**
(T3: guardianship ends at 18, membership may persist) ⇒ **guardianship ≠ membership**.

**Clarifying frame — one relationship, *separable* capabilities.** Not "consent authority vs. proxy
rights — one relation or two," but **one `guardian-of` relationship that grants capabilities
independently:** *consent authority* (legal — give/withdraw consent), *proxy/operate* (act as the
charge), *manage* (settings/billing scope), *view*. Why separable: **grp 2 (credentialed tween) splits
them** — operates their own profile (no proxy) yet still needs parental *consent* (authority persists).
They usually co-occur but must be allowed to diverge; bundling into one flag is therefore rejected.

**D1 — global (person-pair) or org-scoped?** The capabilities split it:
- **consent authority is global** — a legal fact about two humans, independent of any account.
- **proxy/operate/manage are org-contextual** — about operating a profile inside a tenant.

Candidate resolution (hypothesis): **a global `Guardianship` edge carries the legal/consent facet; the
operational facets attach to the org context (Membership).** This also handles the grp-2 divergence for
free. **Hinge case: separated parents** (see §10) — the only framing found that keeps the child as one
Person is "global consent edge + org-scoped operation"; that case must get a product+legal ruling
before D1 locks.

**D2 — representation:**

| Option | Fit | Verdict |
|---|---|---|
| (a) Attribute on Membership | Fails R1, R5; weak R2/R3 | **Reject** — also close to inert `0106` nudge; guardrail 2 says don't inherit |
| (b) **Dedicated edge entity** `Guardianship(guardian, charge, capabilities, type, jurisdictionContext, validFrom/To, status)` | Satisfies R1–R5; ReBAC-shaped | **Leading** |
| (c) Generic tuple store (Zanzibar) | ReBAC-native, maximal | **Over-engineered for v1** (§7); (b) is forward-compatible to it |
| (d) Derive from consent records | Fragile — consent is an event log, guardianship a *standing* relation | **Reject** |

**Candidate synthesis (hypothesis):** a first-class **`Guardianship` edge** (b) — `guardian → charge`,
**separable capability grants**, a **`relationship_type`/basis** (parent / legal guardian / custodian —
governs what consent it can validly give; ties to Task-2 consent + legal), **temporal validity +
append-only event log** (R3/R4), and a **jurisdiction context** (which regime's standard the consent
met — the T4 jurisdiction-relative-consent point). Consent authority on the **global edge**;
operational facets in the **org context**. This edge is the **principled successor to `family_links`**
(PPA-R03) and the replacement for the buggy `getFamilyOwnerProfileId` authority resolution (CC-07) and
the RC-02 proxy-guard logic — both become "query the guardianship edge + capabilities," not
"`isOwner` + `family_links`."

**Open:** physical schema (Phase E); which `relationship_type`s exist and what each may consent to
(legal + Task-2); and the **separated-parents/multi-org ruling** that gates D1 (§10).

---

## 10. The separated-parents case  *(hinge scenario)*

**Setup:** two separated co-parents, both legal guardians of one child, each with their **own** family
org (not sharing; possibly hostile); the child uses the product across both households. It fires four
open questions at once — guardianship D1 (§9), multi-org governance (ORG-08, §11), consent (one or both
parents?), and data identity (one child or two?).

**The decision underneath: is the child ONE Person or TWO?**

| | **A — one Person, two orgs, two guardian edges** | **B — two Persons, one per org** |
|---|---|---|
| Data | unified learning history | two divergent histories |
| Pedagogy | continuous (one progress state across households) | **broken** — mis-leveled per household; defeats adaptive-learning core |
| Co-parent privacy | needs explicit handling (G3) | trivially isolated |
| Governance | hard (whose sub/quota/consent?) | none |
| Honesty | matches reality | a fiction ignoring the shared child |

B is simple but **pedagogically wrong** (the child gets two divergent brains); A is correct for the
product but carries the governance load. **Which one is a Phase-B product-intent call (§11), not a
model call.**

**The architectural output: don't *foreclose* A — even if v1 doesn't build it.** The product may
legitimately **scope shared-custody out of v1**; but the model chosen now either permits or forecloses
A later. The imperative: **keep the one-Person model reachable; defer the governance.** Payoff — the
model already landed keeps A reachable *for free*: Person≠Credential (§4) + a **global** guardianship
edge (§9) + multi-org Membership (ORG-08) express "one child, two guardian edges, two memberships"
without building governance. The only thing that **forecloses** A is regressing to a child-fused-into-
account shape (the old model, or D2-a). **So this case is the sharpest reason not to inherit `0106`/the
fused model — it retroactively validates the §4 and §9 leanings.**

**Governance sub-questions (deferred, named):**
- **G1 — whose subscription/quota?** One Person under two orgs; no clean answer without intent
  (primary-org / union / per-context). **The strongest single argument for scoping the governance out
  of v1.**
- **G2 — consent: one parent or both?** Jurisdiction-dependent (legal/Task-2). Conflict: P1 consents,
  P2 withdraws → withdrawal is protective so likely wins, but lets one hostile parent freeze the child.
- **G3 — co-parent privacy:** handled by the §9 split — shared child's **learning data** visible to
  both guardians (view capability); each parent's **org-private** data (billing, other members) stays
  private. Another point for global-edge / org-scoped-operation.
- **G4 — conflicting management writes** (settings): last-write-wins acceptable; low stakes; noted.

**What this adds to the model — consent over a *set* of authorities:**
```
consentSatisfied = f( {set of guardian-of edges}, jurisdiction's one-of / all-of rule )
```
Still inside the consent-is-computed machinery (§8.3), evaluated over the set of guardianship edges
rather than a single authority. **Promoted** — cheap, and it fixes the single-owner authority bug
(CC-07) at the root.

**Clean exit under the transitions:** at 18 (T3) both guardian edges dissolve; the now-adult inherits
their **unified** data (A) and picks their org — the two-org state collapses to one autonomous adult.
The model handles the exit cleanly — evidence the shape is right.

**Posture:** (1) "one Person vs two" + "shared-custody in/out of v1" is a **Phase-B** decision (§11);
(2) lock the imperative — *don't foreclose one-Person*, which the current model already satisfies;
(3) if v1 scopes governance out, say so explicitly and defer G1/G2; (4) consent-over-a-set is promoted
into the model now.

---

## 11. Open questions this brief hands to Phase B / D

- **Does the credential-eligibility floor make the proxied cohort a permanent product reality, or a
  default-with-opt-in?** ("managed by default, Credential on parental opt-in above some age"). This
  sizes Option-2 viability and is a **product** call (Phase B).
- **Multi-org governance** (ORG-08): when a Person is in two orgs, *whose* subscription, quota, consent,
  and visibility govern? Schema-native, semantics undecided. Concretized by the separated-parents case
  (§10).
- **Separated parents — one Person or two, and is shared-custody in scope for v1?** (§10) The
  **product-intent decision** the model must not foreclose. Recommended posture: keep the one-Person
  model reachable (already satisfied), scope the governance (G1/G2) out of v1 explicitly. **Product +
  legal.**
- **Guardianship data-model treatment** (agreed first-class *in principle*; shape open): options
  explored in **§9** (leaning: dedicated global edge + separable capabilities); the locked physical
  schema is Phase E, and the **D1 global-vs-org-scoped** ruling waits on the separated-parents case
  (§10). *(Owner flagged this explicitly for deeper joint exploration.)*
- **Transition mechanics — captured in §8**; the residual product/legal sub-questions: who is
  *notified* when T2 lifts the gate; does T3 default to standalone-org or stay-in-family (and who pays
  after); does T4 re-engagement **suspend** processing or merely re-prompt; is T6 (de-credential)
  allowed at all.
- **Consent mechanism** (Task 2 spike, separate): which provider/age-assurance approach realises the
  Consent entity. Out of scope here; this brief only commits to consent being *data/config*.
- **IdP items the research left open** (none block the §6 recommendation, but relevant if the
  own-the-graph commitment is stress-tested): Clerk **migration/lock-in** cost (password-hash / user
  portability — no verified claim); whether any **OSS/self-host** option (Ory+Keto, SuperTokens,
  Keycloak) can model a credential-less member natively; Auth0's current per-MAU pricing; Stytch's
  unpublished 10k–100k per-MAU rate.

---

## 12. Relationship to the roadmap

- Feeds **Phase D** (`domain-model.md`), and gives **Phase B** concrete shape to react to.
- Does **not** advance any gate; ratification still requires B (intent) then D (model lock).
- No Cosmo work items (Phase-F gate). No code (guardrail 5). Uncommitted by request.
