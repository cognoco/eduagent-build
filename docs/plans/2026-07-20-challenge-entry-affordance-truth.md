# Challenge Entry and Affordance-Truth Plan

> Status: implemented and verified in the WI-2351 worktree; not yet landed
> Profile: code
> Work item: WI-2351 — Decide immediate Challenge-Round entry for `challenge.start` deep links

## Decision

Do **not** add an immediate Challenge-entry endpoint and do not force the
Challenge state machine from a Now-card tap.

The existing `challenge_ready` Now projection uses
`getAssessmentEligibleTopics()`, whose contract is only “a topic had a completed
session with enough exchanges in the last 30 days.” The real server-owned gate
is `evaluateChallengeReadiness()`: learning session, normal struggle state,
minimum exchanges, correct streak, solid-answer evidence, remaining quota,
cooldown, and no live Challenge Round. The projection cannot prove those
conditions, so “Start challenge” is a false affordance.

Until Now can derive that exact gate or resume a round already offered inside
an eligible session, suppress `challenge_ready` at feed composition. Challenge
Round remains an organically offered, topic-bound in-session flow.

## ADR reconciliation

- **MMT-ADR-0022 — activity feed derive-on-read:** Now actions must derive from
  authoritative operational truth. Completed-session history is not
  authoritative Challenge-readiness state.
- **MMT-ADR-0021 — freeform boundary:** Challenge remains topic-bound; this
  change creates no hidden topic or freeform entry path.
- **MMT-ADR-0014 / MMT-ADR-0016 — routing and judge architecture:** no new LLM
  route, prompt, provider selection, grader path, or envelope path is added.
- **MMT-ADR-0017 / MMT-ADR-0031 / MMT-ADR-0032 — concept evidence, mastery
  axes, and verified artifacts:** the existing conservative evidence and
  provenance contracts remain untouched.
- **MMT-ADR-0034 — proposed micro re-prove path:** it is explicitly non-canon,
  but its Context accurately documents the current protective struggle gate.
  The implementation follows the current code/accepted canon, not the proposed
  recovery design.

## Tasks

1. Remove `collectChallengeReadyCandidates()` from live Now feed composition.
2. Keep the lower-level collector unchanged; it is pre-existing code with
   dedicated authorization/race tests and may support a future truthful
   projection after an explicit design.
3. Add DB-backed regression coverage showing completed-session history can
   still produce honest unfinished/deepening/parked cards but never a
   `challenge_ready` card.
4. Preserve the Sylvia Plath runtime diagnosis and simulator reproduction in
   the affordance audit.
5. Verify the affected Now unit/integration suites, API typecheck/lint, i18n,
   and repository change-class routing.

## Verification

- Full API unit suite: 8,300 passed, 9 skipped, 0 failed.
- Now unit surface: 24 passed, 0 failed.
- DB-backed Now integration suite: 12 passed, 0 failed.
- API typecheck and affected-file lint: passed.
- `git diff --check`: passed.

## Non-goals

- Changing Challenge prompts, question novelty, grading, mastery, or notes.
- Adding a new pre-session Challenge-readiness model.
- Relaxing or bypassing `evaluateChallengeReadiness()`.
- Changing the organic offer/accept flow.
- Removing the schema/card vocabulary in the same change.

## Follow-ups

- WI-2464 — Prevent Challenge Round question repetition and expose tutor
  failures in the simulator.
- WI-2505 — Align Now `Review` / `Work on it` CTAs with their terminal actions.
- A future direct Challenge entry needs an accepted product/architecture
  decision defining durable readiness, expiry, quota reservation, cooldown,
  struggle handling, and how the entry proves the same gate at execution time.
