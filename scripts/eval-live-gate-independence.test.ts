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

interface WorkflowStep {
  name?: string;
  id?: string;
  if?: string | boolean;
  run?: string;
  'continue-on-error'?: boolean;
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
