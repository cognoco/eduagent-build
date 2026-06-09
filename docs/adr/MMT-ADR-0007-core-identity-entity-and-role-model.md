# MMT-ADR-0007 — The core identity entity & role model (Person ≠ Login; roles vs capacities)

**Status:** Accepted · 2026-06-03 · **reconstructed 2026-06-03** · **Scope:** Identity Foundation — the structural entity/role model (pre-launch clean cut) · **Deciders:** Architect (jjoerg) + Claude · **Builds on:** MMT-ADR-0001 (own the graph) · **Ratifies (origin):** `identity-ontology.md` §R Grill #1 conflicts C1/C2/C4/C5/C6/C8/C9 (2026-06-01)

> **Reconstructed note.** The decisions recorded here were ratified in `docs/canon/identity/ontology.md` (Grill #1, 2026-06-01) **before** the decisions layer (MMT-ADR-0000) existed. This ADR is written after the fact to give the most foundational identity decision a first-class home in `docs/adr/`, per the architect's Phase-D call to capture the entity/role model now rather than defer it to the Stream-2 backfill. The *why* is recovered from the ontology's ratification trail; no rationale is invented. The living vocabulary remains the ontology + `CONTEXT.md`; this ADR is the dated *why* beneath them.

> **Placement.** Global L2 from birth (MMT-ADR-0000 §I.4), in `docs/adr/`. Its lockstep canon partner is the graduated identity canon in `docs/canon/identity/` (`ontology.md` §1/§1.5/§2 + `domain-model.md`; graduated Phase J0, 2026-06-08) plus the `CONTEXT.md` identity glossary — not `docs/canon/architecture.md`, which does not yet hold the identity model (it folds in at the clean cut).

## Context

Today's identity model fuses three distinct things into one `accounts` row joined to `profiles` with an `isOwner` boolean: the **human**, the **login**, and the **tenant**. That fusion is the root cause of the drift the foundation exists to correct — four parallel role encodings (`isOwner` bool, `profileQuotaUsage.role`, `AgeGateRole`, an inert `membershipRoleEnum`), an `isOwner`-everywhere authorization surface, and a proxy-guard that mis-handles anyone outside the 2-party owner/child world (drift-map RC-01, RC-02, PPA-R02, RC-07).

The product serves **managed children who have no login of their own** — a human who must still own permanent learning data, belong to a family group, and carry a revocable consent record. MMT-ADR-0001 already settled that we own the whole tenancy graph (Clerk = authentication only) precisely because no hosted IdP can represent such a credential-less member. That decision forces the question this ADR answers: **once the human is decoupled from the login, what are the entities, what are the roles, and what is not a role?**

The standards split on the central noun. Clerk / B2B-SaaS call the principal "User" (login-coupled); but **NIST RBAC defines User as "a human being"** and **ABAC names the principal "Subject" (the attribute-carrier)**. The domain needs the RBAC-human / ABAC-Subject — a human independent of authentication — which "User" cannot name without re-fusing what we are splitting.

## Decision

**The human, the login, and the tenant are three separate entities. Learning data is scoped to the human. Org-management and learning-participation are membership *roles*; supervisory ties are *capacities on edges*, never roles.**

**Entities (conceptual — physical schema is Phase E):**

- **Person** — one human; the permanent subject of learning data, consent, and identity, **whether or not they can log in**. The scoping key for every learning record. (RBAC-human / ABAC-Subject. Replaces the human sense of `profiles`; `Profile` is retired as the human's name. "Learner" is a *context hat*, not the entity.)
- **Login** — the authentication binding between a Person and their Clerk User. **Optional, 0..1 per Person**; its *absence* is what "managed" means, its presence is "credentialed". Multiple sign-in methods live inside the one Clerk User via account-linking, not as separate Logins. (`Credential` was rejected — in security it means an auth *factor*, a collision we won't carry.)
- **Organization** — the **thin** grouping + billing container. Always exists (an *org-of-one* is auto-created at signup). Holds the Subscription. Does **no** access or consent work itself; **never owns a Person or their data**. "Family" / "tutor roster" / "school" are org **data**, not separate entities.
- **Subscription** — entitlement + billing state, attached to the Organization (Stripe customer = org). Carries the **Payer**.
- **Membership** — the M:N link Person ↔ Organization, carrying a **role set**. Grants **existence-visibility** only ("you can see who is in this org"); never learning-data access.

**Roles, capacities, and designations:**

- **Membership roles = `{admin, learner}`** only, any combination, mostly any age. **`admin`** = org management (members / invites / settings / billing-admin); age-agnostic; ≥1 per org; transferable; >1 allowed; **no** learning-data access without an edge. **`learner`** = the marker that *activates the learning surface*; capability-light (self-ownership is intrinsic to Person); not auto-mandatory. The **first member of an Organization is an `admin`.**
- **`supporter` and `guardian` are capacities, not roles.** A **role** is a Person's self-contained standing in an org; a **capacity** is the position a Person occupies at one end of a *dyadic edge* (meaningless without the named other Person). Supportership and Guardianship are therefore **edges** whose ends are capacities (`supporter`/`supportee`, `guardian`/`charge`). One Person holds one role-set and any number of capacities. *(The human supervisory capacity is `supporter` / the `Supportership` edge; the name `mentor` now denotes the AI tutor — 2026-06-08 rename.)*
- **Payer** is a **designation on the Subscription** (`payer_person_id`), not a role and not a visibility grant; **access-inert** (MMT-ADR-0002).
- The fused **`Owner` concept is dissolved** → split into **`admin`** (management), **Payer** (billing), and **Guardianship** (act-for-a-child). `isOwner` was never guardianship — that conflation was a bug.

**Load-bearing decoupling:** **Person ≠ Login.** Learning data is scoped to `person_id`, never to org / Login / account id. This is what lets one tenancy model hold both real account-holders and credential-less children, and what makes every lifecycle transition a *rebind to the same Person* rather than a data migration.

## Consequences

- The four parallel role encodings collapse to **one**: `Membership.role` set + a Role→capability mapping kept as data. `isOwner` ceases to be an authorization source of truth (it becomes, at most, a derived convenience).
- A credential-less Person (the managed child) is a first-class member: a Person with a Membership (and, when consent-gated, a Guardianship) but **no Login**.
- Supervisory access is **edge-derived and edge-scoped** — a supporter sees only their named supportee, never the org roster — which dissolves the org-wide-supporter leak (RC-02) and removes the need for a 2-valued owner flag to express co-owners or external tutors.
- **Rename surface is large** (`profiles` → person, every `profileId`, `CONTEXT.md`, audience-matrix). This is accepted: the clean cut re-seeds dev/staging with no backfill, so the rename is in-scope by definition and is the one-time price of the decoupling that motivates the whole project. Physical execution is Phase E.
- The deliberate divergences from the standard model are exactly three — **Person** (credential-less), **Guardianship**, **Consent** — and only these (everything else adopts the standard name). That short list is why this cannot be bought off the shelf; it is also the list this model must keep defensible.

## Alternatives considered

1. **Keep `Profile` as the human.** Rejected — `Profile` is fused to "a login's sub-identity"; it cannot name a credential-less human without redefining itself into the exact fusion being broken.
2. **Adopt Clerk's "User" as the principal.** Rejected — re-couples human to login; the managed child has no login. (Subsumed by MMT-ADR-0001.)
3. **Keep `Owner` as a role.** Rejected — `Owner` is the fused fossil behind RC-01/PPA-R02; it conflates management, billing, and child-guardianship, which must be independently expressible.
4. **Model `supporter`/`guardian` as membership roles.** Rejected — a supervisory tie is one-to-one to a *named* Person and (for guardianship) per-pair revocable; an org-wide role cannot express "guardian *of this specific child*". They are structurally edges.
5. **One bundled tenancy entity (the status quo `accounts`).** Rejected — it is the drift itself; fusing human + login + tenant is what produced every finding the foundation corrects.
