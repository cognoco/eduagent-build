# WI-3029 red-green evidence

## Red

Before the budget helpers existed, the three new deterministic suites were run
with:

```text
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --no-coverage apps/api/eval-llm/runner/budget.test.ts apps/api/eval-llm/runner/coverage.test.ts apps/api/eval-llm/runner/sim-budget.test.ts
```

Result: 3 suites failed at module resolution because `./budget`, `./coverage`,
and `./sim-budget` did not exist. No provider or paid/live command was run.

## Green

The helper suites then passed 5/5 tests. The focused runner/gate suite passed
150 tests (9 skipped), and the workflow contract passed 14/14 tests. TypeScript
API typecheck passed with exit 0.

The deterministic dry-run reported:

```text
Envelope matrix demand: required=329 baseline=305 configured=362 headroom=33 (10%)
Budget for runs=3: configured=216 units; expected-provider-calls=192; no truncation
```

The no-provider mastery preflight was tested with `--max-live-calls 215` and
exited 1 before bootstrap/provider work:

```text
mastery grid requires 216 configured units and estimates 192 expected provider calls; --max-live-calls=215 is insufficient
```

No live eval, paid provider call, workflow dispatch, deploy, or environment
mutation was performed.

## Review regressions

Red review tests first failed because the provider-demand and omitted-cap
helpers were not exported. Green review verification then passed:

```text
apps/api/eval-llm/runner/budget.test.ts: 5 passed
scripts/eval-live-gate-independence.test.ts: 14 passed
```

The executable envelope flow contract derives `329` outer invocations plus
`31` legitimate-sensitive safety judges and `6` language-quality judges for
`366` sequential provider calls. The omitted-cap contract resolves the
envelope configured cap before `bootstrapLlmProviders()` and before
`runHarness`, so the runner's default `20` cannot be reached.

The mastery reproduce-capacity regression derives `216 - 192 = 24` remaining
calls and `floor(24 / 8) = 3` rounds for one offender. This makes the existing
single-offender three-round requalification path reachable; changing these
budget numbers changes gate strictness, not just cost.
