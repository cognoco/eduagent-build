# MMT-ADR-0040 — No screen state may require adding a dependent to proceed; a plan tier unlocks capability and never removes options

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Onboarding, family/plan-owner surfaces, any screen whose primary action creates a linked learner · **Deciders:** pending Architecture sign-off

## Context

An adult can arrive at this product for several reasons that are indistinguishable at the moment of arrival: to learn something themselves, to evaluate the content before deciding whether a child should use it, or to set a child up immediately. A surface that reads "adult" and infers "therefore here to add a child" is guessing, and it guesses wrong for two of the three.

The failure this rule exists to prevent is structural, not cosmetic. When "add a child" is the only action on a screen, an adult who does not want to create a child profile has no move. They cannot proceed, cannot evaluate, cannot use the product for themselves — the screen is a dead end, and the only escape is to abandon the session or fabricate a profile they did not want. Fabricated profiles are worse than lost sessions: they enter the identity and consent model as real dependents.

The tempting version of this failure is specifically attractive on paid family tiers, where the tier's name suggests the owner's purpose. That inference is the trap: purchasing capacity for others is not a statement that the purchaser is not also a learner.

## Decision

1. **No screen may make creating a linked learner the only way forward.** Every state that offers "add a child" must simultaneously offer at least one actionable alternative — continue as a solo learner, skip, or explore the content directly. This holds regardless of plan tier, and it holds when the account has zero linked learners.

2. **Where the target of the action is ambiguous, ask rather than infer.** When an adult's path could reasonably end in either their own learning or someone else's, present the choice in plain language instead of defaulting silently to one branch. A silent default here is not a quiet default in the sense of MMT-ADR-0041 — the two outcomes are materially different, irreversible in different ways, and create different identity state.

3. **A plan tier unlocks capability; it never removes options.** Holding a multi-seat plan grants the ability to add learners. It does not withdraw the owner's own learner path, and it must not be read as evidence about why the owner is here.

4. **Choosing the solo path creates no relationship state.** Continuing as one's own learner must not create family, guardianship, or supportership records as a side effect. A path taken to *avoid* declaring a dependent cannot be the path that declares one.

## Consequences

- Every screen whose primary action creates a linked learner needs a designed secondary path, which is real design work rather than a fallback button. The alternative — a dead end — is not available.
- Zero-linked-learner states become a first-class case to design for, not an empty-list edge case, because they are the exact state in which the dead end appears.
- Because tier cannot be used to infer intent, tier-conditional routing that skips the target choice is prohibited even when it would shorten the flow for the majority.
- Identity and consent state stay honest: dependents exist because someone chose to create them, not because a flow left no other exit.
- Where a branch of the choice is genuinely unavailable in the current product, it must be shown as explicitly gated rather than silently selected on the user's behalf — a hidden branch reproduces the dead end in a less visible form.

## Alternatives considered

- **Infer the target from plan tier.** Rejected: purchasing seats for others says nothing about whether the purchaser also learns. The inference is wrong often enough to strand real users, and its failure mode is a dead end rather than a mild mis-default.
- **Offer only "add a child", and let the adult add themselves as a learner afterwards.** Rejected: it forces creation of state the user did not ask for as the price of proceeding, and that state carries guardianship and consent meaning.
- **Make the escape a dismissal that drops the user out of the flow.** Rejected: leaving the flow entirely is abandonment, not an escape. The rule is that the user retains a route to a usable outcome. A step that explains why a branch is unavailable and returns the user to a live choice satisfies this; a step whose only exit is out of the flow does not.

## Links

- `docs/adr/MMT-ADR-0041-confident-inference-and-reversible-defaults.md` — the general posture on inference and defaults; this ADR names the case where inference is specifically prohibited because the outcomes are not equivalent.
- `apps/mobile/src/components/onboarding/FamilyIntentOnboardingGate.tsx` — the learner-target choice for the adult family-intent path. It is a consumer of this rule, not its source; the rule holds independently of any one surface implementing it.
