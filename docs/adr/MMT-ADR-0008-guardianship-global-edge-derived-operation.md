# MMT-ADR-0008 — Guardianship is a global edge; operational capabilities are derived, not stored

**Status:** Accepted · 2026-06-03 · **Scope:** Identity Foundation — Guardianship representation & multi-org consent/visibility governance (pre-launch clean cut) · **Deciders:** Architect (jjoerg) + Claude · **Builds on:** MMT-ADR-0007 (Guardianship is an edge) · **Resolves:** ontology §6 deferral **D1** (`identity-ontology.md`); PRD Part 10 **E9** and the consent/visibility half of **E7**

> **Placement.** Global L2 from birth; lockstep canon partner is the incubating ontology (§2.2, inv 23, §6) + `domain-model.md` §4 + the `CONTEXT.md` Guardianship entry.

## Context

MMT-ADR-0007 establishes Guardianship as a first-class **dyadic edge** (a guardian → charge relationship), and the ontology (inv 23) establishes that the edge grants **separable capabilities** — *consent-authority*, *operate* (act-for), *manage* (settings/billing scope), *view* — rather than one bundled flag. What it left open (ontology §6, item **D1**, flagged for joint architect exploration) is **where those capabilities live**: is the edge global (a person-pair fact) or org-scoped (tied to a Membership in one tenant)?

Two facts frame the choice:

- **Consent-authority must be global.** It is a legal fact about two humans ("Anna is Ben's parent and consented"), true independent of any account or org. The forcing case is **separated parents** (ontology §6 / domain-model-options §10): one shared child, two co-parents, each with their own family org. If the whole edge were org-scoped, that child would need two guardianship representations → two Persons with two divergent learning histories — the pedagogically-broken, fused-model regression the clean cut forbids. A global consent edge keeps the child **one Person** with two guardian edges.
- **The only operational divergence that actually exists at v1 is the credentialed tween.** A tween with their own device/login **operates their own profile** (the guardian must *not* act-for them) yet the guardian still holds **consent-authority**. Every other operational capability co-occurs with the relationship. Multi-org / separated-parents is explicitly out of v1 scope (PRD E8 — reachability only).

The risk to avoid: modeling four separately-stored capability grants when only one bit diverges at v1 would re-create the "capabilities scattered across multiple stores" disease this foundation exists to cure (Simplicity First; the `isOwner`-everywhere drift).

## Decision

**One global Guardianship edge stores consent-authority and the consent record only. The operational capabilities (`operate`/`manage`/`view`) are not stored — they are derived at query time.**

- The **Guardianship edge is global** (a person-pair relationship), carrying: the consent-authority facet, the consent record, the relationship basis/type, temporal validity, and the jurisdiction context. It is append-only / auditable and dissolvable independently of any Membership.
- **Operational reach is derived**, never separately persisted, from:
  `operate/manage/view(guardian G, charge C) ⇐ (G —guardian-of→ C) ∧ (G and C are co-members of the same Organization) ∧ (C has no Login)` — i.e. a **credentialed charge suppresses the guardian's `operate`** (the tween case falls out of the already-tracked login-presence attribute, not a stored flag). `view`/`manage` follow the same shared-org gating; `consent-authority` is the global facet and is *not* org-gated.
- **The authority check lives in exactly one named function** — the clean successor to today's buggy `getFamilyOwnerProfileId` (drift-map CC-07 / §7A). It is the single resolver of "may this guardian act on / see this charge here?"; no call site re-derives it ad hoc.

**This also rules the consent/visibility half of multi-org governance (E7):** consent is evaluated over the **set** of guardian-of edges that bear on a charge (`consentSatisfied = f({guardian-of edges}, the jurisdiction's one-of/all-of rule)`, inv 11), and cross-org visibility is the same derivation (`guardian-link ∧ shared org`). The multi-org **billing/quota** axis is separate and is settled by the single-home-org posture (MMT-ADR-0010 / inv 18).

## Consequences

- **One storage site for the relationship** — it cannot drift, because there is no second per-org copy of capabilities to fall out of sync.
- **The separated-parents / one-Person future stays reachable for free.** Because operation = `guardian-link ∧ shared-org`, a second household "just works" if it is ever built; nothing to retrofit. The clean cut's job here is only to *not foreclose* it (PRD E8), which this satisfies.
- **The credentialed-tween divergence needs no new machinery** — it is `charge has a Login ⇒ no guardian operate`, computed from an attribute MMT-ADR-0007 already tracks.
- **A query, not a column, answers "can this guardian act here?"** — so that query is load-bearing and centralized; Phase E must implement it as one resolver with break-tests (including the F1-BT-a "no self-fallback" regression against the live `getFamilyOwnerProfileId` bug).
- **If genuine per-household, per-capability customization ever becomes a requirement** (none exists today), this model upgrades **additively** — start persisting per-org overrides on the Membership context — without a rewrite. We defer that storage until a requirement names it.
- Physical schema (the edge table, the derivation query, indexes) is **Phase E**; this ADR fixes the domain semantics only.

## Alternatives considered

1. **Global consent + operational capabilities stored per-household on the Membership** (the ontology's prior lean). Rejected for v1 — two storage sites that can drift, and machinery v1 never exercises (a charge lives in exactly one household at v1); it re-opens a second home for capabilities, the disease in miniature. Kept as the *additive* upgrade path if a real per-household requirement appears.
2. **Wholly org-scoped guardianship.** Rejected — forecloses the one-Person separated-parents model (forces two child representations) and contradicts the legal reality that consent-authority is a person-pair fact.
3. **One bundled capability flag on the edge.** Rejected — cannot express the credentialed-tween (operate ✗ while consent-authority ✓); inv 23 requires separability.
4. **Defer placement entirely to Phase E.** Rejected here only because the architect chose to settle the semantics now (the item was flagged for joint exploration); the *physical* shape still defers to E.
5. **A generic tuple/Zanzibar store for the relationship.** Rejected — over-engineered for v1 (ontology §3.5: no policy engine); the global-edge + derived-query shape is forward-compatible to it if arbitrary-depth relationship chains ever appear.
