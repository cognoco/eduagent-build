# MMT-ADR-0028 — Login presence carries visibility tier; graduation restamps the contract

**Status:** Accepted · 2026-06-20 · **Scope:** V2 managed/credentialed reporting tiers and graduation narration · **Deciders:** Architect (jjoerg) + PM (owner) · **Builds on:** MMT-ADR-0000, MMT-ADR-0022

> **Re-vet 2026-06-30:** **AMEND / KEEP ACCEPTED.** Human Architecture sign-off is recorded, and the decision stands. This amendment removes phase-label authority: the login-presence-to-reporting-tier mapping is the decision; implementation sequencing remains L3 rollout context.

## Context

The identity canon already owns the terms. A managed Person has no Login; a credentialed Person has a Login. Graduation is the consent-capability transition, not merely attaching credentials to a formerly managed account.

This ADR maps that existing axis onto visibility-tier behavior. Launch supports the consent-capable credentialed branch. The managed tier is built dark because activation depends on the identity/consent runtime and product/legal rollout.

## Decision

1. Managed/credentialed is read from the canon's login-presence axis. This ADR does not define a new account type.
2. Managed-tier visibility activation is gated by `MANAGED_TIER_ACTIVE`, default off, and enforced server-side.
3. Consent-capable credentialed supportees participate in the linking ceremony and can initiate supportership revocation.
4. Guardian-granted supporterships are re-confirmed or lapsed when the supportee graduates, per the identity canon's consent-capability transition.
5. Graduation produces first-party contract/audit/notice state. UI cards are read-time projections from that state; no graduation ledger kind is added.
6. Account detachment is separate from graduation. Attaching a Login without a consent-capability transition does not by itself lift the reporting gate.

## Consequences

- The managed tier can be developed and tested without becoming active in production.
- Server enforcement remains authoritative even if a client flag is misconfigured.
- Graduation narration can explain the reporting delta without driving the identity transition itself.
- The visibility-tier contract does not duplicate the identity canon's definitions of managed, credentialed, charge, or supportee.

## Alternatives considered

- **Client-only managed gate.** Rejected: visibility tier activation is privacy-sensitive and must fail closed on the server.
- **Treat account attachment as graduation.** Rejected: consent capability is a legal/product transition, not merely a credential state.
- **Write graduation cards to `mentor_activity_ledger`.** Rejected by MMT-ADR-0022; these are contract/notice projections, not feed event records.

## Links

- `docs/canon/identity/ontology.md` §3.1, inv 3/4 — managed/credentialed login-presence axis.
- `docs/canon/identity/domain-model.md` §5 — consent-capability transition catalogue.
- `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` §6.2 and §13.5 — contextual product spec for reporting tier and managed activation posture; not authority for this ADR.
- `docs/adr/MMT-ADR-0022-activity-ledger-narration-substrate.md` — no new cross-user ledger moment kind.
