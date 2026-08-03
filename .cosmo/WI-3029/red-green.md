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
timeout thread (S6, routed to WI-3050) was intentionally left untouched;
the pinned-mentor provider-accounting thread (C1) is resolved below.

## Provider-accounting correction round (unresolved CodeRabbit thread PRRT_kwDORREiyc6Vyh_i)

`providerCallCount(input)` could not observe the optional pinned-mentor
context (`--openrouter-model`), so review-continuity-opener's judge call
(up to 10 additional `judgeOpenerFaithfulness()` calls when pinned) was
never counted by `deriveEnvelopeProviderDemandFromMatrix` NOR capped by
`runHarness` (which incremented its budget counter by exactly 1 per outer
`runLive()` call, regardless of any declared internal-call cost).

Fix — `providerCallCount` now accepts an explicit `ProviderCallContext`
(`{ openrouterModel }`), threaded from `index.ts`'s `options.openrouterModel`
through both `budget.ts`'s preflight derivation AND `runner.ts`'s own live
budget enforcement, rather than read from the `getOpenRouterModelOverride()`
mutable global (which isn't set yet at preflight time — the derivation runs
BEFORE `bootstrapLlmProviders()`). `review-continuity-opener.ts` now declares
`providerCallCount` returning 2 when pinned (opener + judge), 1 otherwise.
`runner.ts`'s live-call loop now reserves the DECLARED total cost per item
before any call and rejects up front when the remaining budget can't cover
it, so an insufficient cap skips the item without an outer or judge call
ever firing. `resolveEnvelopeLiveCallCap` and the `index.ts` preflight floor
check now use `max(sample-count budget, provider-call demand)`, never
auto-fitting or accepting an explicit cap below the actual context-aware
provider-call floor.

RED then GREEN, no live/paid provider call, for every behavior change:
- `budget.test.ts`: "reserves..." / boundary / pinned-vs-unpinned demand
  tests failed against the pre-fix code (old `resolveEnvelopeLiveCallCap`
  had no 3rd param at all; providerCallCount ignored context), passed after.
- `review-continuity-opener.test.ts`: new `providerCallCount` describe block
  (1 call unpinned, 2 pinned) — didn't exist before (the flow had no
  `providerCallCount` at all), passes now.
- `runner.test.ts`: new "provider-accounting correction" describe block —
  "reserves the declared provider-call cost per item" and "rejects an item
  before any outer/judge call" both failed against the pre-fix runner
  (`calls.count` was 3, not 2/1, because the old code counted 1/outer-call
  regardless of declared cost), passed after. A boundary (exact-fit) and a
  no-`providerCallCount`-regression case were added alongside and pass on
  both sides (proving the fix doesn't change unrelated behavior).
- `scripts/eval-live-gate-independence.test.ts`: "the envelope-flow drift
  gate is unchanged" failed (expected 366, workflow YAML still hardcoded
  362) until `.github/workflows/eval-live.yml`'s envelope-gate step was
  updated from `--max-live-calls 362` to `366` — the weekly gate's own
  explicit cap had drifted below its own documented provider-call demand
  and would have started silently truncating the weekly run. "omitted
  envelope cap is auto-fitted..." was updated to expect
  `max(configuredBudget, providerCalls)` = 366, not the raw 362 sample floor.

Manually verified (deterministic, `--list` / preflight-error paths only —
no bootstrap, no provider call):
```text
$ npx tsx apps/api/eval-llm/index.ts --list | grep Envelope
Envelope matrix demand: required=329 baseline=305 configured=362 headroom=33 (10%)
Envelope provider demand: outer=329 internal=37 total=366 (context: unpinned/production routing)

$ npx tsx apps/api/eval-llm/index.ts --list --openrouter-model openai/gpt-oss-120b | grep Envelope
Envelope matrix demand: required=329 baseline=305 configured=362 headroom=33 (10%)
Envelope provider demand: outer=329 internal=47 total=376 (context: mentor pinned via --openrouter-model=openai/gpt-oss-120b)

$ npx tsx apps/api/eval-llm/index.ts --live --only-envelope-flows --check-baseline --max-live-calls 364
Envelope matrix requires 329 samples plus 33 headroom calls (sample floor=362; baseline=305); context-aware provider-call demand is 366 calls (unpinned/production routing); supplied --max-live-calls=364 is below the effective floor of 366.

$ npx tsx apps/api/eval-llm/index.ts --live --only-envelope-flows --check-baseline --max-live-calls 370 --openrouter-model openai/gpt-oss-120b
Envelope matrix requires 329 samples plus 33 headroom calls (sample floor=362; baseline=305); context-aware provider-call demand is 376 calls (mentor pinned via --openrouter-model=openai/gpt-oss-120b); supplied --max-live-calls=370 is below the effective floor of 376.
```
Both error-path invocations exit 2 BEFORE `bootstrapLlmProviders()` — no
provider was ever reached. Unpinned demand (366) and pinned demand (376,
i.e. +10 for review-continuity-opener's 10 required samples) exactly match
the arithmetic this round set out to produce.

Final suite counts after this round:

```text
apps/api/eval-llm/runner/budget.test.ts: 9 passed, 9 total
apps/api/eval-llm/flows/review-continuity-opener.test.ts: 8 passed, 8 total
apps/api/eval-llm/runner/runner.test.ts: 19 passed, 19 total
apps/api/eval-llm/ (all): 27 suites, 321 passed, 9 skipped, 330 total
scripts/eval-live-gate-independence.test.ts: 14 passed, 14 total
```

`nx run api:typecheck` exit 0. `eslint` clean (0 errors; pre-existing-pattern
non-null-assertion warnings only). `pnpm run test:scripts`: 73 suites passed
(1 skipped), 1221 passed (4 skipped), 1225 total — unchanged.

## Adversarial correction round (fresh exact-head review, 0 MUST_FIX, 2 SHOULD_FIX)

A fresh independent adversarial review at head `39c7633cf449c44ee14da878feebc20beec49588`
confirmed the provider-accounting round correct on every axis it re-derived
(context threading, opener judge accounting, runner reservation, preflight
floor, filter consistency, error messages, type safety, regressions) and ran
6 targeted mutations, killing 5/6. The 2 SHOULD_FIX items — both proof/
consistency gaps, not runtime defects — are resolved below.

**SHOULD-1 — mutation M6 (`runner.ts:276` `openrouterModel: options.openrouterModel`
→ `undefined`) survived the full `eval-llm/runner/` + opener suite (14 suites,
182 tests, all green under the mutation).** Root cause: every existing
`providerCallCount` test fixture (`makeCostlyLiveFlow`) uses a FIXED cost
that ignores its `context` argument entirely, so no test could distinguish
"the runner passed the real `openrouterModel`" from "the runner silently
dropped it." Fix: added one new case to `runner.test.ts`'s "provider-accounting
correction" describe block using a flow whose `providerCallCount` mirrors
review-continuity-opener's real rule (`context.openrouterModel ? 2 : 1`),
run with `openrouterModel` set and a cap that only fits the pinned (2/item)
cost. RED (mutation applied, `openrouterModel: undefined` hardcoded):
`calls.count` was `3` (not `2`) — every item silently priced at 1 instead of
2, nothing skipped, no error, `--max-live-calls` overspent by exactly the
failure class this WI closes. GREEN after reverting the mutation: `calls.count`
is `2`, 1 item correctly skipped. Mutation applied and reverted via a single
paired `Edit`/`Edit` (no Bash `sed`); `git diff --stat apps/api/eval-llm/runner/runner.ts`
confirmed a byte-identical revert before proceeding.

**SHOULD-2 — `index.ts`'s `--list` block ignored `--flow`/`--profile`/`--scenarios`,
unlike the sibling preflight and post-run report blocks in the same file.**
Verified by direct CLI invocation (deterministic, `--list` only, no
bootstrap): `--list --flow review-continuity-opener --scenarios verbatim-solid`
reported the FULL unscoped matrix (`required=329 ... total=366`) instead of
the scoped one. Fix: reused the exact filter expressions already written
twice in `index.ts` (`FLOWS.filter(flow => !options.flowFilter || ...)`,
`PROFILES.filter(profile => !options.profileFilter || ...)`), and threaded
`scenarioFilter` into both derive calls — no new abstraction. RED: added
`scripts/eval-live-gate-independence.test.ts`'s new SHOULD-2 test (source-
pattern assertions on the `--list` block plus a numeric scoped-vs-full
comparison via the real derive functions) with the `--list` hunk of `index.ts`
temporarily reverted via `Edit`/`Edit` (not Bash) to its pre-fix content —
failed on the first source-pattern assertion (`FLOWS.filter(...flowFilter...)`
absent from the block). GREEN after restoring the fix: passes, and the same
scoped derivation now reports `required=1 ... total=1` for the exact
`--flow review-continuity-opener --scenarios verbatim-solid` repro from the
adversarial report, instead of the full 329/366.

Manually re-verified after the fix (deterministic, no bootstrap):
```text
$ npx tsx apps/api/eval-llm/index.ts --list --flow review-continuity-opener --scenarios verbatim-solid | grep -E "Envelope|review-continuity"
  review-continuity-opener  Review-Continuity Opener faithfulness (...)
Envelope matrix demand: required=1 baseline=10 configured=2 headroom=1 (10%)
Envelope provider demand: outer=1 internal=0 total=1 (context: unpinned/production routing)
  [review-continuity-opener] required=1 baseline=10
```

Final suite counts after this round:

```text
apps/api/eval-llm/runner/runner.test.ts: 20 passed, 20 total
apps/api/eval-llm/ (all): 27 suites, 322 passed, 9 skipped, 331 total
scripts/eval-live-gate-independence.test.ts: 15 passed, 15 total
```

`nx run api:typecheck` exit 0. `eslint` clean (0 errors; pre-existing-pattern
non-null-assertion warnings only). `pnpm run test:scripts`: 73 suites passed
(1 skipped), 1222 passed (4 skipped), 1226 total. No `--live`, no provider
bootstrap, no paid/live call, no deploy, no GitHub thread reply, no merge,
no Cosmo mutation at any point in this round.

## Mutation-hardening round (fresh exact-head adversarial review, 1 remaining SHOULD)

The prior round's SHOULD-2 test proved the `--list` block's filter
DEFINITIONS exist (that `scopedFlows`/`scopedProfiles` are built via a
proper `flowFilter`/`profileFilter` check), but only checked for the
`scenarioFilter: options.scenarioFilter` substring ANYWHERE in the block —
not that each derive CALL SITE actually consumes the scoped variables and
threads the filter. Independently reproduced the surviving mutation: with
`index.ts`'s `providerDemand` call reverted to raw `FLOWS`, `PROFILES`
(`budget`'s call left correctly scoped, so `scopedFlows`/`scopedProfiles`
stay referenced and `tsc`'s unused-local check cannot fire), the existing
SHOULD-2 test, `nx run api:typecheck --skip-nx-cache`, and `eslint` on
`index.ts` all stayed clean — confirming the finding. A prior, cruder
attempt (reverting BOTH derive calls, leaving `scopedFlows`/`scopedProfiles`
wholly unused) was tried first and DOES fail `tsc` (`TS6133: declared but
its value is never read`); the true survivor is the partial, single-call
revert described above, which keeps both variables referenced.

Fix: added call-site-anchored assertions to the SHOULD-2 test. The test now
slices the `listOnly` block down to each derive call's own text (from
`deriveEnvelopeBudgetFromMatrix(` / `deriveEnvelopeProviderDemandFromMatrix(`
to that call's own closing `);`) and asserts, independently per call, that
its first two arguments are literally `scopedFlows, scopedProfiles,` and
that its options object contains `scenarioFilter: options.scenarioFilter`.
The original block-wide filter-definition checks were kept alongside (they
still prove the scoped variables are built correctly; the new checks prove
both call sites actually use them).

RED/GREEN/mutation-and-revert proof, all via paired `Edit`/`Edit` on
`index.ts` (never Bash), `git diff --stat` confirming a byte-identical
revert before every subsequent step, no live/paid provider call at any
point:

- **Partial revert, `providerDemand` call only** (the confirmed real
  survivor): RED against the strengthened test — failed on the new
  `demandCall` argument-anchor assertion, received text showing
  `FLOWS,\n  PROFILES,` instead of `scopedFlows,\n  scopedProfiles,`.
  Reverted; GREEN restored.
- **Partial revert, `budget` call only** (the symmetric case): RED against
  the strengthened test — failed on the new `budgetCall` argument-anchor
  assertion. Reverted; GREEN restored.
- **`scenarioFilter` dropped from the `budget` call only** (third-party
  option object shrunk to just `baseline?.flows` positional arg, no options
  object at all): RED against the strengthened test — failed on the
  `budgetCall` scenarioFilter assertion. Reverted; GREEN restored.

All three mutations independently fail the strengthened test; all three
pass cleanly once reverted. `git diff --stat apps/api/eval-llm/index.ts`
confirmed empty (byte-identical to the committed state) before moving on to
full-suite verification.

Full verification after landing the strengthened test (no production code
changed in this round — only the test file):

```text
scripts/eval-live-gate-independence.test.ts: 15 passed, 15 total
pnpm run test:scripts: 73 suites passed (1 skipped), 1222 passed (4 skipped), 1226 total
apps/api/eval-llm/ (all): 27 suites, 322 passed, 9 skipped, 331 total
```

`nx run api:typecheck --skip-nx-cache` exit 0. `eslint` on `index.ts` and
`scripts/eval-live-gate-independence.test.ts`: 0 errors (1 pre-existing
non-null-assertion warning in `index.ts`, unrelated to this change). No
`--live`, no provider bootstrap, no paid/live call, no deploy, no GitHub
thread reply, no merge, no Cosmo mutation at any point in this round.

## AC-6 rework round (BID-31 shepherd, retained-run evidence — no paid run)

The item was rework-bounced on **AC-6** ("timeout-minutes and workflow
comments are re-verified against sequential demand and retained run
evidence; the chosen headroom and uncertainty are explicit"): the
`.github/workflows/eval-live.yml` comment stated an un-reverified,
alarming pre-retune claim (a flat 30-60s/call OpenRouter queue-spike rate
applied to all 643 calls, "5.4-10.7h") explicitly marked
"not re-verified against this raised 643 demand". BID-31 initially routed
this to an operator-gated paid-run wave (WI-3050); an independent evidence
review (`/home/vetinari/nexus/_WIP/orca-herdr-spike/findings/wi3029-ac6-timeout-verification-from-retained-run-evidence.md`)
argued AC-6's text asks for re-verification against *retained* run
evidence, not a new paid run, and that evidence already exists for free.
This round acted on that reading, using retained CI run `30721918215`
(2026-08-01T22:44Z, pre-retune head) — no `--live`, no provider bootstrap,
no paid call, no workflow dispatch at any point.

Retained-run facts verified independently via `gh` before writing anything
(not taken from the analysis note on faith):

```text
$ gh api repos/cognoco/eduagent-build/actions/jobs/91426988671 \
    | jq -r '.steps[] | "\(.number)\t\(.name)\t\(.started_at)\t\(.completed_at)"'
7   Tier-2 live evals + signal-drift check       2026-08-01T22:45:14Z  2026-08-01T22:59:13Z   (839s)
8   Teaching-session live gate (...)             2026-08-01T22:59:13Z  2026-08-01T23:03:44Z   (271s)
9   Mastery-simulation gate (...)                2026-08-01T23:03:44Z  2026-08-01T23:15:34Z   (710s)

$ gh run view 30721918215 --job 91426988671 --log | grep -niE "max-live-calls|Live calls OK|Live calls failed"
--max-live-calls 300   (envelope step)
Live calls OK:      298
Live calls failed:  2                                    # 298 + 2 = 300, budget exhausted exactly at cap
--flow teaching-session --max-live-calls 5   (teaching step)
Live calls OK:      5
Live calls failed:  0                                    # un-truncated
--max-live-calls 189 --runs 3   (mastery step, pre-retune stale cap)
[budget] requested 24 rounds but --max-live-calls=189 (~9 calls/round) caps at 21. 3 round(s) dropped.
```

These confirm the exact wall-clock durations, the envelope run's
budget-exhausted-at-cap behavior (300 attempted, matching the cap), and
the mastery run's round truncation (21 of 24 scheduled rounds) — the two
facts the projection's scaling ratios (`366/300` and `24/21`) are grounded
in.

RED: added a new deterministic test to
`scripts/eval-live-gate-independence.test.ts` (`[WI-3029 AC-6] timeout
re-verification projects each gate's retained-run wall clock onto CURRENT
demand, not a stale flat per-call spike rate`) asserting (a) the stale
`5.4-10.7h` / `30-60s/call` / "not re-verified against this raised 643
demand" language is gone, (b) the workflow cites the retained run id, (c)
the workflow's ratios and projected minutes/headroom exactly match values
this test derives from the CURRENT `deriveEnvelopeProviderDemandFromMatrix`
(366) and `deriveMasteryBudget` (24 rounds) against the retained run's
hardcoded historical denominators (300, 21), and (d) explicit uncertainty
language (single retained run, no P90, the 2 failed calls, queue/latency
variance) is present. Run against the pre-fix workflow comment:

```text
$ pnpm exec jest --config scripts/jest.config.cjs --no-coverage \
    scripts/eval-live-gate-independence.test.ts -t "AC-6"
FAIL — expect(workflowComments).not.toMatch(/5\.4-10\.7h/) — received string
  matching the pattern (the stale claim was still present)
Tests: 1 failed, 15 skipped, 16 total
```

GREEN: replaced the stale flat-rate-spike paragraph in
`.github/workflows/eval-live.yml`'s job-level comment with the gatewise
projection — envelope `839s × 366/300` + teaching `271s` (unscaled,
already un-truncated at today's cap) + mastery `710s × 24/21` ≈ 35.1 min,
~5.1× headroom under the unchanged 180-minute `timeout-minutes` — plus the
uncertainty paragraph (single run, no P90, the 2 failed envelope calls,
queue/latency variance, which numbers are freshly re-derived vs. read off
the one retained run). `timeout-minutes` itself was NOT changed (still
180) — this is a re-verification of the existing timeout, not a retune of
it.

```text
$ pnpm exec jest --config scripts/jest.config.cjs --no-coverage \
    scripts/eval-live-gate-independence.test.ts
Tests: 16 passed, 16 total

$ pnpm run test:scripts
Test Suites: 1 skipped, 74 passed, 74 of 75 total
Tests: 4 skipped, 1259 passed, 1263 total
(counts are higher than the prior round's 1221/1225 because this branch's
base is a later `main` than the prior round's, with unrelated test suites
landed in between — not attributable to this change, which touches only
the two files listed below. The 1 skipped suite was not individually
re-verified as the same pre-existing routing-suite skip in this round.)

$ nx run api:typecheck
Successfully ran target typecheck for project api and 5 tasks it depends on

$ npx eslint scripts/eval-live-gate-independence.test.ts
No issues found

$ node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/eval-live.yml','utf8'))"
parsed OK, timeout-minutes = 180
```

Diff scope: `.github/workflows/eval-live.yml` (comment block only, 26
insertions / 9 deletions — no `run:` step, cap, or `timeout-minutes` value
touched) and `scripts/eval-live-gate-independence.test.ts` (one new test,
89 lines added). No other file changed. No `--live`, no provider
bootstrap, no paid/live call, no workflow dispatch, no deploy, no Cosmo
lifecycle mutation (claim held by shepherd:codex:singles-lane throughout —
this round did not claim, complete, close, or merge the item), at any
point in this round.

## AC-6 review-fix round (adversarial review on PR #2909 at 5cdc8bb79, 1 MUST_FIX + 1 SHOULD_FIX)

An adversarial review of the prior round's commit (`5cdc8bb792b57b3049b9a5aa9bbb1bfc12d18469`,
PR #2909) returned NOT APPROVED with one MUST_FIX and one SHOULD_FIX. No
`--live`, no provider bootstrap, no paid/live call, no workflow dispatch,
no deploy, no Cosmo lifecycle mutation at any point in this round (claim
unchanged: shepherd:codex:singles-lane).

### M1 (MUST_FIX, proven mutation) — test hardcoded `timeout-minutes: 180`

The reviewer proved by mutation that
`scripts/eval-live-gate-independence.test.ts`'s AC-6 test computed
`headroomMultiple` against a hardcoded literal `180 * 60`, never reading
the workflow's ACTUAL `timeout-minutes:` field — mutating
`.github/workflows/eval-live.yml`'s `timeout-minutes: 180` to `20` still
left the suite green (16/16), because nothing in the test derived its
expected headroom from the parsed job.

Fix (test-first): added `loadJob`/`loadJobTimeoutMinutes` helpers that
parse `timeout-minutes` from the same YAML object `loadJobSteps` already
parses `steps` from (`scripts/eval-live-gate-independence.test.ts`), and
replaced `((180 * 60) / projectedTotalSeconds)` with
`((configuredTimeoutMinutes * 60) / projectedTotalSeconds)` where
`configuredTimeoutMinutes = loadJobTimeoutMinutes(...)`. Added a new
assertion binding the comment's stated timeout prose to that same parsed
value: `workflowComments` must match
`` `${configuredTimeoutMinutes}-minute\s+timeout-minutes` ``.

RED/GREEN/mutation-and-revert proof, via paired `Edit`/`Edit` on the
workflow YAML only (never Bash/`sed`), `git diff --stat` confirming a
byte-identical revert before moving on:

```text
# 1. Fixed code, unmutated workflow (timeout-minutes: 180) — GREEN, proving
#    the fix doesn't regress the passing case:
$ pnpm exec jest --config scripts/jest.config.cjs --no-coverage \
    scripts/eval-live-gate-independence.test.ts -t "AC-6"
Tests: 1 passed, 15 skipped, 16 total

# 2. Mutation applied (timeout-minutes: 180 -> 20, workflow prose
#    untouched) — RED, proving the fix now catches exactly the drift the
#    reviewer demonstrated:
$ pnpm exec jest --config scripts/jest.config.cjs --no-coverage \
    scripts/eval-live-gate-independence.test.ts -t "AC-6"
FAIL — expect(workflowComments).toContain(`~${headroomMultiple}×`) — the
  comment still says "~5.1×" (computed against the old 180) while the
  mutated headroomMultiple (against 20) is "~0.6×"
Tests: 1 failed, 15 skipped, 16 total

# 3. Mutation reverted (timeout-minutes: 20 -> 180):
$ git diff --stat .github/workflows/eval-live.yml | grep timeout-minutes
(no output — the timeout-minutes line is byte-identical to its pre-mutation
 state; only the intended S1 wording changes remain in the diff)

# 4. Reverted, fixed code — GREEN again:
$ pnpm exec jest --config scripts/jest.config.cjs --no-coverage \
    scripts/eval-live-gate-independence.test.ts
Tests: 16 passed, 16 total
```

### S1 (SHOULD_FIX) — 298+2=300 overclaimed a measured provider-call exhaustion; teaching scenario-drift hole

The reviewer verified that the retained run's `Live calls OK: 298` /
`Live calls failed: 2` summary counters count OUTER `runLive()`
invocations (the pre-retune `--max-live-calls` semantics), not total
provider calls — the current `366` provider-call demand includes internal
judge calls those counters never separately counted. The prior round's
wording ("298 ok + 2 failed = 300, budget exhausted exactly at the cap")
read as claiming a measured provider-call exhaustion, which it is not.

Fix: reworded the `.github/workflows/eval-live.yml` AC-6 paragraph to (a)
label 300 explicitly as the retained run's then-configured OUTER
`runLive()`-invocation cap, not a provider-call count; (b) state plainly
that internal judge calls were not separately counted by that cap or those
summary counters at the time; and (c) call the resulting `366/300` ratio a
"conservative scaling comparison against that denominator, not a
like-for-like measured provider-call rate" — the reviewer's own framing,
adopted verbatim rather than re-derived, since asserting a specific
direction/magnitude of bias would itself be an unverified claim. The
projection's arithmetic (`839s × 366/300`) is UNCHANGED — only the prose
around what `300` represents changed.

Scenario-drift hole (same round, flagged alongside S1): the teaching
term was previously "271s unscaled (already the full, un-truncated
current demand)" — a hardcoded claim that would go stale if
`TEACHING_SCENARIOS` or the workflow's teaching cap ever changed without
someone also editing this prose by hand. Fixed by expressing it as a
ratio, `271s × 5/5`, where the historical retained-run cap (5) stays a
cited constant (`RETAINED_TEACHING_CALLS_AT_CAP`) but the NUMERATOR is
`TEACHING_SCENARIOS.length` (`currentTeachingScenarios` in the test) —
today both equal 5 so the arithmetic is unchanged, but a future scenario-
count change now has to update this term or the test's
`` `${currentTeachingScenarios}/${RETAINED_TEACHING_CALLS_AT_CAP}` ``
assertion breaks.

RED (against the S1 wording added to the test, unmodified workflow prose)
then GREEN (after correcting the workflow paragraph), both via the full
AC-6 test:

```text
$ pnpm exec jest --config scripts/jest.config.cjs --no-coverage \
    scripts/eval-live-gate-independence.test.ts -t "AC-6"
FAIL — expect(workflowComments).toMatch(/outer runLive\(\) invocations/i)
  — the old wording ("298 ok + 2 failed = 300, budget exhausted exactly at
  the cap") never named outer invocations or "conservative scaling
  comparison"
Tests: 1 failed, 15 skipped, 16 total

# (several intermediate RED iterations, not individually shown, while
# tightening assertions to tolerate the YAML comment's own line-wrapping —
# e.g. a case-sensitive "outer runLive() invocations" match, then
# "conservative scaling" / "\n" / "comparison" needing \s+, then the
# "180-minute" / "\n" / "timeout-minutes" toContain needing a regex, then
# "2" / "\n" / "failed" needing \s+ — each was a test-assertion adjustment
# to the SAME production-code fix, not a new production-code gap)

$ pnpm exec jest --config scripts/jest.config.cjs --no-coverage \
    scripts/eval-live-gate-independence.test.ts
Tests: 16 passed, 16 total
```

### Full verification after both fixes

```text
$ pnpm run test:scripts
Test Suites: 1 skipped, 74 passed, 74 of 75 total
Tests: 4 skipped, 1259 passed, 1263 total
(identical counts to the prior round's re-run on this same branch base —
no test-count drift this round.)

$ nx run api:typecheck --skip-nx-cache
Successfully ran target typecheck for project api and 5 tasks it depends on

$ npx eslint scripts/eval-live-gate-independence.test.ts
No issues found

$ node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/eval-live.yml','utf8'))"
parsed OK, timeout-minutes = 180
```

Diff scope this round: `.github/workflows/eval-live.yml` (comment
wording only — `timeout-minutes` confirmed still 180, no `run:` step or
cap touched) and `scripts/eval-live-gate-independence.test.ts` (the AC-6
test strengthened; `loadJobSteps` refactored onto a new shared `loadJob`
helper with no behavior change for existing callers). No other product
file changed. `.cosmo/WI-3029/workitem.json` (a fetched claim snapshot)
remains deliberately uncommitted. No Cosmo lifecycle mutation, no merge,
at any point in this round.
