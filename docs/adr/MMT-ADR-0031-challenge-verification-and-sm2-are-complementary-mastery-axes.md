# MMT-ADR-0031 — Challenge verification and SM-2 retention are complementary mastery axes

**Status:** Proposed · 2026-07-07 · **Scope:** Challenge Round verification, SM-2 scheduling, progress mastery state, parent proof metadata · **Deciders:** Architecture sign-off pending · **Builds on:** MMT-ADR-0005 (book-mastery atomic update), MMT-ADR-0017 (concept-grain mastery capture), MMT-ADR-0022 (derived moment feed)

## Context

MentoMate now has two independent mastery signals. Challenge Round verification records that the learner explained every target concept solidly in their own words (`assessments.mastery_challenge_verified_at`). SM-2 retention records whether recall has held across time (`retention_cards.next_review_at`, `xp_status`, `mastered_at`). The verified-learning-loop spec needs `WI-1445` to schedule a retention review when Challenge Round mastery is verified, but that write would otherwise smuggle in an unstated product decision: whether "explained it once" is the same thing as "retained it over time."

This is ADR-class because it constrains persistence writes, progress semantics, parent-visible proof, and every later recovery/re-test surface.

## Decision

Challenge verification and SM-2 retention remain **complementary axes**, not aliases.

1. **Challenge verification means "proved explanation now."** It is a conservative server-owned event: all target concepts were evaluated `solid` from structured LLM evidence and grounded learner quotes.
2. **SM-2 retention means "recall held over time."** It remains the scheduled repetition spine and owns decay/due-review timing.
3. **A Challenge-verified topic may seed or schedule an SM-2 review, but it does not make retention permanently verified.** `WI-1445` may write `retention_cards.next_review_at` as the first re-check promise after verification, but the topic can still become due/decayed through SM-2.
4. **Sticky `mastered_at` remains historical, not a current-state guarantee.** It can count that the topic once crossed a mastery threshold, but UI that claims current proof must also read current Challenge/retention state.
5. **Parent proof must carry both axes.** A parent-visible proof block may say a learner verified a topic only when the artifact is Challenge-verified, and it must also expose the retention state ("fresh", "due for re-check", or equivalent) rather than implying permanent mastery.

## Consequences

- `WI-1445` can schedule the next review without redefining mastery as "done forever."
- Progress and parent surfaces must avoid copy that collapses `mastered_at`, `masteryVerificationState`, and SM-2 `xpStatus` into one unqualified badge.
- Decay after verification is normal: the product response is re-check / re-prove, not erasing the historical verification timestamp.
- The final canon change, if this ADR is accepted, belongs in `docs/architecture.md` under "Retention & spaced repetition."

## Alternatives considered

1. **Challenge verification replaces SM-2 for verified topics.** Rejected — explanation now and recall over time are different claims; replacing SM-2 would break the retention promise.
2. **SM-2 verification alone counts as Challenge verification.** Rejected — a learner can recall facts without having explained every concept solidly in their own words.
3. **No bridge between the axes.** Rejected — then a verified Challenge never schedules the promised re-check, leaving the loop visibly broken.
4. **Clear `mastery_challenge_verified_at` on decay.** Rejected — decay changes current retention state, not the historical fact that the learner once gave a solid explanation.

## Links

- `docs/specs/2026-07-06-verified-learning-loop.md` — loop map and execution gates.
- `docs/adr/MMT-ADR-0017-concept-capture-additive-layer.md` — concept capture remains additive; the scheduled spine stays topic-keyed.
- `docs/architecture.md` → "Retention & spaced repetition" — target canon line if accepted.
