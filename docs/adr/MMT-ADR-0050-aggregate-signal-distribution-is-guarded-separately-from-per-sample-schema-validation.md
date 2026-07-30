# MMT-ADR-0050 — Aggregate signal distribution is guarded separately from per-sample schema validation

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Prompt-regression detection in the LLM evaluation harness, for flows that return the structured response envelope · **Deciders:** pending Architecture sign-off

## Context

Structured envelope responses are validated per sample against a schema. That catches the model emitting malformed output — a missing field, a wrong type, a reply that is no longer parseable — and it catches it precisely, on the sample that broke.

It cannot catch a change in how often a valid signal is emitted. A prompt edit that halves the rate at which the model reports partial progress produces a run in which every single sample is schema-valid. Each response is well-formed; the *distribution* has moved, and with it the behaviour of every downstream state machine that keys on that signal. Per-sample validation is structurally blind to this, because the defect exists only in the aggregate and no individual sample is wrong.

This is the regression shape that prompt tuning actually produces. Prompt edits rarely break the format — the format is heavily constrained and the model is good at it — they shift emphasis, and emphasis shows up as frequency. Without an aggregate check, the first detector of such a drift is production behaviour.

## Decision

1. **Signal distribution is guarded as its own layer, alongside per-sample schema validation rather than instead of it.** The two detect different defect classes: schema validation catches malformed output, the distribution guard catches valid output emitted at the wrong rate. Neither subsumes the other and both run.

2. **The guard is a baseline comparison.** Signal and hint rates are collected across a run and compared against a committed baseline; the run fails on drift beyond tolerance and reports which metric moved, in which direction, and by how much.

3. **The baseline is committed with the prompt version it reflects.** An intentional prompt change re-seeds the baseline in the same change-set as the prompt edit, so a reviewer sees the behavioural delta and the cause together. A baseline updated separately from its prompt records a movement nobody reviewed.

4. **Participation is opt-in per flow.** A flow declares that it emits the envelope; flows that do not are not measured. Silent non-participation is the failure mode this makes visible, so the declaration is explicit rather than inferred.

5. **Tolerance is a function of sample count and must never be tightened without first increasing N.** Tolerance exists to absorb single-sample variance: at a given matrix size one sample is worth a known number of percentage points, and a tolerance near that figure converts normal model variance into a failing check. A tighter tolerance on an unchanged N produces flakiness, and a flaky guard is disabled or ignored, which is worse than a loose one.

6. **Structural validation of the baseline runs without model access.** Whether the baseline file is well-formed is checkable deterministically and is a blocking check; whether the model still matches it requires a live run and is scheduled rather than gating every change.

## Consequences

- Prompt changes acquire a visible behavioural diff. The question "what did this prompt edit actually change about model behaviour?" has a numeric answer instead of a reviewer's impression.
- The baseline is a maintained artifact with a staleness failure mode of its own: one re-seeded without inspecting the drift it absorbs launders a regression into the accepted state. Clause 3 mitigates this by forcing the re-seed and its cause into one reviewable change.
- Two checks with different costs and cadences coexist — a free structural check that can gate every change, and a model-invoking check that cannot. Confusing them yields either a blocked pipeline or an unguarded one.
- Clause 5 couples two parameters that are otherwise adjusted independently, and it is the clause most likely to be violated with good intentions: tightening tolerance looks like raising standards and, at unchanged N, is purely a source of false failures.
- Coverage is bounded by opt-in. A new envelope-returning flow that omits the declaration is silently unguarded, and its absence looks identical to a passing check.

## Alternatives considered

- **Rely on per-sample schema validation alone.** Rejected: it is structurally incapable of detecting distribution drift, because every sample in a drifted run is individually valid.
- **Treat any distribution change as a failure, with no tolerance.** Rejected under clause 5: model sampling is stochastic, so a zero-tolerance guard fails on ordinary variance and is switched off.
- **Judge response quality with a model-based evaluator instead.** Rejected as a different layer rather than a substitute: semantic quality assessment is more expensive, less deterministic, and does not answer the specific question of whether a signal's rate moved.
- **Measure every flow automatically instead of opting in.** Rejected: flows that do not return the envelope have no signal rates to measure, and inferring participation would produce baselines that silently mean nothing for those flows.

## Links

- `apps/api/eval-llm/` — the harness this layer sits in; the metric implementations and the committed baseline live there and are the source of truth for the shapes and current tolerance value.
