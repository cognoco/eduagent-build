# MMT-ADR-0045 — Account detachment is child-claimable at 13; guardian management of a charge is a derived capability, not a stored grant

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Account-detachment entitlement, guardian management surfaces over a charge, proxy-mode posture · **Deciders:** pending Architecture sign-off · **Builds on:** MMT-ADR-0008 (guardianship as a derived edge operation), MMT-ADR-0010 (family-join consolidation primitive), MMT-ADR-0027 (supporter visibility contract), MMT-ADR-0028 (login presence carries visibility tier)

## Context

**Account detachment** is the transition in which a Login attaches to an existing Person while that Person may remain consent-gated — the credentialed-charge state. It is identity-preserving: the guardianship edge and the consent record ride through unchanged, and where law requires it the guardian remains consent-holder. It is separate from the consent-capability crossing, and separate again from the age at which guardianship dissolves.

Three questions about that transition were open and are settled here.

**Who may initiate it, and from what age.** Detachment has always been guardian-grantable at any age via the invite flow. Whether a child can *claim* it — ask for their own Login without a guardian initiating — was an open credential-eligibility floor.

**What a guardian may still manage afterwards.** Surfaces exist through which a guardian views and edits a charge's mentor memory and inspects raw input. A flow-inventory audit surfaced these as privacy tensions. The question is whether they are gated per-screen or by something structural.

**What proxy mode is.** Proxy plumbing exists in the codebase. Verified on review, no production call site activates it: it is dormant mechanics with no user-facing entry point. Dormant code with a plausible-sounding name is a standing hazard, because the cheapest path for a future feature is to re-wire it rather than decide whether it should exist.

The visibility half of this cluster is already decided and is **not** restated here. The supporter ceiling — that a supporter, including a post-detachment guardian acting as consent-holder, sees curated summaries and never notes, mentor memory, or transcripts — is MMT-ADR-0027's reportability allow-list and artifact wall. That guardian-granted supporterships lapse unless re-confirmed at the consent-capability crossing, and that attaching a Login is not by itself that crossing, are MMT-ADR-0028 clauses 4 and 6. This ADR converges with those rather than duplicating them.

## Decision

1. **Account detachment becomes child-claimable at 13.** Below that age it remains guardian-grantable, unchanged. This supplies the previously-open credential-eligibility floor.

2. **The claimable-at-13 entitlement is an entitlement, not yet a second mechanism.** The mechanism remains the guardian-initiated invite flow of MMT-ADR-0010; a child-initiated request-to-detach is a permitted follow-on flow, not a prohibited one. The prohibition that does stand is on minor-initiated *guardianship* — a minor may claim their own credentials and may not assume authority over another person.

3. **Detachment is one-directional.** There is no de-credentialing transition that returns a credentialed charge to managed status.

4. **Guardian management of a charge is derived, never stored.** The capability to view, toggle, correct, or delete a charge's mentor memory — and to inspect the raw-input audit surface — is derived per MMT-ADR-0008 from the conjunction of a guardian link, a shared organisation, and the charge having no Login. It is not a grant recorded on any edge or row.

5. **Therefore detachment suppresses those surfaces structurally, with no per-screen flag.** Because the capability is derived from login-absence, attaching a Login removes it as a consequence of the derivation. Gating these screens on a feature flag or a stored permission is prohibited: it would create a second, divergent answer to a question the capability derivation already answers.

6. **Proxy mechanics are retained and remain entryless.** No user-facing entry point to proxy mode exists, and none may be introduced without an ADR that decides proxy mode on its merits. The mechanics are kept as a candidate substrate for a future guardian act-for capability; retention is not authorisation.

## Consequences

- A 13-year-old on a guardian's account has a defined path to their own credentials, and that path does not disturb consent: the guardianship edge and consent record survive it. Consent-holding conveys no in-app control, so a guardian who remains consent-holder after detachment does not thereby retain management.
- Guardian management surfaces need no audience flag and must not acquire one. Their correctness follows from the capability derivation, so the test for these screens is whether they consult the derivation — not whether they check a role.
- Because detachment is one-directional, a mistaken detachment cannot be undone by an inverse transition. Any recovery is an operational matter, not a product flow.
- Retaining dormant proxy plumbing carries an ongoing cost: it must be visibly guarded so that re-wiring it is a deliberate act rather than the path of least resistance. A guard note or test is the appropriate control, not deletion — deletion would discard mechanics that a decided guardian act-for capability would need.
- This ADR deliberately leaves the identity canon's vocabulary correction unexecuted. The term "graduation" currently names more than one transition across the identity canon; the intended correction reserves it for the consent-capability crossing and names the login transition *account detachment*, with the entitlement floor and the resulting split of the affected canon requirement recorded there. Those canon edits are a separate, sequenced change-set. Lockstep binds at acceptance; this ADR is Proposed, so a deferred canon half is a sequencing request rather than an unmet obligation — but the ADR must not be accepted while the canon it renames still says otherwise.

## Alternatives considered

- **Gate mentor-memory and raw-input surfaces per screen.** Rejected: a per-screen flag is a second source of truth about who may manage a charge, and it drifts from the capability derivation the moment a new surface is added. Deriving the gate makes new surfaces correct by default.
- **Store guardian management as an explicit grant on the guardianship edge.** Rejected: the identity canon keeps that edge minimal, and a stored grant would survive detachment unless something remembered to revoke it — reintroducing exactly the failure the derivation prevents.
- **Set the child-claimable floor at the consent-capability age instead of 13.** Rejected: it conflates two transitions that the model deliberately separates. Detachment is about holding credentials; the consent crossing is about capacity to consent. Binding them would deny a 13-year-old their own Login for reasons that belong to a different question.
- **Delete the dormant proxy mechanics.** Rejected: they are the plausible substrate for a decided guardian act-for capability, and re-deriving them later is waste. The hazard is the missing entry-point decision, which clause 6 addresses directly.
- **Allow de-credentialing back to managed.** Rejected: it would let a guardian revoke a child's credentials, which inverts the direction of autonomy the transition exists to grant.

## Links

- `docs/adr/MMT-ADR-0008-guardianship-global-edge-derived-operation.md` — the capability derivation clause 4 applies.
- `docs/adr/MMT-ADR-0010-family-join-consolidation-primitive.md` — the invite flow that remains the detachment mechanism.
- `docs/adr/MMT-ADR-0027-supporter-visibility-contract.md` — the supporter ceiling and artifact wall; converged with, not restated.
- `docs/adr/MMT-ADR-0028-managed-credentialed-visibility-tier-graduation.md` — detachment is not graduation, and guardian-granted supporterships lapse at the consent crossing; converged with, not restated.
- `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md` — where the ruling was recorded in session; historical context, not authority for this ADR.
