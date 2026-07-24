---
title: WI-2464 Operator-Ruling Completion — Implementation Plan
date: 2026-07-24
profile: code
work_items: [WI-2464]
status: done
---

# WI-2464 Operator-Ruling Completion — Implementation Plan

**Goal:** Make the Challenge simulator's offline evidence faithfully measure question repetition across a preceding lesson and the round.
**Approach:** Project fixture history through the same user-content sanitization and bounded recent-history rule as the production prompt path. Use explicit deterministic fixture annotations for the operator's semantic-equivalence definition; do not infer meaning from LLM prose or change Challenge persistence/supersession behavior.

## Scope

In scope:

- `apps/api/eval-llm/fixtures/challenge-personas.ts` — bounded preceding history and equivalence fixtures.
- `apps/api/eval-llm/runner/simulated-conversation.ts` — sanitized history projection and diagnostic classification.
- `apps/api/eval-llm/runner/simulation-metrics.ts` — equivalence-aware coverage metric.
- `apps/api/eval-llm/snapshots/challenge-round-mastery/*.md` and `apps/api/eval-llm/snapshots/exchanges/*S21-challenge-active.md` — deterministic prompt-drift evidence.
- Focused unit tests prompted by these changes.

Out of scope:

- Any live/provider-backed evaluator, credential, workflow, or network action.
- Partial-sample supersession (WI-2684) and three-question-canon/test-infrastructure work (WI-2685/WI-2701).

## Tasks

- [x] T1: Add a failing simulator test for bounded, ordered, sanitized preceding lesson history and no boundary duplication — done when: `simulated-conversation.test.ts` fails before the projection implementation and passes afterwards.
- [x] T2: Add failing Sylvia Plath equivalence/coverage tests for cosmetic paraphrase versus a genuinely new cognitive operation/context — done when: focused simulator and metrics tests fail before deterministic classification/aggregation and pass afterwards.
- [x] T3: Run the deterministic Tier-1 snapshot gate and touched-file static checks, then inspect the diff/check whitespace — done when: each command exits zero without `--live`, provider bootstrap, or network activity. The unfiltered runner completed all 513 snapshot renders but its sandbox-blocked post-run receipt write exited nonzero; the affected filtered Tier-1 snapshot runs exited zero.
