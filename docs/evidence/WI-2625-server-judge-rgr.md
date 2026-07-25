# WI-2625 — mentor-notice recheck server-judge red/green/revert evidence

Independent server-side judge for mentor-notice re-check verdicts,
replacing the prior design where the producing tutor model self-reported
`signals.notice_recheck`. This report captures a genuine red→green→revert→
restore sequence against the property the WI exists to fix: judge
independence from the producing tutor model.

Commands ran from
`/Users/vetinari/nexus/_dev/eduagent-build/.worktrees/wi-2625-server-judge`
on branch `wi-2625-server-judge`, rebased onto `origin/main` at
`99478f153a0a025b1d2436ada72ec8b5224bca73`.

## The property under test

`evaluateMentorNoticeRecheck` (`apps/api/src/services/mentor-notices/recheck-judge.ts`)
must route the judge call with `judgeIndependence.producerVendor` set to the
**real vendor that produced this turn's tutor reply** (`input.tutorVendor`,
threaded from `result.provider` at both `session-exchange.ts` call sites).
This is the router-level guarantee (`JUDGE_VENDOR_ORDER` in
`services/llm/router.ts`) that the judge is never selected from the same
vendor family as the producer — the mechanism that makes the judge
*independent*, which is the entire point of WI-2625 (moving the verdict off
the self-reporting producer).

`recheck-judge.test.ts`'s `'routes with the judge flow, JSON format, and a
model-output judgeIndependence naming the real tutor producer'` test asserts
this directly: it calls `evaluateMentorNoticeRecheck` with
`tutorVendor: 'cerebras'` and checks the `routeAndCall` call's
`judgeIndependence` option matches `{ mode: 'model-output', producerVendor:
'cerebras' }`.

## RED — inject the defect

Reverted line — `apps/api/src/services/mentor-notices/recheck-judge.ts`,
inside `evaluateMentorNoticeRecheck`'s `routeAndCall` options:

```diff
       judgeIndependence: {
         mode: 'model-output',
-        producerVendor: input.tutorVendor,
+        producerVendor: 'anthropic', // RGR-DEFECT-INJECT: hardcoded, ignores the real tutor producer
       },
```

Command:

```
DATABASE_URL="postgresql://localhost:5432/dummy_unit_test_placeholder" \
  pnpm exec nx run api:test --testPathPatterns=recheck-judge.test.ts --skip-nx-cache
```

Result: **1 failed, 12 passed, 13 total**.

```
    expect(options).toMatchObject({
                     ^
      capability: 'judge',
      flow: JUDGE_MENTOR_NOTICE_RECHECK_FLOW,
      responseFormat: 'json',
      ...
    at Object.<anonymous> (apps/api/src/services/mentor-notices/recheck-judge.test.ts:147:21)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 12 passed, 13 total
```

The failing test is exactly `'routes with the judge flow, JSON format, and a
model-output judgeIndependence naming the real tutor producer'` — confirming
the test detects a hardcoded/wrong producer vendor, i.e. it detects the
producer-independence property breaking.

## GREEN — restore

```diff
       judgeIndependence: {
         mode: 'model-output',
-        producerVendor: 'anthropic', // RGR-DEFECT-INJECT: hardcoded, ignores the real tutor producer
+        producerVendor: input.tutorVendor,
       },
```

Same command, same file:

```
Tests:       13 passed, 13 total
Test Suites: 1 passed, 1 total
```

## Config-diff confirmation

```
$ git diff --stat apps/api/src/services/mentor-notices/recheck-judge.ts
```

Empty output — the restore is byte-identical to the pre-injection state, no
residual config or code drift.

## A second, real defect found and fixed along the way (not the RGR line, but load-bearing)

While auditing the inherited implementation before this RGR pass, the same
test file already caught a genuine bug, independently of any injected defect:
`resolveOutcome()` defined an `ACCEPTED_PAIRS` map (AC-3's "only these five
exact verdict/reason pairs are valid") but never consulted it — a
self-contradicting judge response like `{verdict: "locked_in", reason:
"insufficient"}` resolved to `locked_in` anyway, because `resolveOutcome`
only validated `verdict` in isolation. The inherited test `'rejects a
mismatched verdict/reason pair as malformed (fail-open null)'` was already
failing before any RGR injection — this was live, unverified prior-builder
work, not a proof exercise. Fixed by checking `ACCEPTED_PAIRS[raw.verdict] ===
raw.reason` before accepting the outcome (commit `290c3afb8`). This is
reported here because it is the same file and the same "does the judge's
malformed/contradictory output actually get rejected" property class as the
RGR case above, but it is a distinct commit, not part of this RGR sequence.

## Live-eval verification (AC-7)

Independently of the above, `apps/api/eval-llm/flows/recheck-judge.ts` runs
the real production prompt builder (`buildJudgePrompt`) against a live model
(`doppler run -- pnpm eval:llm -- --flow recheck-judge --live`) across six
scenarios — one per accepted verdict/reason pair, an off-topic "continue"
case, and a prompt-injection case asserting the fence holds. All six passed
against `claude-sonnet-4-6` in this run (see the flow file's header comment
and commit `452ec0ae1` for detail); Tier-1 snapshots are checked in.
