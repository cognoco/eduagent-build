# MMT-ADR-0001 — Own the identity/tenancy graph; Clerk for authentication only

**Status:** Accepted (Grill #1, 2026-06-01) · **Scope:** Identity Foundation re-platform (pre-launch clean cut)
**Deciders:** PM + Claude · **Conflict ID:** C7 (`identity-ontology.md` §R)

> **Placement note:** Phase C ruled the ADR naming standard (`MMT-ADR-NNNN`) in `MMT-ADR-0003`; this ADR was
> renamed accordingly. It still **lives in `_wip/identity-foundation/adr/`** — Phase C deferred the *physical*
> home of the decisions layer to follow-up **F-PLACEMENT** (the repo-wide `docs/` taxonomy for all layers).
> Naming is settled; placement is not.

## Context

The identity foundation is being clean-cut (pre-launch, zero real users). A root structural fork had
to be settled before any noun in the model could be named: **does a hosted Identity Provider (Clerk)
own the tenancy/membership graph, or do we own it ourselves and use Clerk only for authentication?**

The product serves **managed children (≈11–12) who have no login of their own** — a credential-less
person who must still be a first-class member of a family group, own permanent learning data, and
carry a revocable consent record. Deep research across Clerk, Auth0, WorkOS, and Stytch
(`domain-model-options.md` §6, 24/25 claims confirmed) established a structural fact:

> **No hosted IdP can represent a credential-less organization member.** Every IdP membership object
> requires the member to be a fully authenticated user with their own credential.

Two internal spikes had drifted into contradiction: `domain-model-options.md` §6 concluded
own-the-graph-in-Neon; `age-consent-spike.md` §F/G said "Clerk Orgs for access."

## Decision

**We own the entire Person / Organization / Membership / Guardianship graph in our own database (Neon).
Clerk provides authentication and the credential lifecycle only — it is never the system of record for
tenancy, membership, roles, or consent.**

Seam principle: *anything that must work for a person with no login (the managed child) cannot be
Clerk's; everything about proving who a logged-in user is should be Clerk's.*

- **Use Clerk to the maximum on the auth side:** OAuth (Apple/Google), email/password, passkeys, MFA,
  email verification, sessions + edge JWT verification, the Expo SDK, prebuilt sign-in UI, account
  linking (multiple login methods on one Clerk User), and the JWT as a cheap transport for a *resolved*
  decision (a few claims) — with the audit/system-of-record remaining ours.
- **Decline exactly one Clerk capability: Organizations-as-tenancy** (orgs / memberships / roles /
  org-invitations as Clerk objects). Clerk Billing was already declined (Stripe / RevenueCat).

## Consequences

- A `Person` may have **0 or 1** Credential (Clerk User). The managed child is `Person` with **no**
  Credential — the case that forced this decision.
- We maintain memberships / roles / invitations / seats ourselves. This is **not** a net cost: we'd own
  them for the managed cohort regardless, so adopting Clerk Orgs for the credentialed half only would
  buy a *second* membership representation (the exact two-schema split that caused today's drift).
- Our authorization is **edge-scoped + attribute-driven** (visibility per guardianship/mentorship edge;
  consent by age × jurisdiction), which Clerk's org-role RBAC could not express anyway.
- **Supersedes** the `age-consent-spike.md` §F/G "Clerk Orgs for access" line — to be reconciled when
  that spike is folded in.
- **B2B/schools future stays compatible:** teacher/admin authentication could later federate via Clerk
  enterprise SSO *without* making Clerk the roster system of record (students are minors, often
  credential-less, so the roster is ours either way).

## Alternatives considered

1. **Adopt Clerk Organizations (buy tenancy).** Rejected: cannot represent the credential-less child;
   would force two membership systems.
2. **Hybrid — Clerk Orgs for credentialed members, Neon for managed children.** Rejected: two
   membership representations for one concept; the drift trap.
3. **Own in Neon, Clerk = auth only.** **Chosen** — the credential-less child lives outside every IdP's
   model, so the graph is ours regardless; owning it once is the coherent choice.
