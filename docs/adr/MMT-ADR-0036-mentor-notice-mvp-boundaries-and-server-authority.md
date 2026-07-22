# MMT-ADR-0036 — Mentor notices use bounded in-app scope and server authority for the MVP

**Status:** Accepted · 2026-07-21 · **Scope:** Mentor-notice eligibility, interaction lifecycle, AI contract, persistence authority, rollout, and rollback · **Deciders:** Product and Architecture sign-off: MentoMate operator (interactive ruling, 2026-07-21)

## Context

MentoMate needs an early, visible demonstration that the Mentor remembers a concrete learning gap and returns to it later. A mentor notice is a low-stakes, learner-visible record of such a gap, followed by an optional short re-check. The capability must feel attentive without becoming diagnostic, coercive, noisy, or visible to a guardian or supporter.

The first implementation established a broad vertical slice: LLM proposal signals, evidence validation, durable state, in-app surfaces, re-checks, optional push delivery, and lifecycle jobs. A later change expanded creation from homework to every session type and added an interleaved-session topic identifier to the shared LLM envelope. Those implementation changes preceded a ratified product and architecture boundary. This decision is based on current Product and Architecture judgment; the earlier plans and merged code are historical input, not authority for the ruling.

The MVP will launch without existing customers. It will first be exercised internally and then by a small group of friendly users. That lowers migration risk, but it does not remove the need for a coherent privacy, evidence, and state contract before the capability becomes part of the MVP.

## Decision

### 1. Eligibility, audience, and visibility

1. Mentor notices are an MVP capability.
2. A notice may originate from a homework session or an ordinary single-subject learning session. Interleaved sessions are not eligible in the MVP.
3. The same eligibility and interaction rules apply to learners of every age. Copy remains learner-safe and age-neutral; age does not create a second notice lifecycle.
4. Notice details are learner-only. A guardian, supporter, payer, owner acting for another person, or any other proxy read receives no notice concept, hint, evidence, receipt, card, or celebration. Client scope cannot establish selfhood; the server compares the authenticated actor with the subject learner.

### 2. Learner interaction and quiet lifecycle

1. The product exposes at most one actionable mentor notice to a learner at a time. Multiple durable records may exist, but there is no visible queue or backlog of shortcomings.
2. An accepted notice may appear as an in-app acknowledgement, session receipt, or Mentor/Now card. It never forces a quiz and never blocks ordinary learning.
3. `Continue` starts or resumes one focused re-check. The re-check is capped at three learner responses and cannot recursively create another mentor notice.
4. A completed re-check ends with one of three outcomes: `locked_in`, `not_yet`, or `dismissed`. Only `locked_in` backed by validated learner evidence may produce mastery-flavoured copy. `not_yet` ends the current offer without claiming mastery; a future notice requires newly eligible evidence. `dismissed` is terminal and requires an explicit learner request to stop bringing the matter back.
5. `Not now` is not dismissal. It defers the notice for the current learning day. The notice may resurface quietly on a later learning day if it remains eligible.
6. An open notice with no activity for 21 days fades from active surfaces. Fading is quiet and terminal for that record; fresh evidence may create a later record.

### 3. In-app-only MVP and rollout

1. The MVP uses in-app surfaces only. It sends no mentor-notice push notification, notification primer, scheduled nudge, or background notification fan-out.
2. Rollout proceeds in two steps: internal QA, then availability to the full friendly-user MVP test group. Percentage cohorts and a separate rollout-control system are deferred until a public release needs them.
3. A server-owned feature flag is the operational kill switch. After the client has observed flag-off, no notice prompt, creation, projection, cached fallback, receipt, deep link, or mutation remains usable or visible. Flag-off preserves stored rows; normal retention and deletion rules continue to govern data. Re-enable exposes only records still eligible under current policy.

### 4. AI proposal and server-owned truth

1. The LLM may propose a bounded structured `noticed_gap` signal. It does not authorize a notice, choose a durable owner, or directly mutate state.
2. The MVP proposal contains a learner-safe concept, an optional correction hint, and a durable learner-answer evidence reference. It has no `topicId`. Any LLM-supplied quote is transient, untrusted validation input and is never persisted.
3. The server derives the learner, session, subject, and any ordinary-session topic from authenticated, server-owned records. It validates that the referenced learner answer belongs to the same learner and session before accepting the proposal.
4. Only a server-accepted transition may appear in an API response, SSE completion frame, persisted projection, or learner UI. Streaming prose must not promise a future re-check before acceptance.
5. Persistence stores only the minimum scrubbed learner-safe concept and correction context needed for the in-app experience. It does not store verbatim learner evidence, clinical or diagnostic labels, model reasoning, or model confidence.

### 5. One service boundary and one state machine

1. Streaming and non-streaming exchange completion call the same server-owned mentor-notice creation service.
2. That boundary owns feature eligibility, actor/subject authorization, evidence validation, attribution, idempotency, concurrency control, persistence, and the rejection result. Producers and consumers parse one canonical runtime contract at every event, API, and stream boundary.
3. Durable identity is evidence-aware and retry-safe. It must prevent duplicate creation for the same accepted evidence without making an entire source session the permanent uniqueness boundary for all future evidence.
4. Notice creation, offering, deferral, re-check completion, dismissal, fading, and flag-off projection rules form one centralized state machine. Clients request transitions and render server results; they do not invent lifecycle state optimistically.

## Consequences

- The dedicated mentor-notice store, server evidence validation, learner-only in-app surfaces, re-check lifecycle, 21-day fade, centralized creation boundary, and reversible feature flag remain useful foundations.
- Interleaved prompt eligibility and `noticed_gap.topicId` are removed from the MVP contract. Interleaved mentor notices require a later Product and Architecture decision.
- Existing mentor-notice push, notification scheduling, permission, dedup-budget, and send-race work is outside the MVP. It may be retained dormant or removed, but it is not an MVP delivery dependency and must not execute as though it were.
- Current code and tests must converge on homework plus ordinary learning, one visible actionable notice, a three-response re-check, learner-only authorization, minimal stored context, and a complete observed flag-off.
- Product testing can start without a sophisticated cohort system. Public release may require a separate rollout decision based on evidence from friendly-user testing.
- This decision does not retrospectively authorize the implementation changes that preceded it. It supplies the forward product and architecture contract against which retained code is reviewed, changed, or removed.

## Alternatives considered

1. **Keep mentor notices homework-only.** Rejected — ordinary learning sessions provide equally valid, server-attributable evidence and are part of the MVP learning relationship.
2. **Allow every session type, including interleaved.** Rejected for the MVP — interleaved attribution expands the shared AI contract and data identity before the simpler single-subject loop has been tested with users.
3. **Ship the existing optional push path.** Rejected for the MVP — in-app surfaces are sufficient to test the product value, while push adds permission, scheduling, privacy, deduplication, and concurrency work.
4. **Let the LLM choose attribution and lifecycle outcomes directly.** Rejected — model output is a proposal, not authority. Authentication, evidence, identity, persistence, and state transitions remain deterministic server responsibilities.
5. **Maintain separate streaming and non-streaming creation logic.** Rejected — duplicated trust boundaries drift and can accept different evidence or attribution under retry.
6. **Delete notice rows when the feature flag is disabled.** Rejected — flag-off is an operational rollback, not a retention action. Preserving rows makes rollback reversible while ordinary retention and deletion remain authoritative.

## Links

- `docs/PRD.md` — living product scope and learner-facing requirements.
- `docs/architecture.md` — living server-authority, contract, and state-machine rules.
- `docs/ux-design-specification.md` — living interaction pattern.
- `docs/specs/2026-07-19-homework-notice-felt-moments.md` — current operational MVP specification.
- `docs/_archive/plans/2026-07-21-mentor-notice-reconciliation/` — historical implementation plans from the pre-ratification work.
- `https://github.com/cognoco/eduagent-build/pull/2293` and `https://github.com/cognoco/eduagent-build/pull/2357` — historical implementation provenance.
