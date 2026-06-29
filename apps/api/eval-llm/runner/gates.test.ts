import { evaluateGates } from './gates';
import type { RunOptions, RunSummary } from './runner';
import type { Baseline, FlowAggregate } from './metrics';

// ---------------------------------------------------------------------------
// gates.test.ts — [WI-1148] regression coverage for the post-run gate.
//
// The bug: the harness `process.exit(1)`'d on any scenario-quality failure
// BEFORE running the --check-baseline drift comparison, so a routine quality
// failure (6 observed in a 262-call live run, 2026-06-29) made the weekly
// eval-live drift gate structurally unreachable.
//
// The regression-critical assertion is `driftEvaluated === true` when
// qualityFailures > 0 AND checkBaseline is set — i.e. the drift comparison runs
// DESPITE the quality failure. No jest.mock: the real compareAgainstBaseline
// runs over a real in-memory baseline; only the baseline file-read (an I/O
// boundary) is injected as a dependency.
// ---------------------------------------------------------------------------

const RATES: FlowAggregate['rates'] = {
  envelopeOk: 1,
  hasReply: 1,
  replyHasLiteralEscape: 0,
  partialProgress: 0.2,
  needsDeepening: 0.1,
  understandingCheck: 0.3,
  readyToFinish: 0.1,
  notePromptShow: 0.05,
  fluencyDrillActive: 0,
  confidenceLow: 0.1,
};

function baselineWith(rates: FlowAggregate['rates']): Baseline {
  return {
    version: 1,
    updatedAt: '2026-06-29T00:00:00.000Z',
    flows: { exchanges: { n: 100, rates } },
  };
}

function summaryWith(opts: {
  qualityFailures?: number;
  rates?: FlowAggregate['rates'];
}): RunSummary {
  return {
    flowsRun: 1,
    profilesRun: 1,
    snapshotsWritten: 1,
    liveCallsOk: 100,
    liveCallsFailed: 0,
    qualityWarnings: 0,
    qualityFailures: opts.qualityFailures ?? 0,
    skipped: [],
    envelopeMetrics: { exchanges: { n: 100, rates: opts.rates ?? RATES } },
  };
}

const CHECK_OPTS: RunOptions = { live: true, checkBaseline: true };
const TOL = 0.05;

function deps(baseline: Baseline | null) {
  return {
    readBaseline: async () => baseline,
    baselinePath: '/fake/baseline.json',
    tolerancePp: TOL,
  };
}

describe('evaluateGates [WI-1148]', () => {
  it('REGRESSION: with quality failures AND --check-baseline, drift IS still evaluated (no drift)', async () => {
    // Current metrics equal the baseline → no drift. The quality failure must
    // NOT short-circuit the drift comparison.
    const result = await evaluateGates(
      summaryWith({ qualityFailures: 3, rates: RATES }),
      CHECK_OPTS,
      deps(baselineWith(RATES)),
    );

    // The bug left this false (quality exit ran first). The fix makes it true.
    expect(result.driftEvaluated).toBe(true);
    // Drift comparison ran and PASSED, so its "passed" line is present...
    expect(
      result.messages.some((m) => m.text.includes('Baseline check passed')),
    ).toBe(true);
    // ...yet the run still fails — for the quality reason only (no drift).
    expect(result.exitCode).toBe(1);
    const failLine = result.messages.find((m) =>
      m.text.startsWith('Eval gate failed:'),
    );
    expect(failLine?.text).toContain('scenario-quality failures');
    expect(failLine?.text).not.toContain('baseline signal drift');
  });

  it('quality failures AND real drift → both evaluated, both named (variant c)', async () => {
    const drifted: FlowAggregate['rates'] = { ...RATES, partialProgress: 0.9 };
    const result = await evaluateGates(
      summaryWith({ qualityFailures: 2, rates: drifted }),
      CHECK_OPTS,
      deps(baselineWith(RATES)),
    );

    expect(result.driftEvaluated).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(
      result.messages.some((m) => m.text.includes('Signal drift detected')),
    ).toBe(true);
    const failLine = result.messages.find((m) =>
      m.text.startsWith('Eval gate failed:'),
    );
    expect(failLine?.text).toContain('scenario-quality failures');
    expect(failLine?.text).toContain('baseline signal drift');
  });

  it('drift only, no quality failure → exits 1 for drift, must not regress (variant b)', async () => {
    const drifted: FlowAggregate['rates'] = { ...RATES, partialProgress: 0.9 };
    const result = await evaluateGates(
      summaryWith({ qualityFailures: 0, rates: drifted }),
      CHECK_OPTS,
      deps(baselineWith(RATES)),
    );

    expect(result.driftEvaluated).toBe(true);
    expect(result.exitCode).toBe(1);
    const failLine = result.messages.find((m) =>
      m.text.startsWith('Eval gate failed:'),
    );
    expect(failLine?.text).toBe('Eval gate failed: baseline signal drift.');
  });

  it('clean run (no quality failure, no drift) → exit 0, drift evaluated', async () => {
    const result = await evaluateGates(
      summaryWith({ qualityFailures: 0, rates: RATES }),
      CHECK_OPTS,
      deps(baselineWith(RATES)),
    );

    expect(result.exitCode).toBe(0);
    expect(result.driftEvaluated).toBe(true);
    expect(
      result.messages.some((m) => m.text.includes('Baseline check passed')),
    ).toBe(true);
  });

  it('--update-baseline + quality failures → exit 1 with NOTE, no drift comparison (variant d)', async () => {
    const result = await evaluateGates(
      summaryWith({ qualityFailures: 1, rates: RATES }),
      { live: true, updateBaseline: true },
      deps(baselineWith(RATES)),
    );

    expect(result.exitCode).toBe(1);
    // Seed path never compares against the just-written baseline.
    expect(result.driftEvaluated).toBe(false);
    expect(
      result.messages.some((m) => m.text.includes('baseline.json WAS written')),
    ).toBe(true);
  });

  it('--check-baseline with no baseline file → exit 2 (misconfig)', async () => {
    const result = await evaluateGates(
      summaryWith({ qualityFailures: 0, rates: RATES }),
      CHECK_OPTS,
      deps(null),
    );

    expect(result.exitCode).toBe(2);
    expect(result.driftEvaluated).toBe(false);
    expect(
      result.messages.some((m) => m.text.includes('No baseline found')),
    ).toBe(true);
  });
});
