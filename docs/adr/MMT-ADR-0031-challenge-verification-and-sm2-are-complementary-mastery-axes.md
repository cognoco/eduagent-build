# MMT-ADR-0031 — Challenge verification and SM-2 retention are complementary mastery axes

**Status:** Accepted · 2026-07-08 · **Scope:** Challenge Round verification, SM-2 scheduling, progress mastery state, parent proof metadata · **Builds on:** MMT-ADR-0005 (book-mastery atomic update), MMT-ADR-0017 (concept-grain mastery capture), MMT-ADR-0022 (derived moment feed)

## Context

MentoMate has two independent mastery signals that answer different questions:

- **Challenge Round verification** answers *"can the learner explain this, in their own words, right now?"* It is a conservative, server-owned event: a topic is verified only when every target concept was evaluated `solid` from structured LLM evidence grounded in learner quotes. Persisted as `assessments.mastery_challenge_verified_at`.
- **SM-2 retention** answers *"has recall of this held over time?"* It is the scheduled spaced-repetition spine (`packages/retention/`), owning decay and due-review timing. Persisted on retention cards (`next_review_at`, ease factor, repetitions) and surfaced through progress state.

The moment a Challenge verification schedules a retention review, the system risks smuggling in an unstated product claim: that "explained it once" equals "retained it over time." Left implicit, that conflation would leak into persistence writes, progress badges, and parent-visible proof — a topic could be presented as permanently mastered on the strength of a single good explanation.

## Decision

Challenge verification and SM-2 retention are **complementary axes**, never aliases. Neither replaces, implies, or overwrites the other.

1. **Challenge verification means "proved explanation now."** It is a point-in-time event, recorded as a historical timestamp. It never expires and is never cleared by later forgetting — the learner *did* give that explanation.
2. **SM-2 retention means "recall held over time."** It remains the sole owner of decay and due-review scheduling. No other signal may mark a topic permanently retained.
3. **Verification may seed retention scheduling, but never terminate it.** When a topic becomes Challenge-verified, the system may write the retention card's next review date as the first re-check promise. The topic remains fully subject to SM-2 afterwards: it can become due, decay, and require re-review like any other topic. Verification is an on-ramp into the repetition loop, not an exit from it.
4. **A sticky "mastered" timestamp is historical, not a current-state guarantee.** `mastered_at`-style fields record that a topic once crossed a mastery threshold. Any UI claiming *current* proof must also read current Challenge and retention state — never the historical timestamp alone.
5. **Parent-visible proof must carry both axes.** A proof surface may claim a topic is verified only when it is Challenge-verified, and it must simultaneously expose the retention state (e.g. "fresh" / "due for re-check"). Copy or badges implying permanent mastery from either axis alone are prohibited.

## Consequences

- Verification can schedule the next retention review without redefining mastery as "done forever."
- Progress and parent surfaces must not collapse the historical mastery timestamp, the Challenge verification state, and the SM-2 retention status into one unqualified badge — each axis keeps its own meaning in copy and data.
- Decay after verification is normal, expected behavior. The product response is re-check / re-prove; the historical verification timestamp is never erased.
- Anyone adding a new mastery-adjacent signal must place it on one of these two axes (or record a new ADR); no third implicit definition of "mastered" may accrete.
- Canon lives in `docs/architecture.md` → Cross-Cutting Concerns → "Retention & spaced repetition."

## Alternatives considered

1. **Challenge verification replaces SM-2 for verified topics.** Rejected — explanation now and recall over time are different claims; replacing SM-2 would break the retention promise.
2. **SM-2 success alone counts as Challenge verification.** Rejected — a learner can recall facts without ever having explained every concept solidly in their own words.
3. **No bridge between the axes.** Rejected — then a verified Challenge never schedules the promised re-check, leaving the learning loop visibly broken.
4. **Clear the verification timestamp on decay.** Rejected — decay changes current retention state, not the historical fact that the learner once gave a solid explanation.

## Links

- `docs/adr/MMT-ADR-0017-concept-capture-additive-layer.md` — concept capture remains additive; the scheduled spine stays topic-keyed.
- `docs/architecture.md` → "Retention & spaced repetition" — canon line.
- `packages/retention/` — the SM-2 implementation this ADR constrains.
