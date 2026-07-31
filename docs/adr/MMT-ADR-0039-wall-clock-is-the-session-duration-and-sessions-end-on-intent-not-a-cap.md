# MMT-ADR-0039 — Wall-clock is the user-facing session duration; sessions end on intent or adaptive silence, never on a fixed cap

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Session lifecycle, session duration presentation, silence detection, session analytics · **Deciders:** pending Architecture sign-off

## Context

A learning session has two defensible durations and they diverge sharply. **Wall-clock** is the span from session start to session close. **Active time** is the portion during which the system observed the learner interacting. A child who reads a textbook page for twenty minutes between two messages produces a large wall-clock number and a small active number.

Which one is shown, and to whom, is a product decision with real consequences: a parent who is told a ninety-minute session was "eleven minutes of learning" concludes their child was idle, when in fact they were doing exactly the paper work the mentor asked for. Presenting only observed interaction systematically undervalues the offline half of studying — reading, working on paper, thinking — which is the half the product is trying to support.

The same offline reality breaks fixed timers in two directions. A single silence constant either interrupts a learner mid-calculation or waits pointlessly after a question that takes five seconds to answer. And a fixed maximum session length ends sessions mid-thought, punishing precisely the engaged learners the product wants.

## Decision

1. **Wall-clock is the duration every audience sees.** Both the learner and any adult viewing that learner's activity see wall-clock time. There is no audience-varying definition of "how long was this session".

2. **Adult-facing surfaces pair duration with exchange count.** Duration alone is ambiguous; "45 min, 18 exchanges" and "120 min, 2 exchanges" describe different sessions and must be distinguishable without inference.

3. **Active/engaged time is internal analytics and is never presented as the session's duration.** It may be computed, stored, and returned in payloads for analytics and internal reporting. It must not be rendered to any user as how long the session was, and it must not be used as a fallback that silently substitutes for wall-clock in presentation.

4. **Active time is computed by capping inter-event gaps, and the tail is excluded.** The algorithm sums the intervals between consecutive observable events (session start to first event, then event to event), capping each interval at a per-gap ceiling so a long offline stretch contributes a bounded amount rather than its full length. The gap between the last observed event and session close is deliberately excluded — nothing was observed there, so nothing is counted. The per-gap ceiling defaults to a fixed value and is widened by the model's declared expected response time for the preceding turn.

5. **There is no hard session cap.** A session ends when the learner says they are done, or when adaptive silence detection fires. No forced termination at a fixed elapsed time exists, and no close reason may encode one.

6. **Silence is adaptive and model-declared, not constant.** Each assistant response declares the time it expects the learner to reasonably take before replying, and the silence timer is driven by that declaration rather than a global constant. A recall question and a multi-step problem are given different patience because the model that just posed them knows which it asked.

## Consequences

- Any surface that presents active time as the session's duration — including as a null-fallback when wall-clock is unavailable — is a defect against this ADR, not a local presentation choice. The correct fallback for an unavailable wall-clock value is to present no duration.
- Analytics and product reporting diverge deliberately from what users see. Anyone comparing an internal engagement figure against a user-visible duration is comparing two different quantities by design, and dashboards must label which is which.
- Because the per-gap ceiling is widened by a model-declared value, the active-time figure is not purely mechanical — it inherits the model's estimate. This is accepted: an uncapped sum would make offline reading indistinguishable from an abandoned tab, and a fixed cap would systematically undercount exactly the turns the mentor asked to take longer.
- Removing the fixed cap moves the cost of an abandoned session onto silence detection. Silence detection is therefore load-bearing for session closure, not merely a nudge.
- The excluded tail gap means active time is always an underestimate of engagement near the end of a session. This is the intended direction of error: the alternative counts unobserved time as observed.

## Alternatives considered

- **Show active time to everyone.** Rejected: it undervalues the offline work the product deliberately encourages, and reports a child who read for twenty minutes as idle.
- **Show wall-clock to the learner and active time to the adult.** Rejected: it creates two contradictory accounts of the same session, and the adult's account is the misleading one. Pairing wall-clock with exchange count gives the adult the engagement context they actually need without a second definition of duration.
- **Keep a fixed maximum session length.** Rejected: forcing a session to end mid-thought punishes the engaged learner. The stated intent is that ending is the learner's decision.
- **A single fixed silence constant.** Rejected empirically in both directions — it interrupts paper work and it waits far too long after trivial recall questions.
- **Uncapped inter-event gaps for active time.** Rejected: it makes active time equal to wall-clock and eliminates the distinction the metric exists to draw.

## Links

- `apps/api/src/services/session/session-context-builders.ts` — the gap-capping active-time computation.
- `apps/api/src/services/session/session-crud.ts` — session close and duration assembly.
- `packages/schemas/src/progress.ts`, `packages/schemas/src/account.ts` — the response shapes carrying both durations.
- `apps/mobile/src/components/session/use-session-streaming.ts` — client-side adaptive silence scheduling from the model's declared expected response time.
