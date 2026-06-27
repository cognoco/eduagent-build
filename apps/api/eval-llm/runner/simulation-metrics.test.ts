import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  aggregate,
  compareSimulationBaseline,
  toBaseline,
  validateBaselineStructure,
  writeCorpus,
  type SimMetrics,
  type SimulationBaseline,
} from './simulation-metrics';
import type { SimulatedRoundResult } from './simulated-conversation';
import type {
  MasteryDecision,
  MasteryOutcome,
} from '../../src/services/challenge-round/evaluation';
import type { ChallengeRoundEvaluationItem } from '@eduagent/schemas';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';

function evalItem(
  result: ChallengeRoundEvaluationItem['result'],
): ChallengeRoundEvaluationItem {
  return {
    concept: 'c',
    result,
    evidence: 'e',
    answerEventId: EVENT_ID,
    learnerQuote: 'q',
  };
}

function decision(
  outcome: MasteryOutcome,
  markMasteryVerified: boolean,
): MasteryDecision {
  return {
    outcome,
    markMasteryVerified,
    solidConcepts: [],
    solidAnswerQuotes: [],
    reviewTargets: [],
  };
}

function makeResult(p: {
  outcome: MasteryOutcome;
  marked: boolean;
  expected: SimulatedRoundResult['expectedOutcome'];
  signalEmitted: boolean;
  graderModel: string;
  evaluations?: ChallengeRoundEvaluationItem[];
  scenarioId?: string;
}): SimulatedRoundResult {
  return {
    scenarioId: p.scenarioId ?? 'CRS-test',
    profileId: '12yo-dinosaurs',
    graderModel: p.graderModel,
    learnerModel: 'anthropic/claude-3.5-sonnet',
    transcript: [],
    evaluations: p.evaluations ?? [],
    decision: decision(p.outcome, p.marked),
    expectedOutcome: p.expected,
    signalEmitted: p.signalEmitted,
  };
}

describe('aggregate', () => {
  it('computes overCreditRate, underCreditRate and signalEmissionRate', () => {
    const results: SimulatedRoundResult[] = [
      // over-credited: gate verified, ground truth was partial
      makeResult({
        outcome: 'verified',
        marked: true,
        expected: 'partial',
        signalEmitted: true,
        graderModel: 'gpt-oss-120b',
        evaluations: [evalItem('solid'), evalItem('solid')],
      }),
      // under-credited: gate partial, ground truth was verified
      makeResult({
        outcome: 'partial',
        marked: false,
        expected: 'verified',
        signalEmitted: true,
        graderModel: 'gpt-oss-120b',
        evaluations: [evalItem('partial')],
      }),
      // correct verified
      makeResult({
        outcome: 'verified',
        marked: true,
        expected: 'verified',
        signalEmitted: true,
        graderModel: 'gpt-oss-120b',
      }),
      // signal-dropped round
      makeResult({
        outcome: 'invalid',
        marked: false,
        expected: 'partial',
        signalEmitted: false,
        graderModel: 'gpt-oss-120b',
      }),
    ];

    const m = aggregate(results);

    expect(m.totalRounds).toBe(4);
    expect(m.overCreditRate).toBeCloseTo(1 / 4);
    expect(m.underCreditRate).toBeCloseTo(1 / 4);
    expect(m.signalEmissionRate).toBeCloseTo(3 / 4);
    expect(m.signalEmissionRateByMentor['gpt-oss-120b']).toBeCloseTo(3 / 4);
    expect(m.masteryVerifiedRate).toBeCloseTo(2 / 4);
    expect(m.outcomeCounts).toEqual({
      verified: 2,
      partial: 1,
      reteach: 0,
      invalid: 1,
    });
    expect(m.conceptResultCounts).toEqual({
      solid: 2,
      partial: 1,
      missing: 0,
      misconception: 0,
    });
  });

  it('counts invalid (dropped-signal) on a verified-expected round as under-credit', () => {
    // A learner who DESERVED verification (ground truth verified) but whose
    // mentor dropped all signal → outcome 'invalid'. From the learner's lived
    // outcome that is still "deserved mastery, didn't verify" = under-credit.
    const results: SimulatedRoundResult[] = [
      makeResult({
        outcome: 'invalid',
        marked: false,
        expected: 'verified',
        signalEmitted: false,
        graderModel: 'gpt-oss-120b',
      }),
      makeResult({
        outcome: 'verified',
        marked: true,
        expected: 'verified',
        signalEmitted: true,
        graderModel: 'gpt-oss-120b',
      }),
    ];
    const m = aggregate(results);
    // invalid-on-verified is under-credit; invalid-on-NON-verified is not.
    expect(m.underCreditRate).toBeCloseTo(1 / 2);
    expect(m.overCreditRate).toBe(0);
    expect(m.signalEmissionRate).toBeCloseTo(1 / 2);
  });

  it('does NOT count invalid on a non-verified-expected round as under-credit', () => {
    const m = aggregate([
      makeResult({
        outcome: 'invalid',
        marked: false,
        expected: 'partial',
        signalEmitted: false,
        graderModel: 'gpt-oss-120b',
      }),
    ]);
    expect(m.underCreditRate).toBe(0);
  });

  it('lists exactly the ids that over-credit in overCreditScenarioIds', () => {
    const m = aggregate([
      makeResult({
        scenarioId: 'OVER-1',
        outcome: 'verified',
        marked: true,
        expected: 'partial',
        signalEmitted: true,
        graderModel: 'production-routing',
      }),
      makeResult({
        scenarioId: 'OK-deserved',
        outcome: 'verified',
        marked: true,
        expected: 'verified',
        signalEmitted: true,
        graderModel: 'production-routing',
      }),
      makeResult({
        scenarioId: 'UNDER-1',
        outcome: 'reteach',
        marked: false,
        expected: 'verified',
        signalEmitted: true,
        graderModel: 'production-routing',
      }),
    ]);
    expect(m.overCreditScenarioIds).toEqual(['OVER-1']);
  });

  it('separates signalEmissionRate per grader model', () => {
    const results = [
      makeResult({
        outcome: 'verified',
        marked: true,
        expected: 'verified',
        signalEmitted: true,
        graderModel: 'model-A',
      }),
      makeResult({
        outcome: 'invalid',
        marked: false,
        expected: 'verified',
        signalEmitted: false,
        graderModel: 'model-B',
      }),
    ];
    const m = aggregate(results);
    expect(m.signalEmissionRateByMentor).toEqual({
      'model-A': 1,
      'model-B': 0,
    });
  });

  it('handles an empty result set without dividing by zero', () => {
    const m = aggregate([]);
    expect(m.totalRounds).toBe(0);
    expect(m.overCreditRate).toBe(0);
    expect(m.signalEmissionRate).toBe(0);
  });
});

describe('writeCorpus', () => {
  it('writes one JSON per round plus a metrics.json summary', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sim-corpus-'));
    try {
      const results = [
        makeResult({
          outcome: 'verified',
          marked: true,
          expected: 'verified',
          signalEmitted: true,
          graderModel: 'gpt-oss-120b',
        }),
      ];
      const metrics: SimMetrics = aggregate(results);
      await writeCorpus(dir, results, metrics);

      const round = JSON.parse(
        await readFile(join(dir, '000-CRS-test.json'), 'utf8'),
      ) as SimulatedRoundResult;
      expect(round.scenarioId).toBe('CRS-test');

      const written = JSON.parse(
        await readFile(join(dir, 'metrics.json'), 'utf8'),
      ) as SimMetrics & { note: string };
      expect(written.totalRounds).toBe(1);
      expect(written.note).toMatch(/PROVISIONAL/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Committed-baseline machinery (the tracked gate).
// ---------------------------------------------------------------------------

const OUTCOME_QUARTERS = {
  verified: 0.25,
  partial: 0.25,
  reteach: 0.25,
  invalid: 0.25,
} as const;

function makeMetrics(over: Partial<SimMetrics> = {}): SimMetrics {
  return {
    totalRounds: 20,
    outcomeCounts: { verified: 5, partial: 5, reteach: 5, invalid: 5 },
    outcomeRates: { ...OUTCOME_QUARTERS },
    conceptResultCounts: { solid: 0, partial: 0, missing: 0, misconception: 0 },
    masteryVerifiedRate: 0.5,
    overCreditRate: 0,
    overCreditScenarioIds: [],
    underCreditRate: 0.1,
    signalEmissionRate: 0.9,
    signalEmissionRateByMentor: { 'production-routing': 0.9 },
    ...over,
  };
}

function makeBaseline(
  over: Partial<SimulationBaseline['rates']> = {},
): SimulationBaseline {
  return {
    version: 1,
    updatedAt: '2026-06-27T00:00:00.000Z',
    provenance: 'update-baseline',
    learnerModel: 'openai/gpt-4o',
    mentorModel: 'production-routing',
    graderModel: 'claude-sonnet-4-6',
    scenarioCount: 20,
    rates: {
      outcome: { ...OUTCOME_QUARTERS },
      masteryVerified: 0.5,
      underCredit: 0.1,
      signalEmissionByMentor: { 'production-routing': 0.9 },
      ...over,
    },
  };
}

describe('compareSimulationBaseline', () => {
  it('over-credit ids present → pass:false + ids echoed', () => {
    const gate = compareSimulationBaseline(
      makeMetrics({ overCreditScenarioIds: ['OVER-1', 'OVER-2'] }),
      makeBaseline(),
      0.15,
    );
    expect(gate.pass).toBe(false);
    expect(gate.overCreditCount).toBe(2);
    expect(gate.overCreditScenarioIds).toEqual(['OVER-1', 'OVER-2']);
  });

  it('identical metrics → no drift, pass:true', () => {
    const gate = compareSimulationBaseline(makeMetrics(), makeBaseline(), 0.15);
    expect(gate.drift).toEqual([]);
    expect(gate.pass).toBe(true);
  });

  it('one rate beyond tolerance → exactly one drift entry, named', () => {
    const gate = compareSimulationBaseline(
      makeMetrics({ masteryVerifiedRate: 0.8 }), // Δ0.3 > 0.15
      makeBaseline(),
      0.15,
    );
    expect(gate.drift).toHaveLength(1);
    expect(gate.drift[0]!.metric).toBe('masteryVerified');
    expect(gate.drift[0]!.delta).toBeCloseTo(0.3);
  });

  it('signalEmissionByMentor delta beyond tolerance → drift entry named per model', () => {
    const gate = compareSimulationBaseline(
      makeMetrics({
        signalEmissionRateByMentor: { 'production-routing': 0.5 },
      }), // Δ0.4
      makeBaseline(),
      0.15,
    );
    expect(gate.drift).toHaveLength(1);
    expect(gate.drift[0]!.metric).toBe(
      'signalEmissionByMentor.production-routing',
    );
  });

  it('totalRounds < 10 widens tolerance (passes at 2×, fails at 1×)', () => {
    // Δ0.2: below 2×0.15=0.30 (widened, small-N) but above 1×0.15.
    const smallN = makeMetrics({ totalRounds: 5, masteryVerifiedRate: 0.7 });
    expect(
      compareSimulationBaseline(smallN, makeBaseline(), 0.15).drift,
    ).toEqual([]);
    const largeN = makeMetrics({ totalRounds: 20, masteryVerifiedRate: 0.7 });
    expect(
      compareSimulationBaseline(largeN, makeBaseline(), 0.15).drift,
    ).toHaveLength(1);
  });
});

describe('validateBaselineStructure', () => {
  it('rejects empty / non-object / scenarioCount:0', () => {
    expect(validateBaselineStructure(null).ok).toBe(false);
    expect(validateBaselineStructure({}).ok).toBe(false);
    expect(
      validateBaselineStructure({ ...makeBaseline(), scenarioCount: 0 }).ok,
    ).toBe(false);
  });

  it('rejects a payload missing graderModel', () => {
    const { graderModel: _omit, ...noGrader } = makeBaseline();
    void _omit;
    expect(validateBaselineStructure(noGrader).ok).toBe(false);
  });

  it('rejects a payload missing the provenance stamp (hand-written stub)', () => {
    const { provenance: _omit, ...noProvenance } = makeBaseline();
    void _omit;
    expect(validateBaselineStructure(noProvenance).ok).toBe(false);
  });

  it('rejects a main-harness-shaped payload (no over-credit fields)', () => {
    const mainHarness = {
      version: 1,
      provenance: 'update-baseline',
      learnerModel: 'x',
      graderModel: 'y',
      scenarioCount: 4,
      flows: {},
      rates: { outcome: {} }, // lacks underCredit / masteryVerified / signalEmissionByMentor
    };
    expect(validateBaselineStructure(mainHarness).ok).toBe(false);
  });

  it('rejects NaN / non-finite scalar rates (a corrupted baseline that would silently disable drift)', () => {
    // NaN is `typeof 'number'`, so the old check passed it; downstream
    // `Math.abs(NaN) > tolerance` is always false, silently killing the drift
    // channel. The validator must reject it.
    expect(
      validateBaselineStructure(makeBaseline({ masteryVerified: NaN })).ok,
    ).toBe(false);
    expect(
      validateBaselineStructure(makeBaseline({ underCredit: NaN })).ok,
    ).toBe(false);
    expect(
      validateBaselineStructure(
        makeBaseline({ signalEmissionByMentor: { 'production-routing': NaN } }),
      ).ok,
    ).toBe(false);
    // A non-number value smuggled into a rate (e.g. a string) is also rejected.
    expect(
      validateBaselineStructure(
        makeBaseline({
          outcome: { verified: 'high' } as unknown as Record<string, number>,
        }),
      ).ok,
    ).toBe(false);
  });

  it('rejects an empty rates.outcome map', () => {
    expect(
      validateBaselineStructure(
        makeBaseline({
          outcome: {} as unknown as Record<string, number>,
        }),
      ).ok,
    ).toBe(false);
  });

  it('accepts a full, provenance-stamped, judge-stamped baseline', () => {
    const result = validateBaselineStructure(makeBaseline());
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('round-trips through toBaseline → validateBaselineStructure', () => {
    const baseline = toBaseline(makeMetrics(), {
      learnerModel: 'openai/gpt-4o',
      mentorModel: 'production-routing',
      graderModel: 'claude-sonnet-4-6',
      updatedAt: '2026-06-27T00:00:00.000Z',
      provenance: 'update-baseline',
    });
    expect(validateBaselineStructure(baseline).ok).toBe(true);
  });
});
