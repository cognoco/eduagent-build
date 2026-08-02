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

function loadJobSteps(workflowPath: string, jobId: string): WorkflowStep[] {
  const workflow = parse(
    readFileSync(join(repoRoot, workflowPath), 'utf8'),
  ) as {
    jobs?: Record<string, { steps?: WorkflowStep[] }>;
  };
  const steps = workflow.jobs?.[jobId]?.steps;
  if (!steps) {
    throw new Error(`No steps found for job "${jobId}" in ${workflowPath}`);
  }
  return steps;
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
    expect(listOnlyBlock).toMatch(/scenarioFilter:\s*options\.scenarioFilter/);

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
