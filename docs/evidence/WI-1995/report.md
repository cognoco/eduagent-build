# WI-1995 — malformed Challenge signal evidence

Date: 2026-07-20

## Root cause and correction

Nested signal validation was coupled to the whole LLM envelope. A malformed
`challenge_round_evaluation` item therefore discarded the learner-visible
reply and unrelated signals. Recovering individual valid items was also
unsafe: incomplete evidence could look mastery-worthy. The corrected schema
enforces the unchanged ten-item limit first, then validates the bounded array
as one unit and degrades that entire signal to `undefined` on any malformed
item. A missing or wrong-type `evaluate_assessment.challenge_passed` likewise
degrades only that verdict, while the API's existing boolean guard continues
to deny mastery.

No prompt or external-contract file is changed by this work item.

## Executed RED → GREEN

The named whole-signal regression was first run against an item-by-item
recovery candidate:

```bash
pnpm exec jest --config packages/schemas/jest.config.cjs packages/schemas/src/llm-envelope.test.ts --runInBand --no-coverage -t 'drops the whole challenge evaluation when any item is malformed'
```

RED exited 1 because the received value retained the valid survivor instead
of being `undefined`. After moving recovery to the whole signal, the command
exited 0.

An independent adversarial review then combined malformed-input recovery with
the unchanged maximum and found that ten valid items plus one malformed item
could bypass the cap. The named boundary case was added first:

```bash
pnpm exec jest --config packages/schemas/jest.config.cjs packages/schemas/src/llm-envelope.test.ts --runInBand --no-coverage -t 'rejects an over-cap evaluation even when one item is malformed'
```

RED exited 1 with `Expected: false` and `Received: true`. The maximum gate was
moved ahead of strict item parsing, after which the boundary case and the
whole-signal case both exited 0.

For the production-revert check, only the final
`challenge_round_evaluation` recovery was temporarily restored to the prior
strict array schema. The whole-signal command exited 1 because envelope
parsing returned `success: false`. Restoring the production change made the
same command exit 0. This isolates the regression test's dependency on the
production correction.

## Acceptance-criteria mapping

- AC-1 — named schema cases preserve the exact reply and sibling signals when
  `challenge_passed` is missing or wrong-type, preserve a valid boolean, and
  the named API case proves an absent verdict yields no evaluation/mastery.
- AC-2 — the direct provenance-item schema still rejects missing
  `answerEventId` and missing `learnerQuote`; the named whole-signal case proves
  one malformed item drops the complete Challenge evaluation. Named valid,
  over-cap, and mixed malformed/over-cap cases exercise both guarantees.
- AC-3 — the diff contains no prompt files. The deterministic LLM harness was
  executed before integration and produced no snapshot diff. After rebasing
  onto newer `main`, the harness reflected an unrelated source-identity rule
  already added upstream; those generated snapshot changes were inspected and
  excluded from this work item.

## Final verification on current main

```bash
pnpm exec jest --config packages/schemas/jest.config.cjs packages/schemas/src/llm-envelope.test.ts --runInBand --no-coverage
pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/evaluate.test.ts --runInBand --no-coverage
pnpm exec nx run api:typecheck --skip-nx-cache
pnpm exec eslint packages/schemas/src/llm-envelope.ts packages/schemas/src/llm-envelope.test.ts apps/api/src/services/evaluate.ts apps/api/src/services/evaluate.test.ts
pnpm exec prettier --check packages/schemas/src/llm-envelope.ts packages/schemas/src/llm-envelope.test.ts apps/api/src/services/evaluate.ts apps/api/src/services/evaluate.test.ts
git diff --cached --check
```

Each command exited 0. The schema suite exercised 104 cases and the API suite
exercised 34 cases. Typechecking covered the API and its five dependencies.
The emitted `MaxListenersExceededWarning` did not fail a typecheck task.

The final test diff contains no internal production-module mocks (GC6
deferral: none). A token/private-key shape scan of the staged diff returned no
matches; no environment or configuration values were recorded.
