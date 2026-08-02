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

The helper suites then passed 10/10 tests. The focused runner/gate suite
passed 148 tests (9 skipped, 157 total), and the workflow contract passed
14/14 tests. TypeScript API typecheck passed with exit 0.

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
apps/api/eval-llm/runner/budget.test.ts: 5 passed (now 6 passed — see the
  CodeRabbit follow-up round below)
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

## Correction round (independent review #3 — SHOULD_FIX S1-S6)

Behavioral fixes verified RED then GREEN, no live/paid provider call:

- **S3/S4 coverage gate** (`gates.ts`, `coverage.ts`, `runner.ts`): added
  `FlowCoverage.required` (a flow's `countEnvelopeFlowSamples` demand),
  eagerly seeded per active envelope flow so a flow that never reaches a
  single live-call attempt still reports coverage; dropped the
  `baseline.flows[flowId] &&` guard in `gates.ts` so an incomplete flow not
  yet in `baseline.json` still fails the run. RED: `coverage.test.ts`'s new
  "attempted never reaches required" case failed (`complete: true` instead of
  `false`); `gates.test.ts`'s new "flow ABSENT from baseline.flows" case
  failed (`exitCode 0` instead of `1`). GREEN after the fix: both pass — see
  full suite counts below.
- **S5 update-baseline coverage guard** (`gates.ts`, `index.ts`): the
  `--update-baseline` path now fails (loud message + non-zero exit) when any
  envelope flow's coverage is incomplete, even with zero quality/execution
  failures; `index.ts`'s existing seed-path guard (which only caught an
  EMPTY flow) now also refuses to write `baseline.json` at all when a
  required flow's coverage is incomplete. RED: `gates.test.ts`'s new
  "--update-baseline with incomplete coverage ... still fails loud" case
  failed (`exitCode 0`). GREEN after the fix: passes, plus a companion
  "complete coverage exits 0" case guards against a false-positive.

Final suite counts after the correction round (`pnpm exec jest --config
apps/api/jest.config.cjs --runInBand --no-coverage`) — superseded by the
CodeRabbit follow-up round's counts immediately below:

```text
apps/api/eval-llm/runner/{budget,coverage,sim-budget}.test.ts: 15 passed, 15 total
apps/api/eval-llm/runner/: 13 suites, 157 passed, 9 skipped, 166 total
apps/api/eval-llm/ (all): 27 suites, 311 passed, 9 skipped, 320 total
scripts/eval-live-gate-independence.test.ts: 14 passed, 14 total
```

`nx run api:typecheck` exit 0. `pnpm run test:scripts`: 73 suites passed (1
skipped), 1221 passed (4 skipped), 1225 total — unchanged from the prior
round (`scripts/api-integration-routing.test.ts` still passes 10/10 locally;
its CI red is the pre-existing external `main`-side AGENTS.md pin break,
untouched by this PR, per the independent review's §0).

## CodeRabbit follow-up round (two verified quick fixes)

Behavioral fix verified RED then GREEN, no live/paid provider call:

- **`deriveEnvelopeProviderDemandFromMatrix` scenario-filter leak**
  (`runner/budget.ts`): the non-enumerated-flow branch synthesized
  `scenarioId: flow.id` and exposed it to `options.scenarioFilter`, so a
  `--scenarios` filter that didn't happen to include a flow's own id as a
  literal string zeroed out that flow's provider demand — diverging from
  both the runner (`runner.ts`, which never scenario-filters non-enumerated
  flows) and `countEnvelopeFlowSamples` (same). RED:
  `budget.test.ts`'s new "scenarioFilter that excludes a non-enumerated
  flow's own id still counts that flow" case failed
  (`outerRunLiveCalls: 0, providerCalls: 0` instead of `1, 1`). GREEN after
  restructuring the loop to only scenario-filter inside the
  `flow.enumerateScenarios` branch.

Test-correctness fix (the test's own detection gap, verified by injecting a
duplicate registry entry, not a production-code RED/GREEN):

- **`scripts/eval-live-gate-independence.test.ts`'s "full flow registry
  preserves the pre-budget runtime order"** only checked that 39 named flows'
  string positions in the source text were monotonically increasing — it
  never compared the total membership, so an extra/duplicate/unlisted entry
  anywhere in `FLOWS` passed silently. Demonstrated by temporarily appending
  a duplicate `learningTextSafetyJudgeFlow` to `flow-registry.ts`'s array:
  the OLD test still passed (proving the blind spot); the fix — parsing
  every `^  (\w+),$` match from the array body and asserting exact array
  equality against the expected list — failed against the same injected
  duplicate (`toEqual` diff showed the extra entry). The injected duplicate
  was then reverted (`git diff --stat` confirmed a clean revert) and the
  fixed test passes 14/14 against the real, unmodified registry.

Final suite counts after this round:

```text
apps/api/eval-llm/runner/budget.test.ts: 6 passed, 6 total
apps/api/eval-llm/ (all): 27 suites, 312 passed, 9 skipped, 321 total
scripts/eval-live-gate-independence.test.ts: 14 passed, 14 total
```

`nx run api:typecheck` exit 0. `pnpm run test:scripts`: 73 suites passed (1
skipped), 1221 passed (4 skipped), 1225 total — unchanged. The separate
timeout and pinned-mentor provider-accounting threads (S6 and C1 from the
prior round) were intentionally left untouched per this round's scope — the
shepherd is handling those as scope/reroute decisions.
