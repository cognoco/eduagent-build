import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregate, writeCorpus, type SimMetrics } from './simulation-metrics';
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
  mentorModel: string;
  evaluations?: ChallengeRoundEvaluationItem[];
}): SimulatedRoundResult {
  return {
    scenarioId: 'CRS-test',
    profileId: '12yo-dinosaurs',
    mentorModel: p.mentorModel,
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
        mentorModel: 'gpt-oss-120b',
        evaluations: [evalItem('solid'), evalItem('solid')],
      }),
      // under-credited: gate partial, ground truth was verified
      makeResult({
        outcome: 'partial',
        marked: false,
        expected: 'verified',
        signalEmitted: true,
        mentorModel: 'gpt-oss-120b',
        evaluations: [evalItem('partial')],
      }),
      // correct verified
      makeResult({
        outcome: 'verified',
        marked: true,
        expected: 'verified',
        signalEmitted: true,
        mentorModel: 'gpt-oss-120b',
      }),
      // signal-dropped round
      makeResult({
        outcome: 'invalid',
        marked: false,
        expected: 'partial',
        signalEmitted: false,
        mentorModel: 'gpt-oss-120b',
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
        mentorModel: 'gpt-oss-120b',
      }),
      makeResult({
        outcome: 'verified',
        marked: true,
        expected: 'verified',
        signalEmitted: true,
        mentorModel: 'gpt-oss-120b',
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
        mentorModel: 'gpt-oss-120b',
      }),
    ]);
    expect(m.underCreditRate).toBe(0);
  });

  it('separates signalEmissionRate per mentor model', () => {
    const results = [
      makeResult({
        outcome: 'verified',
        marked: true,
        expected: 'verified',
        signalEmitted: true,
        mentorModel: 'model-A',
      }),
      makeResult({
        outcome: 'invalid',
        marked: false,
        expected: 'verified',
        signalEmitted: false,
        mentorModel: 'model-B',
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
          mentorModel: 'gpt-oss-120b',
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
