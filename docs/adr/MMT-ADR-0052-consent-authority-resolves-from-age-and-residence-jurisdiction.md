# MMT-ADR-0052 — Consent authority resolves from age and residence jurisdiction, never from age alone

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Minimum age for product access, and the derivation of who holds consent authority for a minor learner · **Deciders:** pending Architecture sign-off

## Context

Two questions about a young learner are easy to collapse into one, and collapsing them produces a specific, repeatable error.

The first is **may this person use the product at all** — a floor, expressed as an age, uniform everywhere.

The second is **who may lawfully consent on this person's behalf** — which is not uniform, because the age at which a minor can consent to information-society services is set per jurisdiction. Across the European Economic Area that age varies between 13 and 16. A fifteen-year-old is self-consenting in one member state and requires guardian authorisation in another, on the same day, at the same age, using the same product.

The error is to state a single number for both. "Thirteen and over, guardian consent through sixteen" reads as a complete policy and is not one: it applies one jurisdiction's threshold everywhere, which either demands guardian consent from teenagers whose own consent is legally sufficient, or accepts self-consent where the law does not permit it. The second direction is the one that matters, and it is not detectable by testing the product in a single country.

A related conflation is broader. Whether a learner has their own login, whether they hold consent authority, whether they belong to a family, who pays, whether a Guardianship exists, and whether a Supportership exists are six orthogonal facts. Phrasing that bundles them — describing every learner above the floor as self-consenting — silently asserts five things while appearing to assert one.

## Decision

1. **The access floor is thirteen.** Below it the product is unavailable: no account creation, no guardian-mediated workaround, no route in.

2. **Consent authority is computed from the learner's age and their jurisdiction of habitual residence**, never from age alone. Guardian authorisation is required where the learner's age is below the jurisdiction's consent threshold for information-society services, and the learner holds their own consent authority at or above it.

3. **Habitual residence is the governing input.** Nationality, interface language, network-derived location, and app-store country are not substitutes. A learner's interface language in particular carries no jurisdictional meaning and must not be read as one.

4. **The comparison uses exact date of birth, not year of birth.** A threshold that governs lawfulness cannot be evaluated against a value with a year's imprecision.

5. **Unknown, missing, or conflicting residence fails closed** — treated as requiring guardian authorisation rather than defaulting to self-consent. The safe direction is over-requiring consent, because under-requiring it is unlawful and cannot be repaired after the fact.

6. **Consent capability is jurisdiction-relative and re-evaluated on change.** A residence change can re-engage a consent requirement with no change in age, and authority held under one jurisdiction does not automatically transfer to another.

7. **Being above the consent threshold does not withdraw minor protections.** Safety, transparency, profiling, and billing protections for under-eighteens apply irrespective of who holds consent authority. Consent capability governs who authorises, not what the product owes a minor.

8. **The six facts stay distinct.** Own login, consent authority, family membership, payment responsibility, Guardianship, and Supportership are separate attributes. No one of them may be inferred from another, and product copy that bundles them is a defect.

## Consequences

- Consent cannot be gated by a constant. Any check of the form *age below a fixed number* is incorrect regardless of which number it uses, because the correct threshold is a function of residence.
- Residence becomes a first-class, load-bearing attribute rather than analytics metadata: it must be captured before consent is resolved, versioned over time so a change can trigger re-evaluation, and recorded against a grant so the basis on which it was given remains auditable.
- Clause 5 makes the fail-closed direction deliberate. A learner may be asked for guardian authorisation they did not strictly need; the reverse error is not recoverable.
- **Stated as of 2026-07-30:** the jurisdiction-aware resolution is modelled in canon and its inputs are captured and load-bearing, but the resolver is a fail-closed scaffold with no production callers, and the live gate is a jurisdiction-blind flat check. This ADR records the decision, which is not the same as the mechanism existing. Work in this area is *building* the resolution, never consuming it as already present — treating clause 2 as implemented is the specific mistake this note exists to prevent.
- This ADR deliberately carries **no country list**. Which markets are open is an operational perimeter governed by launch readiness and counsel sign-off; it has moved repeatedly and is expected to move again, and freezing a snapshot of it into a durable decision record would produce exactly the stale-canon problem this layer exists to avoid. The rule for deriving consent authority is stable; the list of countries it is currently applied to is not, and lives with the compliance perimeter rather than here.
- Model-provider eligibility is adjacent to this decision but is not part of it, and the two are frequently and wrongly bundled. The provider exclusion in force is age-independent — a full exclusion for all users, not a minors-only restriction — and is owned by the routing decision and the model register rather than restated here. Deriving a minors-only reading from the fact that it originated in a child-safety concern is an error.

## Alternatives considered

- **Apply a single consent age everywhere, set to the strictest threshold.** Rejected as the decision rather than an approximation of it: it is lawful but demands guardian authorisation from teenagers whose own consent suffices, which suppresses legitimate use and misrepresents their standing. It is, however, the correct *fallback* when residence is unknown — which is what clause 5 encodes.
- **Apply a single consent age everywhere, set to the lowest threshold.** Rejected: unlawful in higher-threshold jurisdictions, and undetectable in single-jurisdiction testing.
- **Derive jurisdiction from interface language or app-store country.** Rejected under clause 3: these are user preferences and commercial facts, and a learner reading the interface in one language while habitually resident elsewhere is ordinary rather than exceptional.
- **Encode thresholds per country in application code.** Rejected in favour of policy-as-data with a worst-case default: thresholds change by legal process rather than by release, and a code-resident table makes a legal correction a deployment.
- **Set the access floor below thirteen with guardian mediation.** Rejected: it takes on the under-thirteen compliance surface in its entirety, and raising a floor after launch means removing already-enrolled children — an asymmetry that makes the low floor effectively irreversible.

## Links

- `docs/canon/identity/ontology.md` — the canonical model of consent-requirement resolution, residence as a time-versioned attribute, and the jurisdiction-relativity invariants; named as the authority for those shapes rather than restated.
- `docs/adr/MMT-ADR-0014-router-runtime-vetting-split.md` and `docs/registers/llm-models/master.md` — the owners of model-provider eligibility referred to in Consequences.
- `docs/adr/MMT-ADR-0008-guardianship-global-edge-derived-operation.md` — Guardianship as a derived edge, one of the six facts clause 8 keeps distinct from consent authority.
