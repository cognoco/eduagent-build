# MMT-ADR-0010 — The family-join / account-consolidation primitive

**Status:** Proposed — provisionally approved 2026-08-01 and operative for delivery pending final ratification; pre-live rewrite of the decision accepted 2026-06-03 · **Scope:** Identity Foundation — v1 join-my-family + shared invite/consolidation primitive · **Deciders:** Jørn (provisional approval); Zuzka (final ratification pending via OPQ-160) · **Realizes:** PRD Part 10 §H Ripples 1 & 3 (E12/E13, D1 provisioning) · **Builds on:** MMT-ADR-0007 (Person ≠ Login), MMT-ADR-0001 (Clerk = auth only), MMT-ADR-0008 (global Guardianship, derived consent operations)

> **Placement.** Global L2 from birth; lockstep canon partners are `docs/canon/identity/prd.md` and `docs/canon/identity/domain-model.md` §6.

> **Provisional-approval rider (2026-08-01).** Jørn provisionally approved this
> rewrite and directed delivery to proceed as though the decision were fully
> approved. Final ratification is assigned to Zuzka in **OPQ-160**. That queue
> item is a ratification debt, not a live delivery blocker. When it resolves,
> replace this rider with final Accepted provenance or reconcile any required
> changes before release.

## Context

Two v1 journeys share one identity move: a managed child can gain their own Login against the same Person, and an existing-account learner can join a family without losing history. Both attach a self-provisioned Login/Person to a family graph and reassign the home Organization without orphaning the Person.

Login possession and consent capability are independent. A credentialed 13–16 learner may be below the digital-consent age resolved from exact age and current residence policy. The original decision covered only the consent-capable learner and deferred the guardian-required variant, leaving the launch family chain incomplete. The missing question is how an adult acquires authority without allowing a learner, invitation, email token, admin role, or Payer role to mint Guardianship.

## Decision

### 1. Shared invite/provisioning primitive

The learner completes their own Clerk sign-up. Existing JIT provisioning creates the authenticated account; the consolidation service attaches that Login to the existing `person_id` through the named `migration-pending` state. No parent-created Clerk credential or password handoff is introduced.

Home-Organization reassignment is never-orphan: add the destination family Membership before decommissioning the empty Organization-of-one. The Person and learning history remain on the same `person_id`. v1 still consolidates to a single home Organization rather than implementing multi-Organization federation.

### 2. Consent-capable credentialed learner

When current age × residence policy resolves the learner as self-consenting, the learner may accept the adult-first invitation and the consolidation can proceed. The adult becomes the destination Organization's admin and/or Payer as applicable. Neither role creates Guardianship. Supportership is optional and must be granted separately by the learner; it is never implied by family Membership or payment.

### 3. Consent-gated credentialed learner aged 13–16

When policy requires guardian consent, the join enters a holding state and requires a **distinct authenticated-adult authority ceremony**:

1. Authenticate the adult and resolve the adult Person server-side.
2. Verify the claimed legal relationship or authority at the policy-required assurance/VPC level, bound to the learner and destination Organization.
3. Re-read residence and effective policy and obtain the adult's acceptance of every required destination-Organization purpose.
4. In one transaction under the canonical charge-Person consent lock, create or confirm the global guardian→charge edge and write fresh grants for every required Organization/purpose, with policy, method, evidence, and time provenance.
5. Terminalize and back-link corresponding consent requests and invalidate stale email tokens.

Any missing, stale, withdrawn, denied, expired, partial, wrong-adult, moved-residence, changed-policy, replayed, or cross-Organization input fails closed. An existing global Guardianship edge can be confirmed idempotently, but grants never carry between Organizations. The edge and new grants commit together or not at all.

The learner may request or accept a join but cannot nominate or mint their own consent authority. An ordinary email consent response may approve or withdraw an Organization- and purpose-scoped consent grant within the existing consent flow, but it does not prove the adult Person or legal relationship, cannot create Guardianship, and cannot satisfy or resume this family-join authority ceremony. Invitation, adulthood, family Membership, admin, and Payer status also confer no Guardianship.

Guardianship remains distinct from Supportership. Completing the adult ceremony does not create learning-data visibility.

### 4. Evidence and compatibility boundary

The atomic operation records a named, versioned `GuardianAttachEvidenceV1` envelope sufficient to bind the adult, charge, destination Organization, verified qualification, verifier assertion reference, assurance method and level, residence/policy selection, complete purpose set, request correlation, idempotency identity, and relevant validity/completion times. Raw identity documents, biometrics, and provider secrets are prohibited. If existing storage cannot retain this contract, the schema must be extended rather than weakening or scattering the evidence.

The existing ordinary email-consent path remains compatible: its approvals and withdrawals continue to affect only their scoped consent grants. Historical email-only grants are never upgraded to Guardianship, and historical grants retain their recorded jurisdiction and policy context.

### 5. Billing behavior retained

A joining learner with an active store subscription joins immediately once all identity and consent gates pass, receives the family quota seat, and keeps paying until they self-cancel. The UI provides an explicit double-charge warning and follow-up nudge; server-side refund remains unavailable under store-delegated billing.

## Consequences

- A Person and their learning history survive credential attachment and family consolidation unchanged.
- Credentialed does not mean self-consenting; policy resolution determines the authority path.
- The guardian-required path adds an adult authentication/verifier boundary, holding and retry states, a canonical-lock transaction, structured audit evidence, and fail-closed drift/replay behavior.
- Existing Guardianship can be reused only as a global relationship fact; each destination Organization requires fresh purpose grants.
- No join path creates Supportership or visibility automatically.
- Child-initiated delivery remains outside v1, although the authority model permits a learner request to wait for an independently authenticated adult.

## Alternatives considered

1. **Treat a credentialed 13+ learner as self-consenting.** Rejected: Login and consent authority are orthogonal, and thresholds vary by residence policy.
2. **Let the learner nominate the guardian.** Rejected: it lets the minor mint the authority that is meant to constrain them.
3. **Upgrade an invitation or ordinary email approval to Guardianship.** Rejected: a scoped consent response does not prove the adult Person or legal relationship. The existing email flow may still approve or withdraw its scoped grant, but cannot create an edge or resume the family join.
4. **Infer Guardianship from admin, Payer, adulthood, or family Membership.** Rejected: organizational, billing, age, and legal-authority facts are independent.
5. **Reuse consent from another Organization.** Rejected: Guardianship is global, but grants are Organization- and purpose-scoped.
6. **Create the edge first and grants later.** Rejected: partial authority state is unsafe and makes failure/retry ambiguous.
7. **Parent creates the learner credential.** Rejected: adds a Clerk admin-write and password-handoff surface and conflicts with self-takeover.
8. **Implement multi-Organization federation for v1.** Rejected: consolidation to one home Organization is the bounded v1 primitive.

## Links

- Implementation contract: `docs/specs/2026-07-30-13-16-family-join-guardian-consent-ceremony.md` (historical and delivery context; not decision authority).
