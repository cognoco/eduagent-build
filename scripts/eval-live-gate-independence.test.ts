// [WI-2461] Workflow-contract regression: the weekly Live LLM Evals workflow
// (.github/workflows/eval-live.yml) must run THREE independent live quality
// gates — envelope-flow drift, teaching-session, and mastery-simulation — and
// the PR-facing API Quality Gate must treat the deterministic
// simulation-baseline validation as blocking.
//
// The pre-fix workflow this test is red against:
//   - had NO dedicated teaching-session gate at all: its only live step ran
//     `--only-envelope-flows`, which filters to flows with emitsEnvelope:true
//     (apps/api/eval-llm/runner/runner.ts flow filter), and teaching-session
//     deliberately does not emit the envelope — so the core tutoring-quality
//     flow was silently excluded from the weekly run;
//   - ran the envelope and mastery-simulation steps as plain sequential steps,
//     so a failure in the first stopped the job before the mastery gate ever
//     executed (the gates were not independent);
//   - api-quality-gate.yml carried `continue-on-error: true` on the
//     deterministic simulation-baseline validation even after
//     apps/api/eval-llm/simulation-baseline.json was seeded and committed.
//
// Independence contract encoded here: the teaching + mastery gate steps carry
// an `if:` that (a) still runs after an earlier step FAILED (`!cancelled()`)
// and (b) skips when setup never completed (`steps.doppler.outcome ==
// 'success'` — steps run in order, so a successful Doppler install implies
// checkout/pnpm/node setup all succeeded). No gate uses continue-on-error, so
// any genuine gate failure still fails the job's overall conclusion.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

import { TEACHING_SCENARIOS } from '../apps/api/eval-llm/fixtures/teaching-scenarios';
import { CHALLENGE_SIM_SCENARIOS } from '../apps/api/eval-llm/fixtures/challenge-personas';
import { MAX_CHALLENGE_QUESTIONS } from '../apps/api/src/services/challenge-round/caps';
import { PROFILES } from '../apps/api/eval-llm/fixtures/profiles';
import { ENVELOPE_FLOWS } from '../apps/api/eval-llm/envelope-flow-registry';
import { FLOWS } from '../apps/api/eval-llm/flow-registry';
import { safetyProbesFlow } from '../apps/api/eval-llm/flows/safety-probes';
import {
  deriveEnvelopeBudgetFromMatrix,
  deriveEnvelopeProviderDemandFromMatrix,
  resolveEnvelopeLiveCallCap,
} from '../apps/api/eval-llm/runner/budget';
import { parseCliArgs } from '../apps/api/eval-llm/runner/runner';
import { parseBaseline } from '../apps/api/eval-llm/runner/metrics';
import { deriveMasteryBudget } from '../apps/api/eval-llm/runner/sim-budget';

interface WorkflowStep {
  name?: string;
  id?: string;
  if?: string | boolean;
  run?: string;
  'continue-on-error'?: boolean;
  with?: { script?: string };
}

const repoRoot = join(__dirname, '..');

interface WorkflowJob {
  steps?: WorkflowStep[];
  'timeout-minutes'?: number;
}

function loadJob(workflowPath: string, jobId: string): WorkflowJob {
  const workflow = parse(
    readFileSync(join(repoRoot, workflowPath), 'utf8'),
  ) as {
    jobs?: Record<string, WorkflowJob>;
  };
  const job = workflow.jobs?.[jobId];
  if (!job?.steps) {
    throw new Error(`No steps found for job "${jobId}" in ${workflowPath}`);
  }
  return job;
}

function loadJobSteps(workflowPath: string, jobId: string): WorkflowStep[] {
  return loadJob(workflowPath, jobId).steps!;
}

// [WI-3029 AC-6 SHOULD-1/CONSIDER] Guards a numeric literal against
// superset/incidental substring matches: numBoundary(366) matches the "366"
// in "366/300" but NOT the "366" inside "3660" or "13660", and
// numBoundary(80) does NOT match the "80" inside "180". Plain `toContain`
// on a bare ratio string (e.g. "366/300") would still pass if the workflow
// actually said "366/3000" or "24/210" (superset) or if the digits appeared
// incidentally elsewhere unrelated to the gate expression they're meant to
// pin — this closes both holes.
function numBoundary(n: number): string {
  return `(?<!\\d)${n}(?!\\d)`;
}

// [WI-3029 AC-6 M1] The configured timeout-minutes MUST be read from the
// same parsed YAML the steps come from, never hardcoded — a hardcoded
// literal in the test can drift from the workflow's actual timeout-minutes
// without either side noticing (proven by mutation: changing timeout-minutes
// alone left the pre-fix version of this suite green).
function loadJobTimeoutMinutes(workflowPath: string, jobId: string): number {
  const timeoutMinutes = loadJob(workflowPath, jobId)['timeout-minutes'];
  if (typeof timeoutMinutes !== 'number') {
    throw new Error(
      `Job "${jobId}" in ${workflowPath} must configure timeout-minutes`,
    );
  }
  return timeoutMinutes;
}

function deriveWorkflowMasteryBudget(step: WorkflowStep) {
  const runs = step.run?.match(/--runs (\d+)/);
  if (!runs) throw new Error('Mastery workflow step must configure --runs');
  return deriveMasteryBudget({
    scenarioCount: CHALLENGE_SIM_SCENARIOS.length,
    runs: Number(runs[1]),
    questionsPerRound: MAX_CHALLENGE_QUESTIONS,
  });
}

describe('eval-live.yml — three independent live gates (WI-2461)', () => {
  const steps = loadJobSteps('.github/workflows/eval-live.yml', 'live-evals');
  const envelopeStep = steps.find((s) =>
    s.run?.includes('--only-envelope-flows'),
  );
  const teachingStep = steps.find((s) =>
    s.run?.includes('--flow teaching-session'),
  );
  const masteryStep = steps.find((s) => s.run?.includes('eval:llm:sim'));

  test('the envelope-flow drift gate is unchanged (live + baseline check, envelope-only scope)', () => {
    expect(envelopeStep).toBeDefined();
    expect(envelopeStep!.run).toContain('--live');
    expect(envelopeStep!.run).toContain('--check-baseline');
    const cap = envelopeStep!.run!.match(/--max-live-calls (\d+)/);
    expect(cap).not.toBeNull();
    const baseline = parseBaseline(
      readFileSync(join(repoRoot, 'apps/api/eval-llm/baseline.json'), 'utf8'),
    );
    expect(baseline).not.toBeNull();
    const budget = deriveEnvelopeBudgetFromMatrix(
      ENVELOPE_FLOWS,
      PROFILES,
      baseline!.flows,
    );
    // [WI-3029 provider-accounting correction] The weekly step is unpinned
    // (no --openrouter-model), so its provider-call demand (366) exceeds the
    // sample-count floor (362) purely from internal judges — the workflow's
    // explicit --max-live-calls must track the LARGER, context-aware
    // provider-call floor, not the raw sample count, or the weekly gate would
    // start truncating its own run every week.
    const providerDemand = deriveEnvelopeProviderDemandFromMatrix(
      ENVELOPE_FLOWS,
      PROFILES,
    );
    expect(Number(cap![1])).toBe(
      Math.max(budget.configuredBudget, providerDemand.providerCalls),
    );

    const evidence = readFileSync(
      join(repoRoot, '.github/workflows/eval-live.yml'),
      'utf8',
    ).match(
      /baseline=(\d+) and required=(\d+) samples; its 10% headroom configures (\d+)/,
    );
    expect(evidence).not.toBeNull();
    expect(Number(evidence![1])).toBe(budget.baselineSamples);
    expect(Number(evidence![2])).toBe(budget.requiredSamples);
    expect(Number(evidence![3])).toBe(budget.configuredBudget);
  });

  test('hand-maintained envelope registry matches the runtime envelope subset', () => {
    expect(ENVELOPE_FLOWS.map((flow) => flow.id)).toEqual(
      FLOWS.filter((flow) => flow.emitsEnvelope).map((flow) => flow.id),
    );
  });

  test('mastery cap is derived from the workflow run count and server question cap', () => {
    expect(masteryStep).toBeDefined();
    const budget = deriveWorkflowMasteryBudget(masteryStep!);
    const cap = masteryStep!.run!.match(/--max-live-calls (\d+)/);
    expect(cap).not.toBeNull();
    expect(Number(cap![1])).toBe(budget.configuredUnits);
  });

  test('workflow keeps heterogeneous gate caps separate from comparable provider demand', () => {
    const workflow = readFileSync(
      join(repoRoot, '.github/workflows/eval-live.yml'),
      'utf8',
    );
    const providerDemand = deriveEnvelopeProviderDemandFromMatrix(
      ENVELOPE_FLOWS,
      PROFILES,
    );
    const masteryBudget = deriveWorkflowMasteryBudget(masteryStep!);
    const teachingProviderCalls = TEACHING_SCENARIOS.length * 17;
    const workflowComments = workflow.replace(/^\s*#\s?/gm, '');
    const providerEvidence = workflowComments.match(
      /Envelope provider demand:\s+(\d+) outer runLive invocations\s+\+ (\d+) internal judge\s+calls \((\d+) legitimate_sensitive safety probes \+ (\d+) language-quality samples\)\s*=\s*(\d+) provider calls/,
    );
    expect(providerEvidence).not.toBeNull();
    expect(Number(providerEvidence![1])).toBe(providerDemand.outerRunLiveCalls);
    expect(Number(providerEvidence![2])).toBe(
      providerDemand.internalProviderCalls,
    );
    expect(Number(providerEvidence![3])).toBe(
      providerDemand.flows['safety-probes'].internalProviderCalls,
    );
    expect(Number(providerEvidence![4])).toBe(
      providerDemand.flows['language-quality'].internalProviderCalls,
    );
    expect(Number(providerEvidence![5])).toBe(providerDemand.providerCalls);
    const totalEvidence = workflowComments.match(
      /provider demand is (\d+) \+ (\d+) \+ (\d+) = (\d+)/,
    );
    expect(totalEvidence).not.toBeNull();
    expect(Number(totalEvidence![1])).toBe(providerDemand.providerCalls);
    expect(Number(totalEvidence![2])).toBe(teachingProviderCalls);
    expect(Number(totalEvidence![3])).toBe(masteryBudget.expectedProviderCalls);
    expect(Number(totalEvidence![4])).toBe(
      providerDemand.providerCalls +
        teachingProviderCalls +
        masteryBudget.expectedProviderCalls,
    );
    expect(workflowComments).toMatch(/configured caps remain\s+gate-specific/);
    const baseline = parseBaseline(
      readFileSync(join(repoRoot, 'apps/api/eval-llm/baseline.json'), 'utf8'),
    );
    const envelopeBudget = deriveEnvelopeBudgetFromMatrix(
      ENVELOPE_FLOWS,
      PROFILES,
      baseline!.flows,
    );
    const mixedTotal =
      envelopeBudget.configuredBudget +
      TEACHING_SCENARIOS.length * 17 +
      masteryBudget.configuredUnits;
    expect(workflow).not.toContain(
      `${mixedTotal} configured units across the three gates`,
    );
  });

  // [WI-3029 AC-6] Retained-run evidence for the timeout re-verification.
  // Run 30721918215 (2026-08-01T22:44Z, pre-retune head) is the only
  // retrievable run log with per-gate wall clock AND per-gate call counts.
  // Its per-step start/completed timestamps (GitHub Actions job API):
  //   envelope 22:45:14Z -> 22:59:13Z = 839s, at that run's then-configured
  //     cap of 300 OUTER runLive() invocations (--max-live-calls 300 under
  //     the pre-retune code capped outer invocations only — internal judge
  //     calls inside each invocation were not separately counted by that
  //     cap or by the run's summary counters at the time; log: "Live calls
  //     OK: 298" + "Live calls failed: 2" = 300 outer invocations,
  //     exhausting that then-cap exactly — this is NOT a measured
  //     provider-call count);
  //   teaching 22:59:13Z -> 23:03:44Z = 271s, at cap 5 (log: "Live calls OK:
  //     5" + "Live calls failed: 0" — un-truncated);
  //   mastery 23:03:44Z -> 23:15:34Z = 710s, at that run's then-cap of 189
  //     configured units (log: "budget requested 24 rounds but
  //     --max-live-calls=189 (~9 calls/round) caps at 21. 3 round(s)
  //     dropped" — only 21 of 24 scheduled rounds actually ran).
  // These are historical facts read off that one run and are NOT re-derived
  // from current code (the retained log cannot be re-fetched from live
  // derivation helpers), so they are hardcoded constants here, each cited to
  // its source line above. The retained TEACHING cap (5) is likewise a
  // historical constant, but the projection's teaching NUMERATOR is bound to
  // the CURRENT TEACHING_SCENARIOS count below, not hardcoded, so a future
  // teaching-scenario-count change can't leave the "unscaled" claim stale.
  const RETAINED_RUN_ID = '30721918215';
  const RETAINED_ENVELOPE_WALL_CLOCK_SECONDS = 839;
  const RETAINED_ENVELOPE_CALLS_AT_CAP = 300;
  const RETAINED_TEACHING_WALL_CLOCK_SECONDS = 271;
  const RETAINED_TEACHING_CALLS_AT_CAP = 5;
  const RETAINED_MASTERY_WALL_CLOCK_SECONDS = 710;
  const RETAINED_MASTERY_ROUNDS_COMPLETED = 21;
  // [WI-3029 AC-6 MUST-FIX] Historical facts about the retained run's 29
  // budget-exceeded skips (read off the run log, not re-derivable from
  // current code): safety-probes' 10 skips were ALL for one profile
  // (17yo-french-advanced) — the log shows 10 consecutive "safety-probes ×
  // 17yo-french-advanced" skip lines — and were the TAIL of that profile's
  // scenario enumeration order (budget ran out partway through the last
  // profile processed). Which of that tail are judge-bearing is NOT a
  // historical fact frozen at retained-run time — it's re-derived below
  // from the CURRENT registry, so a future battery/order change breaks this
  // assertion instead of leaving a stale hardcoded split.
  const RETAINED_SAFETY_PROBES_SKIPPED_TAIL_PROFILE_ID = '17yo-french-advanced';
  const RETAINED_SAFETY_PROBES_SKIPPED_COUNT = 10;
  const RETAINED_LANGUAGE_QUALITY_SKIPPED_COUNT = 6;
  const RETAINED_CHALLENGE_ROUND_MASTERY_SKIPPED_COUNT = 3;
  const RETAINED_REVIEW_CONTINUITY_OPENER_SKIPPED_COUNT = 10;

  test("[WI-3029 AC-6] timeout re-verification projects each gate's retained-run wall clock onto CURRENT demand and the ACTUAL configured timeout-minutes, not a stale flat per-call spike rate", () => {
    const workflow = readFileSync(
      join(repoRoot, '.github/workflows/eval-live.yml'),
      'utf8',
    );
    const workflowComments = workflow.replace(/^\s*#\s?/gm, '');

    // Must no longer assert the pre-retune flat-rate spike claim this AC was
    // bounced for: it applied a 30-60s/call queue-spike rate to every one of
    // 643 calls (a spike rate, not a run rate) and was never re-verified
    // against the raised demand.
    expect(workflowComments).not.toMatch(/5\.4-10\.7h/);
    expect(workflowComments).not.toMatch(/30-60s\/call/);
    expect(workflowComments).not.toMatch(
      /not re-verified against this raised 643\s*\n?\s*demand/,
    );

    // [S1] Must not claim the retained run's summary counters (298 ok + 2
    // failed) prove a measured PROVIDER-CALL exhaustion — those counters
    // count outer runLive() invocations only, and the current 366 includes
    // context-aware internal provider calls the pre-retune cap never
    // separately counted. 366/300 is a conservative scaling COMPARISON
    // against that outer-invocation denominator, not like-for-like measured
    // provider-call throughput.
    expect(workflowComments).not.toMatch(
      /budget exhausted exactly at the cap\)/,
    );
    expect(workflowComments).toMatch(/outer runLive\(\) invocations/i);
    expect(workflowComments).toMatch(/conservative scaling\s+comparison/);
    expect(workflowComments).toMatch(
      /not (a )?like-for-like measured\s+provider-call/,
    );

    // The projection must be traceable to the retained run and reproduce
    // the exact ratios this test derives from CURRENT demand.
    expect(workflowComments).toContain(RETAINED_RUN_ID);

    const providerDemand = deriveEnvelopeProviderDemandFromMatrix(
      ENVELOPE_FLOWS,
      PROFILES,
    );
    const masteryBudget = deriveWorkflowMasteryBudget(masteryStep!);
    // [S1 scenario-drift hole] Bind the teaching numerator to the CURRENT
    // fixture count, not the retained cap, so a future
    // TEACHING_SCENARIOS/cap change can't leave "unscaled" stale.
    const currentTeachingScenarios = TEACHING_SCENARIOS.length;

    const projectedEnvelopeSeconds =
      RETAINED_ENVELOPE_WALL_CLOCK_SECONDS *
      (providerDemand.providerCalls / RETAINED_ENVELOPE_CALLS_AT_CAP);
    const projectedTeachingSeconds =
      RETAINED_TEACHING_WALL_CLOCK_SECONDS *
      (currentTeachingScenarios / RETAINED_TEACHING_CALLS_AT_CAP);
    const projectedMasterySeconds =
      RETAINED_MASTERY_WALL_CLOCK_SECONDS *
      (masteryBudget.rounds / RETAINED_MASTERY_ROUNDS_COMPLETED);
    const projectedTotalSeconds =
      projectedEnvelopeSeconds +
      projectedTeachingSeconds +
      projectedMasterySeconds;
    const projectedMinutes = (projectedTotalSeconds / 60).toFixed(1);

    // [M1] The configured timeout MUST come from the parsed job, not a
    // hardcoded literal — proven by mutation in the red-green evidence: a
    // 180 -> 20 timeout-minutes mutation left the pre-fix version of this
    // assertion green because it computed headroom against a hardcoded 180
    // instead of this value.
    const configuredTimeoutMinutes = loadJobTimeoutMinutes(
      '.github/workflows/eval-live.yml',
      'live-evals',
    );
    const headroomMultiple = (
      (configuredTimeoutMinutes * 60) /
      projectedTotalSeconds
    ).toFixed(1);

    // [SHOULD-1] The comment must bind each FULL gate expression — retained
    // wall-clock duration immediately followed by its scaling ratio, in
    // that order — not just contain the ratio digits somewhere. Plain
    // toContain('366/300') would also pass against a workflow that said
    // '366/3000' (superset) or against the ratio appearing unattached to
    // its duration; these anchor duration-x-ratio as one unit with
    // digit-boundary guards on every number, so a future scenario-count
    // change that isn't also retuned here breaks this assertion instead of
    // silently going stale (or the test silently staying green on a wrong
    // denominator).
    //
    // [S2 — CodeRabbit 3701613388] Searching the WHOLE workflowComments
    // string for a duration+ratio expression doesn't prove it's attached to
    // the RIGHT gate — a swapped/mislabelled pair (e.g. the envelope
    // duration printed under the "mastery" label) would still satisfy an
    // unlabelled search. Extract just the AC-6 projection sentence into a
    // bounded string, and require each pattern to include its own gate
    // label immediately before the duration+ratio expression.
    const projectionParagraphMatch = workflowComments.match(
      /Projecting each gate's wall clock onto CURRENT[\s\S]*?180-minute\s+timeout-minutes\./,
    );
    expect(projectionParagraphMatch).not.toBeNull();
    const projectionParagraph = projectionParagraphMatch![0];

    const envelopeExpr = new RegExp(
      `envelope\\s+${numBoundary(RETAINED_ENVELOPE_WALL_CLOCK_SECONDS)}s\\s+x\\s+` +
        `${numBoundary(providerDemand.providerCalls)}\\/` +
        `${numBoundary(RETAINED_ENVELOPE_CALLS_AT_CAP)}`,
    );
    expect(projectionParagraph).toMatch(envelopeExpr);

    const teachingExpr = new RegExp(
      `teaching\\s+${numBoundary(RETAINED_TEACHING_WALL_CLOCK_SECONDS)}s\\s+x\\s+` +
        `${numBoundary(currentTeachingScenarios)}\\/` +
        `${numBoundary(RETAINED_TEACHING_CALLS_AT_CAP)}`,
    );
    expect(projectionParagraph).toMatch(teachingExpr);

    const masteryExpr = new RegExp(
      `mastery\\s+${numBoundary(RETAINED_MASTERY_WALL_CLOCK_SECONDS)}s\\s+x\\s+` +
        `${numBoundary(masteryBudget.rounds)}\\/` +
        `${numBoundary(RETAINED_MASTERY_ROUNDS_COMPLETED)}`,
    );
    expect(projectionParagraph).toMatch(masteryExpr);

    expect(workflowComments).toContain(`~${projectedMinutes} min`);
    expect(workflowComments).toContain(`~${headroomMultiple}×`);
    // The prose's stated timeout must bind to the ACTUAL configured value,
    // not an independent literal — this is what makes a timeout-minutes-only
    // mutation (no comment-text change) break the suite (M1). [CONSIDER]
    // digit-boundary guarded so a mutated/wrong 2-digit value (e.g. 80)
    // cannot match as a substring of the real 3-digit "180".
    expect(workflowComments).toMatch(
      new RegExp(
        `${numBoundary(configuredTimeoutMinutes)}-minute\\s+timeout-minutes`,
      ),
    );

    // Uncertainty must be explicit (AC-6), not just a headline number:
    // single retained run (no distribution/P90), the 2 failed envelope
    // calls in that run, and that provider/queue latency varies.
    expect(workflowComments).toMatch(/single retained run/i);
    expect(workflowComments).toMatch(/no P90/i);
    expect(workflowComments).toMatch(/2\s+failed/);
    expect(workflowComments).toMatch(/queue|latency/i);

    // [MUST-FIX] The judge-bearing/non-judge-bearing split among the 29
    // budget-exceeded skips must be DERIVED, not a disconnected hardcoded
    // pair. Re-derive from the CURRENT registry: the tail profile's
    // enumerateScenarios order determines which of its skipped
    // safety-probes cases are legitimate_sensitive (judge-bearing,
    // providerCallCount === 2), and language-quality's providerCallCount()
    // is unconditionally 2 — every language-quality scenario is
    // judge-bearing — so the count only holds while the retained skip
    // count (6) still equals the flow's CURRENT total scenario count.
    const tailProfile = PROFILES.find(
      (p) => p.id === RETAINED_SAFETY_PROBES_SKIPPED_TAIL_PROFILE_ID,
    );
    if (!tailProfile) {
      throw new Error(
        `Retained-run profile "${RETAINED_SAFETY_PROBES_SKIPPED_TAIL_PROFILE_ID}" no longer exists in PROFILES — the AC-6 skip-split derivation needs re-deriving against whichever profile the retained run actually skipped.`,
      );
    }
    const safetyProbesForTailProfile =
      safetyProbesFlow.enumerateScenarios?.(tailProfile) ?? [];
    if (
      safetyProbesForTailProfile.length < RETAINED_SAFETY_PROBES_SKIPPED_COUNT
    ) {
      throw new Error(
        `${RETAINED_SAFETY_PROBES_SKIPPED_TAIL_PROFILE_ID} now has only ${safetyProbesForTailProfile.length} safety-probes scenarios, fewer than the retained run's ${RETAINED_SAFETY_PROBES_SKIPPED_COUNT}-scenario skip tail.`,
      );
    }
    const skippedSafetyProbesTail = safetyProbesForTailProfile.slice(
      -RETAINED_SAFETY_PROBES_SKIPPED_COUNT,
    );
    const judgeBearingSafetyProbesInTail = skippedSafetyProbesTail.filter(
      (s) => s.input.category === 'legitimate_sensitive',
    ).length;
    const nonJudgeBearingSafetyProbesInTail =
      RETAINED_SAFETY_PROBES_SKIPPED_COUNT - judgeBearingSafetyProbesInTail;

    const languageQualityFlow = FLOWS.find((f) => f.id === 'language-quality');
    const languageQualityTotalScenarios = PROFILES.reduce(
      (sum, p) =>
        sum + (languageQualityFlow?.enumerateScenarios?.(p) ?? []).length,
      0,
    );
    if (
      languageQualityTotalScenarios !== RETAINED_LANGUAGE_QUALITY_SKIPPED_COUNT
    ) {
      throw new Error(
        `language-quality now has ${languageQualityTotalScenarios} total scenarios, not the retained run's fully-skipped count of ${RETAINED_LANGUAGE_QUALITY_SKIPPED_COUNT} — re-derive the "all skipped language-quality cases are judge-bearing" claim.`,
      );
    }
    const judgeBearingLanguageQuality = RETAINED_LANGUAGE_QUALITY_SKIPPED_COUNT;

    const derivedJudgeBearingSkips =
      judgeBearingSafetyProbesInTail + judgeBearingLanguageQuality;
    const derivedNonJudgeBearingSkips =
      nonJudgeBearingSafetyProbesInTail +
      RETAINED_CHALLENGE_ROUND_MASTERY_SKIPPED_COUNT +
      RETAINED_REVIEW_CONTINUITY_OPENER_SKIPPED_COUNT;
    expect(derivedJudgeBearingSkips + derivedNonJudgeBearingSkips).toBe(29);

    expect(workflowComments).toMatch(
      new RegExp(
        `${numBoundary(derivedJudgeBearingSkips)}\\s+of\\s+the\\s+${numBoundary(29)}\\s+were\\s+judge-bearing`,
      ),
    );
    expect(workflowComments).toMatch(
      new RegExp(
        `${numBoundary(derivedNonJudgeBearingSkips)}\\s+were\\s+NOT\\s+judge-bearing`,
      ),
    );
  });

  test('omitted envelope cap is auto-fitted before the runner default can apply', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/api/eval-llm/index.ts'),
      'utf8',
    );
    const parsed = parseCliArgs([
      '--live',
      '--check-baseline',
      '--only-envelope-flows',
    ]).options;
    const budget = deriveEnvelopeBudgetFromMatrix(
      ENVELOPE_FLOWS,
      PROFILES,
      parseBaseline(
        readFileSync(join(repoRoot, 'apps/api/eval-llm/baseline.json'), 'utf8'),
      )!.flows,
    );
    // [WI-3029 provider-accounting correction] The auto-fit cap is now
    // never below the context-aware provider-call demand either — with the
    // review-continuity-opener judge accounted for, unpinned demand (366)
    // exceeds the sample-count floor (362), so 366 is the real expectation,
    // not the raw sample floor.
    const providerDemand = deriveEnvelopeProviderDemandFromMatrix(
      ENVELOPE_FLOWS,
      PROFILES,
    );
    const expectedCap = Math.max(
      budget.configuredBudget,
      providerDemand.providerCalls,
    );
    expect(parsed.maxLiveCalls).toBeUndefined();
    expect(resolveEnvelopeLiveCallCap(parsed, budget, providerDemand)).toBe(
      expectedCap,
    );
    expect(resolveEnvelopeLiveCallCap(parsed, budget, providerDemand)).not.toBe(
      20,
    );
    const autoFitMatch = source.match(
      /options\.maxLiveCalls\s*=\s*resolveEnvelopeLiveCallCap\(\s*options,\s*budget,\s*providerDemand,?\s*\);/,
    );
    expect(autoFitMatch).not.toBeNull();
    const autoFitPosition = autoFitMatch!.index!;
    expect(autoFitPosition).toBeGreaterThanOrEqual(0);
    expect(autoFitPosition).toBeLessThan(
      source.indexOf('bootstrapLlmProviders();'),
    );
    expect(autoFitPosition).toBeLessThan(
      source.indexOf('const summary: RunSummary = await runHarness'),
    );
  });

  test('[WI-3029 SHOULD-2] --list demand report honors --flow/--profile/--scenarios like the preflight and post-run report do', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/api/eval-llm/index.ts'),
      'utf8',
    );
    const listOnlyStart = source.indexOf('if (listOnly) {');
    expect(listOnlyStart).toBeGreaterThanOrEqual(0);
    const listOnlyEnd = source.indexOf('\n  }\n', listOnlyStart);
    const listOnlyBlock = source.slice(listOnlyStart, listOnlyEnd);

    // The --list block must filter FLOWS/PROFILES by flowFilter/profileFilter
    // BEFORE deriving demand, and thread scenarioFilter into both derive
    // calls — exactly like the sibling preflight (`--live --only-envelope-
    // flows`) and post-run report blocks already do in this same file.
    // Passing the raw, unfiltered FLOWS/PROFILES means --list always reports
    // the full unscoped matrix regardless of --flow/--profile/--scenarios.
    expect(listOnlyBlock).toMatch(
      /FLOWS\.filter\(\s*\(flow\) => !options\.flowFilter \|\| options\.flowFilter\.has\(flow\.id\)/,
    );
    expect(listOnlyBlock).toMatch(
      /PROFILES\.filter\(\s*\(profile\)\s*=>\s*!options\.profileFilter \|\| options\.profileFilter\.has\(profile\.id\)/,
    );

    // [WI-3029 adversarial follow-up] The two block-wide checks above only
    // prove scopedFlows/scopedProfiles are DEFINED via a proper filter
    // somewhere in the block — they say nothing about which arguments the
    // two derive CALLS actually pass. A mutation that reverts only ONE call
    // (e.g. deriveEnvelopeProviderDemandFromMatrix back to raw FLOWS,
    // PROFILES) while leaving the other call's use of scopedFlows/
    // scopedProfiles intact keeps every block-wide substring check above
    // (and the old single scenarioFilter-anywhere-in-block check) green,
    // and keeps scopedFlows/scopedProfiles referenced so tsc's unused-local
    // check can't catch it either — it only breaks the numeric report,
    // which the test's earlier assertions never actually derive from this
    // source text. Anchor each call SITE individually instead.
    const budgetCallStart = listOnlyBlock.indexOf(
      'deriveEnvelopeBudgetFromMatrix(',
    );
    expect(budgetCallStart).toBeGreaterThanOrEqual(0);
    const budgetCall = listOnlyBlock.slice(
      budgetCallStart,
      listOnlyBlock.indexOf(');', budgetCallStart),
    );
    const demandCallStart = listOnlyBlock.indexOf(
      'deriveEnvelopeProviderDemandFromMatrix(',
    );
    expect(demandCallStart).toBeGreaterThanOrEqual(0);
    const demandCall = listOnlyBlock.slice(
      demandCallStart,
      listOnlyBlock.indexOf(');', demandCallStart),
    );

    expect(budgetCall).toMatch(
      /^deriveEnvelopeBudgetFromMatrix\(\s*scopedFlows,\s*scopedProfiles,/,
    );
    expect(budgetCall).toMatch(/scenarioFilter:\s*options\.scenarioFilter/);
    expect(demandCall).toMatch(
      /^deriveEnvelopeProviderDemandFromMatrix\(\s*scopedFlows,\s*scopedProfiles,/,
    );
    expect(demandCall).toMatch(/scenarioFilter:\s*options\.scenarioFilter/);

    // Ground the "over-reports" claim numerically with the SAME derive
    // functions the CLI uses, scoped exactly as
    // `--list --flow review-continuity-opener --scenarios verbatim-solid`
    // would scope them: this must be a tiny demand, nothing like the
    // full-matrix 329/366 an unfiltered --list reports today.
    const scopedFlows = FLOWS.filter(
      (flow) => flow.id === 'review-continuity-opener',
    );
    const scenarioFilter = new Set(['verbatim-solid']);
    const baseline = parseBaseline(
      readFileSync(join(repoRoot, 'apps/api/eval-llm/baseline.json'), 'utf8'),
    );
    const scopedBudget = deriveEnvelopeBudgetFromMatrix(
      scopedFlows,
      PROFILES,
      baseline!.flows,
      { scenarioFilter },
    );
    const scopedDemand = deriveEnvelopeProviderDemandFromMatrix(
      scopedFlows,
      PROFILES,
      { scenarioFilter },
    );
    const fullBudget = deriveEnvelopeBudgetFromMatrix(
      FLOWS,
      PROFILES,
      baseline!.flows,
    );
    const fullDemand = deriveEnvelopeProviderDemandFromMatrix(FLOWS, PROFILES);

    expect(scopedBudget.requiredSamples).toBe(1);
    expect(scopedDemand.providerCalls).toBe(1);
    expect(fullBudget.requiredSamples).toBe(329);
    expect(fullDemand.providerCalls).toBe(366);
    expect(scopedBudget.requiredSamples).toBeLessThan(
      fullBudget.requiredSamples,
    );
    expect(scopedDemand.providerCalls).toBeLessThan(fullDemand.providerCalls);
  });

  test('full flow registry preserves the pre-budget runtime order', () => {
    // [CodeRabbit] Parse the ACTUAL registry membership + order from the
    // array body and assert exact equality against the expected list — the
    // prior `indexOf` + sorted-positions check only proved the named flows
    // appear in relative order; it never compared the total set, so an
    // extra/duplicate/unlisted entry anywhere in FLOWS passed silently.
    const source = readFileSync(
      join(repoRoot, 'apps/api/eval-llm/flow-registry.ts'),
      'utf8',
    );
    const start = source.indexOf('export const FLOWS');
    const body = source.slice(start, source.indexOf('];', start));
    const actualOrder = Array.from(
      body.matchAll(/^\s{2}(\w+),$/gm),
      (match) => match[1],
    );
    const originalOrder = [
      'capitalsFlow',
      'vocabularyFlow',
      'guessWhoFlow',
      'dictationGenerateFlow',
      'dictationGenerateSanitizationFlow',
      'prepareHomeworkFlow',
      'dictationReviewFlow',
      'sessionAnalysisFlow',
      'sessionRecapFlow',
      'sessionSummaryFlow',
      'filingPreSessionFlow',
      'exchangesFlow',
      'homeworkNoticeFlow',
      'topicProbeSignalsFlow',
      'topicIntentMatcherFlow',
      'subjectClassifyFlow',
      'languageDetectFlow',
      'probesFlow',
      'safetyProbesFlow',
      'languageQualityFlow',
      'bookSuggestionRegenerationFlow',
      'progressSummaryFlow',
      'assessmentEvaluationFlow',
      'anthropicResponseFormatFlow',
      'languagePromptsFlow',
      'gradedInputPromptsFlow',
      'adaptiveTeachingFlow',
      'nowParkReturnFlow',
      'parkAndReturnRankingFlow',
      'parkAndReturnReweaveFlow',
      'appHelpV2Flow',
      'challengeRoundMasteryFlow',
      'misconceptionRepairFlow',
      'teachingSessionFlow',
      'challengeGraderFlow',
      'reviewContinuityOpenerFlow',
      'recallGraderFlow',
      'judgeSuitabilityFlow',
      'recheckJudgeFlow',
      'learningTextSafetyJudgeFlow',
    ];
    expect(actualOrder).toEqual(originalOrder);
  });

  test('a dedicated teaching-session live gate exists, separate from the envelope-only step', () => {
    expect(teachingStep).toBeDefined();
    expect(teachingStep!.run).toContain('--live');
    expect(teachingStep!.run).not.toContain('--only-envelope-flows');
    expect(teachingStep).not.toBe(envelopeStep);
  });

  test('teaching-session was NOT pulled into the envelope filter by setting emitsEnvelope:true', () => {
    // AC-1 explicitly forbids the shortcut of flipping emitsEnvelope on the
    // flow just to make --only-envelope-flows cover it (that would also pull a
    // non-envelope flow into the signal-drift baseline set).
    const flowSource = readFileSync(
      join(repoRoot, 'apps/api/eval-llm/flows/teaching-session.ts'),
      'utf8',
    );
    expect(flowSource).not.toMatch(/emitsEnvelope\s*:\s*true/);
  });

  test('the teaching gate carries an explicit live-call budget equal to the real scenario count', () => {
    // --max-live-calls counts runLive invocations (one per scenario × matched
    // profile — each teaching scenario pins exactly one profile), so the
    // budget is exactly TEACHING_SCENARIOS.length. A fixture change that adds
    // or removes scenarios must retune the workflow budget in the same PR.
    expect(teachingStep).toBeDefined();
    const budget = teachingStep!.run!.match(/--max-live-calls (\d+)/);
    expect(budget).not.toBeNull();
    expect(Number(budget![1])).toBe(TEACHING_SCENARIOS.length);
  });

  test('teaching + mastery gates still execute when an earlier gate step failed', () => {
    expect(teachingStep).toBeDefined();
    expect(masteryStep).toBeDefined();
    for (const step of [teachingStep!, masteryStep!]) {
      const condition = String(step.if ?? '');
      expect(condition).toContain('!cancelled()');
      expect(condition).toContain("steps.doppler.outcome == 'success'");
    }
  });

  test('scheduled-failure copy distinguishes execution/judge-unavailable reds from pedagogical failures', () => {
    // The teaching gate fails CLOSED (WI-2461 AC-3): an absent or unusable
    // judge verdict (no-verdict / judge-unavailable) and failed live calls are
    // error-class, so a teaching red no longer implies the judge found a
    // pedagogical failure. The auto-filed issue's triage copy must say so, or
    // an operator will misread an infrastructure failure as a real tutoring
    // regression.
    const notifyStep = steps.find(
      (s) => s.name === 'Notify on scheduled failure',
    );
    expect(notifyStep).toBeDefined();
    const script = notifyStep!.with?.script ?? '';
    expect(script).toContain('transfer-failed');
    expect(script).toContain('no-verdict');
    expect(script).toContain('judge-unavailable');
    expect(script).toContain('fails closed');
    expect(script).toContain(
      'pnpm eval:llm -- --live --only-envelope-flows --update-baseline',
    );
  });

  test('the setup guard the gate if-conditions reference actually exists', () => {
    const dopplerStep = steps.find((s) => s.id === 'doppler');
    expect(dopplerStep).toBeDefined();
    expect(dopplerStep!.name).toContain('Doppler');
  });

  test('no gate suppresses its own failure — job conclusion must reflect any genuine gate failure', () => {
    expect(envelopeStep).toBeDefined();
    expect(teachingStep).toBeDefined();
    expect(masteryStep).toBeDefined();
    for (const step of [envelopeStep!, teachingStep!, masteryStep!]) {
      expect(step['continue-on-error']).toBeUndefined();
    }
  });
});

describe('api-quality-gate.yml — simulation-baseline validation is blocking (WI-2461 AC-4)', () => {
  test('the deterministic simulation-baseline validation step has no continue-on-error', () => {
    const steps = loadJobSteps(
      '.github/workflows/api-quality-gate.yml',
      'api-quality-gate',
    );
    const simBaselineStep = steps.find(
      (s) =>
        s.run?.includes('eval:llm:sim') &&
        s.run.includes('--validate-baseline'),
    );
    expect(simBaselineStep).toBeDefined();
    expect(simBaselineStep!['continue-on-error']).toBeUndefined();
  });
});
