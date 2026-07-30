# MMT-ADR-0046 — Every AI-driven interaction carries a human override

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Every product surface where a model suggests, ranks, orders, or decides something the learner then acts on · **Deciders:** pending Architecture sign-off

## Context

The product's core loop is model-driven: it proposes subjects, orders topics, recommends what to study next, and coaches during a session. Each of those is a place where the system's output can become the only available path — not by deliberate design, but by omission. A screen that renders three model-suggested subjects and no text field has silently made the model authoritative. Nothing in the individual screen looks wrong; the constraint only becomes visible when a learner wants something the model did not propose.

The failure this guards against is not model error. A suggestion can be entirely reasonable and still be wrong for this learner right now, and the learner is the one who knows that. When there is no way around the suggestion, the tool stops reading as a guide and starts reading as an authority that must be satisfied — which is the opposite of the intended relationship, and is felt most sharply by exactly the users with the least social standing to push back.

This was raised repeatedly as a whole-product property rather than a per-screen bug, with an explicit instruction that it be treated as a standing principle and audited across surfaces rather than fixed where noticed.

## Decision

1. **Every AI-driven interaction exposes a human override.** Wherever the system suggests, ranks, orders, or decides, the user can reach an outcome the system did not propose. This is a property of the interaction, not of the feature — a new surface inherits the requirement by being model-driven.

2. **Suggestion sets accept free input.** Where the model offers a closed set of options, manual entry is available alongside it. A learner who wants a subject the model did not suggest types it.

3. **Recommended order is advisory, never enforced.** Sequencing that the system produces — topic order, next-step recommendation — is presented as a recommendation the user may depart from, not as a gate that must be cleared in order.

4. **In-session direction is redirectable.** The learner can redirect, skip, or challenge a model suggestion mid-session. Coaching output is a suggestion, not a mandate.

5. **The override is discoverable at the point of constraint.** An override that exists but is not findable where the user meets the constraint does not satisfy this decision. Reaching it must not require leaving the flow, discovering a settings screen, or already knowing it exists.

6. **The model's authority is bounded, not adversarial.** This decision governs pedagogical and organisational output. It does not license routing around safety refusals, age-resolved gating, or consent requirements, which are not suggestions and are governed elsewhere.

## Consequences

- New model-driven surfaces carry a design obligation from the first sketch: name the override before the surface ships. "The model always suggests something reasonable" is not a substitute, because reasonableness is not the objection.
- Some flows are more expensive to build. A closed suggestion set is simpler than one that must also accept and resolve arbitrary user input, and this decision spends that cost deliberately.
- Review gains a mechanical question that does not require judgement about model quality: *where is the override on this screen, and can a user find it without being told?* A screen that cannot answer is incomplete regardless of how good the suggestions are.
- Because the requirement is stated at the level of the interaction, it is auditable across surfaces rather than negotiated per feature. A surface that wants an exception is asking to change this decision, not to make a local call.
- Clause 6 draws a boundary that must be applied per surface: an affordance that lets a learner reach a different *learning* outcome is required, and an affordance that lets a learner reach a different *safety or consent* outcome is prohibited. Where a surface mixes both, the safety side governs.

## Alternatives considered

- **Rely on model quality instead of a structural override.** Rejected: this misreads the objection. The problem is the absence of an alternative path, which is present whether or not the suggestion is good. A learner with a different intent is not served by a better guess.
- **Add overrides where users complain.** Rejected in favour of a standing principle precisely because the constraint is invisible until someone hits it, and the users most likely to hit it are least likely to report it.
- **Provide a single global escape (a "do something else" affordance) rather than per-interaction overrides.** Rejected: a global exit abandons the current context rather than letting the user steer it, so it does not give the learner a different outcome *here* — which is what clause 1 requires.

## Links

- `docs/adr/MMT-ADR-0041-confident-inference-and-reversible-defaults.md` — the adjacent posture on defaults. That decision governs when the system may act without asking; this one governs the user's ability to depart from what it did. Its clause 5 (controls surfaced where reached for, never in the user's path) constrains *how* an override is presented.
- `docs/adr/MMT-ADR-0040-no-screen-state-may-require-adding-a-dependent-to-proceed.md` — the named instance of a no-dead-end rule in the identity/onboarding flow, of which this decision is the general model-driven case.
- `docs/adr/MMT-ADR-0030-adult-catastrophic-procedure-gate.md` — an example of the clause 6 boundary: a refusal that is deliberately not overridable.
