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

2. **Consent authority is computed from the learner's age and their jurisdiction of habitual residence**, never from age alone. The learner holds their own consent authority at or above the jurisdiction's consent threshold for information-society services, and below it the authority lies elsewhere.

3. **The jurisdiction resolves the required *form* of authorisation, not merely whether some is needed.** "Below threshold" is not a single outcome. A jurisdiction may require a guardian's authorisation, or a joint authorisation by the child together with a guardian, or may place the age/jurisdiction combination out of scope entirely. The resolved form is part of the decision and must be carried through; collapsing it to a binary learner-or-guardian result would let a guardian-only grant satisfy a jurisdiction that requires both parties.

4. **Habitual residence is the governing input.** Nationality, interface language, network-derived location, and app-store country are not substitutes. A learner's interface language in particular carries no jurisdictional meaning and must not be read as one.

5. **The comparison uses exact date of birth, not year of birth.** A threshold that governs lawfulness cannot be evaluated against a value with a year's imprecision.

6. **Failing closed means blocked, not guardian-mediated.** Where residence is unknown, missing, or conflicting — or where the age and jurisdiction combination is not positively established as permitted — the outcome is that the combination is unavailable. It does not fall back to "ask a guardian instead": routing an unresolved jurisdiction into a guardian-authorisation flow would allow the flow to complete on a grant obtained under no verified policy, which is a permissive outcome wearing the appearance of a strict one. A positively resolved, permitted jurisdiction is a precondition of proceeding at all, and only then does the resolved authorisation form of clause 3 apply.

7. **Consent capability is jurisdiction-relative and re-evaluated on change.** A residence change can re-engage a consent requirement with no change in age, and authority held under one jurisdiction does not automatically transfer to another.

8. **Being above the consent threshold does not withdraw minor protections.** Safety, transparency, profiling, and billing protections for under-eighteens apply irrespective of who holds consent authority. Consent capability governs who authorises, not what the product owes a minor.

9. **The six facts stay distinct.** Own login, consent authority, family membership, payment responsibility, Guardianship, and Supportership are separate attributes. No one of them may be inferred from another, and product copy that bundles them is a defect.

## Consequences

- Consent cannot be gated by a constant. Any check of the form *age below a fixed number* is incorrect regardless of which number it uses, because the correct threshold is a function of residence.
- Residence becomes a first-class, load-bearing attribute rather than analytics metadata: it must be captured before consent is resolved, versioned over time so a change can trigger re-evaluation, and recorded against a grant so the basis on which it was given remains auditable.
- Clause 6 makes the fail-closed direction deliberate and sets its shape: a learner may be told the product is unavailable to them when a better-resolved policy would have permitted it, and that error is recoverable by resolving the policy. The reverse error — proceeding on an authorisation obtained under no verified jurisdiction — is not.
- Thresholds and authorisation forms are policy **data**, not code. They change by legal process rather than by release, and the resolution reads an effective-dated registry so that adding a jurisdiction or amending a threshold is a data change. A country list or threshold table embedded in application code contradicts this decision.
- Clause 3 means a consent record must carry the form under which it was obtained, not merely that consent exists. A store that records only "consented" cannot distinguish a guardian-only grant from a joint one, and so cannot demonstrate compliance for a jurisdiction requiring both.
- **Stated as of 2026-07-30:** the canonical resolver for this decision exists — a pure, fail-closed function over an effective-dated policy registry, which emits a permitted outcome only when no blocking reason applies, and which holds no embedded country list. What has not yet happened is its adoption by the live consent gate, which still performs a flat jurisdiction-blind age comparison. The decision and the mechanism therefore both exist while the consuming path does not: work in this area is *integrating* the resolver, and treating the live gate as already jurisdiction-aware is the specific mistake this note exists to prevent.
- This ADR deliberately carries **no country list**. Which markets are open is an operational perimeter governed by launch readiness and counsel sign-off; it has moved repeatedly and is expected to move again, and freezing a snapshot of it into a durable decision record would produce exactly the stale-canon problem this layer exists to avoid. The rule for deriving consent authority is stable; the list of countries it is currently applied to is not, and lives with the compliance perimeter rather than here.
- Model-provider eligibility is adjacent to this decision but is not part of it, and the two are frequently and wrongly bundled. The provider exclusion in force is age-independent — a full exclusion for all users, not a minors-only restriction — and is owned by the routing decision and the model register rather than restated here. Deriving a minors-only reading from the fact that it originated in a child-safety concern is an error.

## Alternatives considered

- **Apply a single consent age everywhere, set to the strictest threshold.** Rejected as the decision: it is lawful but demands guardian authorisation from teenagers whose own consent suffices, which suppresses legitimate use and misrepresents their standing. It is also not the right fallback for unresolved residence — clause 6 blocks rather than applying a strict threshold, because a threshold applied to an unknown jurisdiction is a guess, and a guess that permits a flow to complete is not fail-closed.
- **Apply a single consent age everywhere, set to the lowest threshold.** Rejected: unlawful in higher-threshold jurisdictions, and undetectable in single-jurisdiction testing.
- **Derive jurisdiction from interface language or app-store country.** Rejected under clause 4: these are user preferences and commercial facts, and a learner reading the interface in one language while habitually resident elsewhere is ordinary rather than exceptional.
- **Encode thresholds per country in application code.** Rejected in favour of policy-as-data with a worst-case default: thresholds change by legal process rather than by release, and a code-resident table makes a legal correction a deployment.
- **Set the access floor below thirteen with guardian mediation.** Rejected: it takes on the under-thirteen compliance surface in its entirety, and raising a floor after launch means removing already-enrolled children — an asymmetry that makes the low floor effectively irreversible.

## Links

- `docs/canon/identity/ontology.md` — the canonical model of consent-requirement resolution, residence as a time-versioned attribute, and the jurisdiction-relativity invariants; named as the authority for those shapes rather than restated.
- `docs/adr/MMT-ADR-0014-router-runtime-vetting-split.md` and `docs/registers/llm-models/master.md` — the owners of model-provider eligibility referred to in Consequences.
- `docs/adr/MMT-ADR-0008-guardianship-global-edge-derived-operation.md` — Guardianship as a derived edge, one of the six facts clause 9 keeps distinct from consent authority.
