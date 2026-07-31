# MMT-ADR-0041 — Confident inference with reversible defaults; controls are surfaced where reached for, never placed in the user's path

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Product and feature design posture for user-facing decision points, defaults, and settings surfaces · **Deciders:** pending Architecture sign-off

## Context

Two opposite design failures were repeatedly identified in review as equally serious, and the second one kept being proposed as the fix for the first.

**Surveillance** is the system changing its behaviour toward a user on the strength of a weak signal — acting on a single session, a one-off event, a heuristic that could plausibly mean several things. It reads as the product watching and drawing conclusions, and it produces privacy surprise even when the inference is benign.

**Friction** is the system asking the user to decide at every point where a decision exists — modal prompts, dismissible cards, toggles, "don't show again" state to remember. It reads as the product making the user do its work, and it accumulates: each individual prompt is defensible and the aggregate is exhausting.

The instinctive correction — when surveillance is identified, add consent — was explicitly rejected as the wrong move, on the grounds that it does not remove a bad experience, it substitutes a different one. Both are treated as defects of the same class, so a design cannot be defended by pointing out that it avoids the other.

## Decision

1. **Both failure modes are defects.** A design that acts on weak signals is not acceptable, and a design that resolves that by asking the user is not acceptable either. Neither one is a defence against the other.

2. **Inference must rest on sustained behaviour or on the data model, not on single events.** Where the system infers, the signal is a pattern over time, or a fact the identity/relationship model already holds — age, role, relationship. Session-counting heuristics and single-event triggers are not a sufficient basis for changing behaviour toward a user.

3. **In ambiguous cases the system defaults rather than asks.** Where a sensible default exists that the large majority of users would choose, the system takes it. The absence of a user's explicit instruction is not a reason to interrupt them for one.

4. **Reversibility is what licenses the default.** An inferred or defaulted behaviour is acceptable only when undoing it is trivial and discoverable. Confident inference that cannot be cheaply reversed is not covered by this decision and falls back to requiring an explicit choice.

5. **Controls are surfaced where the user reaches for them, never placed in the user's path.** When a control must exist, it belongs on the surface it governs or in a findable settings location — not as an interruption at the moment of use.

6. **Privacy or social weight is the boundary.** Where a choice carries genuine privacy consequence, or where the outcomes are materially different rather than merely differently-defaulted, an explicit control is mandatory and this decision does not apply. MMT-ADR-0040 records the named instance of that boundary: an adult's learner-target choice is asked, not inferred, because the branches create different identity state and are not equivalent.

## Consequences

- Design review gains a two-sided test. "The user explicitly consented" does not on its own justify a prompt, and "we defaulted sensibly" does not on its own justify acting on a thin signal.
- Inference thresholds become a design parameter that must be stated. A feature that infers must be able to say what sustained pattern it infers from; "the user did this once" is not an answer.
- Settings surfaces stay short by construction, because the default posture is to infer rather than to add a control. A growing settings list is a signal that this decision is being bypassed, not that the product is becoming configurable.
- Every inferred default incurs a reversal path as a build cost. A feature that cannot afford the reversal cannot take the default.
- Because the boundary in clause 6 is qualitative, its application is a judgement made per feature and should be recorded where it is non-obvious — this decision sets the test, not a list of which surfaces pass it.

## Alternatives considered

- **Move from inference toward explicit consent wherever surveillance concern is raised.** Rejected explicitly and by name: it trades one bad experience for another rather than fixing either. This is the single most-attempted alternative and the reason this decision is written down.
- **Infer freely and rely on the inference being correct.** Rejected: correctness is not the whole objection. Acting on a weak signal produces privacy surprise even when the conclusion happens to be right, which is why the requirement is sustained-signal-plus-reversibility rather than accuracy alone.
- **Expose every behaviour as a user setting.** Rejected: it relocates the work onto the user and produces a settings surface no one reads, while leaving the actual default unexamined.

## Links

- `docs/adr/MMT-ADR-0040-no-screen-state-may-require-adding-a-dependent-to-proceed.md` — the named case where inference is prohibited because the branches are not equivalent.
