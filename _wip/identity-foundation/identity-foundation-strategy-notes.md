# Identity Foundation — Strategy Notes

**Date:** 2026-06-01 · **Context:** Discussion following the Phase-A drift map
(`_wip/identity-foundation/drift-map.md`) and its executive summary. Captures three strategic
threads — the standard data model, the PRD/consent sequencing question, and the recommended way
forward — plus concrete next steps.

---

## 1. Is there a standard data model for this?

A crisp version of the question being asked:

> *"Identity, group membership, role-based permissions, and subscription billing are problems
> thousands of applications have already solved. Is there an established reference architecture — a
> canonical set of entities and relationships — for modelling people, the organizations/groups they
> belong to, the roles that govern what they can do, and the subscriptions that gate access? And is
> that pattern inherently flexible enough to absorb our variants (families, tutor rosters, solo
> learners, managed vs. own-login minors, someone belonging to more than one group) as **data**,
> rather than forcing us to hardcode each case?"*

**The answer is an emphatic yes, and it's well-trodden.** The reconstructed PRD is already groping
toward the standard shape without naming it. The canonical model is the **B2B-SaaS multi-tenancy +
RBAC** pattern:

- **Person / Identity** — one per human (the thing that logs in, or doesn't).
- **Organization / Tenant** — the group that owns resources and holds the subscription. A "family"
  and a "tutor roster" are *the same entity with different data* — that's the whole point.
- **Membership** — the link between a person and an org, **carrying a set of roles**. Because it's a
  many-to-many join, "belongs to two orgs" falls out for free.
- **Role → Permission mapping** — kept as data, not as `if (isOwner)` checks scattered through the
  code (which is precisely today's drift).
- **Subscription** — attached to the org.

**Why this cures our specific disease:** the reason the standard model is flexible is that it
*doesn't encode variants as schema*. "Managed vs. credentialed" becomes an attribute on the person,
not a new table; "family vs. tutor" is just org data; multi-org is native. That directly dissolves
the "four parallel role encodings" and "isOwner boolean everywhere" problems the drift map found.

**Worth knowing for Phase D** (and a genuine build-vs-buy decision):

- **Authorization models** sit on a spectrum: **RBAC** (roles) → **ABAC** (attribute-based — e.g.
  decisions that depend on age/jurisdiction) → **ReBAC** (relationship-based — "X is parent-of Y",
  "mentor-in org Z"). Our domain is a relationship graph *plus* attribute rules (age, country), so
  the mature reference is Google's **Zanzibar** model, with off-the-shelf engines like **OpenFGA**
  (CNCF/Okta) or **SpiceDB**. We almost certainly don't need that machinery on day one, but we
  should pick a model that's *relationship- and attribute-ready* so consent-by-jurisdiction isn't
  hardcoded later.
- **You already have an identity provider with this built in: Clerk has Organizations, memberships,
  and roles.** The old `architecture.md` explicitly dismissed Clerk Organizations as "the wrong
  abstraction for family accounts." Since we're rebuilding anyway, **that dismissal deserves a fresh,
  deliberate look** — leaning on Clerk's org/membership primitives vs. owning them in our DB is a
  real fork. (Auth0 Organizations and WorkOS are the comparators if we ever reconsider the IdP.)
- **Billing already fits**: Stripe's customer→subscription model assumes the *customer* (org) holds
  the subscription — exactly "subscription on the org."

The honest caveat: the **org/membership/RBAC half is extremely standardized**; the **minor-consent
half is not** — that's genuinely domain-specific and is where the next question lives.

---

## 2. PRD approach: generic consent now, or deep-dive consent first?

**My recommendation: write the PRD now with consent specified as *capabilities and invariants*, NOT
mechanisms — and run a dedicated consent/compliance spike in parallel that feeds it.** Reasoning:

- If you try to *fully resolve* consent inside the PRD, you stall the entire product definition on
  the single hardest, most legally-dependent, most externally-volatile question. Tail wags dog.
- But you can't treat it as a total black box either, because consent shapes the core flows (signup,
  graduation, who-can-do-what). So you specify it at the level you *can* commit to:
  - *"Any minor below the applicable jurisdictional threshold must have verifiable adult consent
    before data processing begins."*
  - *"Consent must be withdrawable by the consenting adult as easily as it was granted."* (This alone
    would have caught today's broken-promise bug.)
  - *"Consent thresholds and rules must vary by jurisdiction **as configuration**, with no per-country
    code changes."*

  Those are real product requirements. What you *defer* to the spike is the *mechanism*: which
  provider, how verification works, the exact age tables.

**On worst-case vs. per-jurisdiction — my actual opinion:** design a **policy-table-driven model
that defaults to worst-case but can relax per jurisdiction as you gain trustworthy signals.**

- Pure worst-case (strictest rule everywhere — roughly your current "GDPR-everywhere") is simplest
  and lowest legal risk, but it gates users who don't legally need gating, which costs conversion.
- Per-jurisdiction is more correct and better UX, but needs reliable age+country signals and a rules
  engine.
- The synthesis: **build the *mechanism* as a `jurisdiction × age → policy` lookup, and ship it
  configured to worst-case.** You're safe at launch, and relaxing later is a config change, not a
  rebuild. That's the design that honours "don't hardcode."

**On third parties — including the Google Play example.** This is the highest-leverage idea, because
the real prize is *not owning a 50-jurisdiction legal rules engine forever.* Two layers to evaluate:

- **Specialist kids-consent providers** — these exist precisely to absorb this complexity: **k-ID**
  and **SuperAwesome / Kids Web Services (KWS, Epic Games)** are purpose-built for COPPA/GDPR-K age
  assurance and *verifiable parental consent as a service*, jurisdiction-aware and maintained by
  people whose whole business is keeping current with the law. **This is likely the single decision
  that most reduces our long-term burden** — it converts "maintain the rules engine" into "integrate
  a provider."
- **Platform age signals** — partially answers the Google Play question, with an important nuance:
  **the platforms are moving toward giving apps a parent-attested age band** (Apple announced a
  *Declared Age Range* API in 2025; Google Play has family/age-signal programs evolving under
  regulatory pressure). But **standard Google/Apple sign-in does NOT reliably hand you a child's age
  or "consented" status** via normal OAuth scopes, and a supervised (Family Link) child account
  doesn't expose a clean "this is a consented minor" claim to third-party apps. So: treat platform
  signals as a **helpful (and increasingly *mandatory*) input/optimization, not the system of
  record.**

**Important honesty flag:** the regulatory landscape and these providers'/platforms' exact 2025–2026
capabilities are **fast-moving and past my reliable knowledge** (my cutoff is January 2026; it's now
June). The shape and the names above are given with confidence, but the *specifics* — current
provider feature sets, the exact platform APIs, what each jurisdiction now requires — need
verification before any of it goes into a spec.

---

## 3. How to go forward (recommended approach)

The roadmap sequence still holds (A done → **B: product intent** → C: doc strategy → **D: domain
model** → E: data model → **F: ready-to-build gate**), but the drift map sharpens it in three ways:

1. **Run two tracks in parallel, not one.** The identity rebuild is gated on Phase B — but the drift
   map cleanly separated out work that is *not* identity-coupled and won't be thrown away. Start those
   now for momentum and value: the **do-now DeepSec security fixes**, the two **stop-gap consent
   patches** (the unfulfillable revoke promise / non-atomic deletion), and the genuinely independent
   gaps (`billing-3` silent payment failure, `onboard-2` language setting). Everything tangled with
   identity waits.

2. **Insert an architecture/discovery spike into Phase D** that answers exactly the Q1 and Q2
   questions above: build-vs-lean-on-Clerk for orgs, the authorization model choice, and the
   third-party consent evaluation. This is the highest-leverage research before any model is drawn.

3. **Keep the clean cut; sequence the T1 revert at F.** Nothing changes there.

The one strategic guardrail to hold above all: **don't over-engineer for hypothetical futures, but do
choose a model that expresses consent and access as data/config, never as hardcoded country-by-country
branches.** That single stance is what keeps the "worst-case vs. per-jurisdiction" decision
reversible.

---

## Concrete next step

Rather than asserting volatile facts from memory, run a **focused, cited research spike** on the
consent/age-assurance landscape:

- **(a)** the specialist providers (k-ID, KWS, Yoti, others) with what they actually cover and their
  integration model;
- **(b)** the current Apple/Google platform age-signal APIs and what they do/don't expose;
- **(c)** a worst-case-vs-jurisdictional recommendation grounded in current COPPA / GDPR-K / UK AADC /
  recent US state-law reality.

Output: a short decision brief that feeds the PRD's consent section and the legal review. (Best run via
the deep-research harness, which fetches and adversarially verifies sources rather than freewheeling.)

In parallel, the **PRD consent section can be drafted as capability/invariant placeholders** so the
rest of the PRD isn't blocked.

**Open choices to confirm:**

1. Kick off the research spike, draft the PRD-with-generic-consent, or both?
2. Capture the build-vs-buy / authorization-model / third-party-consent items as explicit Phase-D
   decisions in the ROADMAP so they don't get lost?
