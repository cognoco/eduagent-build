# Reconstructed PRD — Identity / Organization / Membership (DRAFT for gap-check)

**Status:** RECONSTRUCTION, not ratified. **Date:** 2026-05-31
**Purpose:** Lift the *product intent* out of three implementation-first plans + a gap audit
into an explicit, functional PRD, so we can judge whether it actually describes what we want to
build — or whether intent was assumed rather than decided.

**Sources (all implementation/audit artifacts, not product specs):**
- `docs/plans/2026-05-31-identity-org-membership-redesign.md` (master program plan)
- `docs/plans/2026-05-31-identity-t1-data-model.md` (T1, implemented)
- `docs/plans/2026-05-31-identity-t2-auth.md` (T2, draft)
- `docs/audits/2026-05-31-logical-gap-audit.md` (36-gap audit — the acceptance-criteria source)

**Provenance legend** (the point of this document):
- **[STATED]** — explicit in the sources as product intent or a rule.
- **[IMPLIED]** — forced by an implementation/schema choice, but never stated as product intent.
- **[GAP]** — a complete PRD needs this; the sources are silent or only gesture at it.
- **[CONFLICT]** — contradicts a decision reached in this review session, or is internally inconsistent.

---

## 0. Meta-finding (read first)

Two things are simultaneously true about the existing plans:

1. **The structural/engineering model is unusually well-specified.** Entities, role sets,
   the 7 lifecycle flows, decisions D1–D6, migration mechanics, adversarial-review hardening —
   all present and coherent at the *how* level.
2. **The forward product intent is largely absent.** There is no product vision, no user
   personas, no end-to-end user journeys, no role-capability matrix, no success criteria, and
   no functional consent model for the new world. What intent exists is **[IMPLIED]** by
   implementation choices or **reverse-derived from a gap audit** ("close these 36 gaps"). The
   plan answers "what tables and middleware" thoroughly and "what product, for whom, and why"
   barely at all.

That asymmetry *is* the drift: a competent solution was built for a problem statement that was
never written down. This document makes the implied problem statement explicit so it can be
confirmed or corrected.

**One transition decision is an outright [CONFLICT]** (see §10): the plans chose an
incremental, dual-model, flag-gated, backfilled migration; this review session reasoned a
pre-launch **clean cut**. The plans even cite pre-launch/zero-users as the rationale — then
adopt the cautious live-migration playbook anyway. T1 has already been *implemented* on the
incremental path (migration 0106 + backfill), so there is sunk work pulling one way.

---

## 1. Product vision & "why"  — **[GAP]** (inferred below)

The plans' stated goal is technical: *"replace the single fused `accounts` row … with
person / organization / membership."* That is a refactor objective, not a product vision.

**[INFERRED] product intent** (needs ratification): *Every person — including a child — owns
their own identity and learning history permanently; people are grouped into flexible
organizations (a family, a tutor's roster) that hold the subscription; a person's relationship
to an org is a set of roles that can change over time; and a learner can graduate from a
parent-managed identity to their own login without losing anything.*

Open: is that actually the product? Who is it *for* now? The original PRD framed an
**11–15 parent-managed family-tutoring** product; these plans quietly broaden to **tutors,
co-parents, and independent credentialed teens** — a materially different audience that is
nowhere stated as a product decision. **[GAP]**

---

## 2. Actors  — **[STATED]** at definition level; personas **[GAP]**

- **Person** — one per human (children included). Owns identity + learning data permanently.
  Is either **Managed** (no login; used on a shared device) or **Credentialed** (own login).
- **Roles a person can hold in an org:** **Owner**, **Mentor**, **Student** (a set — one person
  can be all three).
- **Adult vs Minor** — a flag that gates eligibility (a minor cannot be Owner or Mentor) and
  drives consent + age-appropriate content. **[STATED]**

**[GAP]:** there are no personas — who these people are, their goals, their context of use
(shared family tablet vs. a teen's own phone vs. a paid tutor managing many students). The old
PRD's "shared device, parent sets up" context is neither restated nor retired.

---

## 3. Core entities (functional)  — **[STATED]**

- **Person** — identity + own learning data. Managed or Credentialed; can hold multiple
  logins (emails/OAuth) under one identity.
- **Organization** — always exists (minimum one per person — an "org of one"); the grouping;
  "a family" = an org with more than one member; holds the subscription.
- **Membership** — a (person ↔ org) link carrying a non-empty **set of roles**. Membership =
  visibility (a mentor sees members of their org). Roles are editable, not write-once.
- **Subscription** — attaches to the organization. *"Who pays" ≠ "who you are."*
- **Credential** — managed (no login) vs credentialed (own login); a setup choice defaulted by
  age + device, **never locked**.
- **Consent** — GDPR/COPPA lifecycle for a minor (see §7 — functionally underspecified for the
  new world).

> **[IMPLIED, important]** In the *implementation*, "Person" is not a real entity — T1 decided
> **`profiles` IS the person** (`profile.id` stays the scoping key; "managed vs credentialed"
> is just a nullable `clerk_user_id` on `profiles`). This pragmatically defers a true
> person/profile split — which is consistent with the separately-stated intent to defer that
> split — but it means the conceptual model and the physical model diverge, and nobody has
> confirmed the conceptual "Person" is the thing we actually want long-term.

---

## 4. Roles & capabilities  — fragmentary; a full matrix is **[GAP]**

What the sources actually pin down:
- **Student** — read **and write** their *own* learning data (sessions/subjects/messages),
  regardless of ownership. This is decision **D6** / gap `learn-1` — "a child on a parent's
  account must be able to study." **[STATED]**
- **Mentor** — **org-wide** in v1 (sees and can write to mentees' learning data — gap
  `learn-2`); per-person mentor scoping is explicitly deferred. **[STATED]**
- **Owner** — administers the org: billing, add/remove members, invite, ownership transfer.
  **[IMPLIED]** from "owner-only routes" + the lifecycle flows; never enumerated.
- **Minor** — cannot be Owner or Mentor. **[STATED]**

**[GAP] (significant):** there is no capability matrix (role × action → allowed?). The proxy
guard, owner-only routes, and mentor visibility are described as *code sites to audit* (89
call sites across 23 files), not as a *product rule* a reviewer could sign off. "What exactly
may a Mentor do to a mentee?" and "what is Owner-only?" are not answered functionally.

---

## 5. Product rules / invariants  — mostly **[STATED]**

- Every person belongs to **≥1 org** (org auto-created at signup). **[STATED, D1]**
- Subscription lives on the **org**. **[STATED]**
- Mentor is **org-wide** in v1. **[STATED, D2]**
- Roles are **editable** (not write-once like today's `isOwner`). **[STATED]**
- Credential default: under ~13 → managed; 13+ → own-login; own device leans credentialed;
  **always overridable**. **[STATED, D4]** — but the age threshold is presented as a default
  choice, not a *legal* determination. **[GAP/question]**
- Age is **orthogonal** to credential type and to role. **[STATED]**
- One person, **multiple logins** (emails/OAuth). **[STATED]**
- Managed → Credentialed **graduation preserves all history** (same identity). **[STATED]**
- **Merging two pre-existing persons is out of scope.** **[STATED, D5]**
- **[IMPLIED, unconfirmed] One Owner per org.** The T1 backfill *assumes* exactly one
  `is_owner` profile per account and raises if violated — but "exactly one owner per org" is
  never stated as a *product* rule, and your brain-dump said "only one user can be owner at a
  time, but it's possible to switch" — which the plans do not address. **[GAP/question]**

---

## 6. Lifecycle journeys (the 7 flows)  — intent **[STATED]**, UX **[GAP]**

The redesign declares itself incomplete without these seven flows; each is named and mapped to
gap IDs, but none has a described user journey (screens, who initiates, what they see):

1. **Cross-account invite / claim** — link a pre-existing person (teen, tutor, co-parent) to an
   org; must attach to an existing person, never create a duplicate. *(closes family-2/3,
   consent-2, identity-5, billing-2)*
2. **Managed → Credentialed graduation** — a managed person claims their own login, keeps
   history. *(family-4, identity-3)*
3. **Leave-org / remove-member, data preserved** — a membership is revoked (self or by owner)
   without data loss. *(auth-1, consent-4, family-5, identity-1/6)*
4. **Per-person data export** — export *my* data, not the whole org's. *(consent-3)*
5. **Self-service consent revoke** for the email-only consenting parent (GDPR Art. 7(3)).
   *(consent-1)*
6. **Ownership transfer / owner-deletion with member preservation.** *(consent-7, identity-4)*
7. **Per-member progress generation** decoupled from the owner's notification prefs.
   *(progress-1)*

**[GAP] — the journeys nobody wrote:** initial **signup/onboarding** per role (what does a
brand-new owner see? a credentialed teen's first run? an invited tutor's acceptance flow?), and
the *acceptance* side of invites. The flows describe state transitions, not user experiences.

---

## 7. Consent / COPPA  — **[GAP], and it is the legally load-bearing one**

The plans keep consent *functionally as-is* (parent-email consent for a managed minor) and add
flow #5 (self-service revoke). But the new world introduces a **credentialed minor** (a child
with their own login) — and the sources never answer:
- Who consents for a **credentialed** minor, and how is that minor's *own-login* account
  age-gated at signup?
- Does **graduation** (managed → credentialed) re-trigger or carry consent?
- **Cross-org consent** — when a teen is invited into a *second* org (a tutor's roster), whose
  consent governs, and for what data?
- How does "a minor cannot be Owner/Mentor" interact with a minor who signs up *first* on their
  own device (no adult present)?

This is exactly the area I flagged as the sharp edge of the whole re-platform, and the plans
treat it as inherited rather than redesigned. **It needs a dedicated functional consent spec
and probably a legal sanity-check** before T-phases that touch it land.

---

## 8. Billing (functional)  — high level **[STATED]**, multi-org **[GAP]**

- Subscription on the org; a multi-member org **shares one quota pool**; a solo org-of-one gets
  a **free** subscription. **[STATED]**
- Seat add/remove; family-cancellation cascade reworked for the always-org model. **[STATED]**
- **[GAP]:** when a person belongs to **two orgs** (e.g. their own family + a tutor's org),
  *whose* subscription/quota governs their usage? "Subscription on the org" doesn't resolve the
  multi-membership case, which the invite flow explicitly creates.

---

## 9. Explicitly out of scope (deferred)  — **[STATED]**

- Merging two pre-existing separate persons (D5).
- Per-person mentor scoping (v1 = org-wide only).
- Multi-org **active-org selection** (a person may hold ≥2 memberships, but the "active" org is
  always the home org for now).
- A true physical **person/profile split** (profiles IS the person for now).

---

## 10. Transition / migration stance  — **[CONFLICT]**

**The plans chose:** build the new model *additively alongside* the old, behind a
`MODE_IDENTITY_V1_ENABLED` dev flag (V0 byte-for-byte when off), with a **backfill** that
derives orgs/memberships from existing data (reusing `account.id` as `org.id`), across **7
dependency-ordered phases**, dropping legacy tables only at **T7**. T1 is already implemented
this way (migration 0106 + backfill + a large body of ledger-drift firefighting).

**This review session reasoned:** pre-launch, zero users → a **clean cut** — treat the identity
tables as disposable, define the target, build it clean, re-seed dev/staging, no dual model, no
flag, no backfill, no compatibility shims.

**Why it matters (not just style):** the incremental path is the *source of most of the
plans' complexity* — the dev flag, the dual-resolution middleware branches, the `ensureIdentityV1`
/ `resolveActiveMembershipRoles` **self-heal shims**, the `ACCOUNT_PROVISION_EXEMPT_PATHS`
hack, the "byte-for-byte flag-off" guarantee, and the backfill all exist *only because* the
model is being grown in parallel rather than replaced. A clean cut deletes that machinery.
**The plans adopted the heavy path without a stated product/strategy rationale** — and notably
reached the *opposite* conclusion from two independent reviewers who weighed the same
pre-launch fact. This is the clearest single example of "intent assumed, not decided."

(Caveat: T1 is already built on the incremental path. The cut-vs-continue call now has to weigh
that sunk work — but T1 is additive and reversible by its own rollback section, so the sunk
cost is modest relative to T3–T7 still ahead.)

---

## 11. Open product questions (the agenda for the real intent-lock)

A complete PRD must answer these; the plans assumed or skipped each:

1. **Target user** — is this still 11–15 parent-managed family tutoring, or has it broadened to
   tutors / co-parents / independent teens? (The plans imply the latter without saying so.)
2. **Role-capability matrix** — Owner / Mentor / Student × actions, stated as product rules.
3. **Consent under own-logins** — the §7 questions; legally load-bearing.
4. **One owner per org?** — rule or not; how ownership is shared/transferred.
5. **Multi-org membership** — whose subscription, whose consent, whose visibility when a person
   is in two orgs.
6. **Credential default thresholds** — is ~13 a product choice or a legal requirement?
7. **Success criteria** — what "done" means at the *product* level, beyond "36 gaps closed."
8. **Transition strategy** — clean cut vs. the incremental path already begun in T1 (§10).

---

## 12. How to use this document

Gap-check it against what you (PM) actually intend: confirm the **[STATED]** items, correct or
ratify the **[INFERRED]** ones, fill the **[GAP]**s (especially §7 consent and §4 capabilities),
and resolve the **[CONFLICT]** in §10. The corrected version becomes the *forward* product spec
that the re-platform should be driven from — replacing "close 36 audit gaps" as the de-facto
source of intent. Until §7 and §10 are resolved, no further identity T-phase should land.
