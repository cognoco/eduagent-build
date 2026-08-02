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

// The runtime registry imports API source that reaches the retention package's
// published `.js` specifier. The scripts Jest config intentionally does not
// rewrite that package specifier, so provide the source-test shim needed only
// to load FLOWS for this registry contract.
jest.mock('../packages/retention/src/sm2.js', () => ({ sm2: jest.fn() }), {
  virtual: true,
});

import { TEACHING_SCENARIOS } from '../apps/api/eval-llm/fixtures/teaching-scenarios';
import { CHALLENGE_SIM_SCENARIOS } from '../apps/api/eval-llm/fixtures/challenge-personas';
import { PROFILES } from '../apps/api/eval-llm/fixtures/profiles';
import { ENVELOPE_FLOWS } from '../apps/api/eval-llm/envelope-flow-registry';
import { FLOWS } from '../apps/api/eval-llm/flow-registry';
import { deriveEnvelopeBudgetFromMatrix } from '../apps/api/eval-llm/runner/budget';
import {
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
    expect(Number(cap![1])).toBe(budget.configuredBudget);

    const evidence = readFileSync(
      join(repoRoot, '.github/workflows/eval-live.yml'),
      'utf8',
    ).match(/required=(\d+) samples; its 10% headroom configures (\d+)/);
    expect(evidence).not.toBeNull();
    expect(Number(evidence![1])).toBe(budget.requiredSamples);
    expect(Number(evidence![2])).toBe(budget.configuredBudget);
  });

  test('hand-maintained envelope registry matches the runtime envelope subset', () => {
    expect(ENVELOPE_FLOWS.map((flow) => flow.id)).toEqual(
      FLOWS.filter((flow) => flow.emitsEnvelope).map((flow) => flow.id),
    );
  });

  test('mastery cap is the derived complete 8 × 3 configured-unit grid', () => {
    expect(masteryStep).toBeDefined();
    const budget = deriveMasteryBudget({
      scenarioCount: CHALLENGE_SIM_SCENARIOS.length,
      runs: 3,
    });
    const cap = masteryStep!.run!.match(/--max-live-calls (\d+)/);
    expect(cap).not.toBeNull();
    expect(Number(cap![1])).toBe(budget.configuredUnits);
    expect(budget.expectedProviderCalls).toBe(192);
    expect(masteryStep!.run).toContain('216');
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
    const masteryBudget = deriveMasteryBudget({
      scenarioCount: CHALLENGE_SIM_SCENARIOS.length,
      runs: 3,
    });
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
    expect(parsed.maxLiveCalls).toBeUndefined();
    expect(resolveEnvelopeLiveCallCap(parsed, budget)).toBe(
      budget.configuredBudget,
    );
    expect(resolveEnvelopeLiveCallCap(parsed, budget)).not.toBe(20);
    expect(source).toContain(
      'options.maxLiveCalls = resolveEnvelopeLiveCallCap(options, budget);',
    );
    const autoFitPosition = source.indexOf(
      'options.maxLiveCalls = resolveEnvelopeLiveCallCap(options, budget);',
    );
    expect(autoFitPosition).toBeGreaterThanOrEqual(0);
    expect(autoFitPosition).toBeLessThan(
      source.indexOf('bootstrapLlmProviders();'),
    );
    expect(autoFitPosition).toBeLessThan(
      source.indexOf('const summary: RunSummary = await runHarness'),
    );
  });

  test('full flow registry preserves the pre-budget runtime order', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/api/eval-llm/flow-registry.ts'),
      'utf8',
    );
    const start = source.indexOf('export const FLOWS');
    const body = source.slice(start, source.indexOf('];', start));
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
    const positions = originalOrder.map((name) => body.indexOf(`  ${name},`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
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
