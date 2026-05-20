import type { ChallengeRoundEvaluationItem } from '@eduagent/schemas';
import { decideMasteryAndReview, summarizeEvaluation } from './evaluation';

const allSolid: ChallengeRoundEvaluationItem[] = [
  {
    concept: 'a',
    result: 'solid',
    evidence: 'x',
    answerEventId: 'e1',
    learnerQuote: 'I said a clearly',
  },
  {
    concept: 'b',
    result: 'solid',
    evidence: 'y',
    answerEventId: 'e2',
    learnerQuote: 'I said b clearly',
  },
  {
    concept: 'c',
    result: 'solid',
    evidence: 'z',
    answerEventId: 'e3',
    learnerQuote: 'I said c clearly',
  },
];

const mixed: ChallengeRoundEvaluationItem[] = [
  {
    concept: 'a',
    result: 'solid',
    evidence: 'x',
    answerEventId: 'e1',
    learnerQuote: 'I said a clearly',
  },
  {
    concept: 'b',
    result: 'partial',
    evidence: 'partial-evidence-b',
    answerEventId: 'e2',
    learnerQuote: 'I partly said b',
  },
  {
    concept: 'c',
    result: 'misconception',
    evidence: 'learner confused c with d',
    correction: 'C is actually …',
    answerEventId: 'e3',
    learnerQuote: 'I said c incorrectly',
  },
];

const allMissing: ChallengeRoundEvaluationItem[] = [
  {
    concept: 'a',
    result: 'missing',
    evidence: 'no answer',
    answerEventId: 'e1',
    learnerQuote: 'idk',
  },
  {
    concept: 'b',
    result: 'missing',
    evidence: 'no answer',
    answerEventId: 'e2',
    learnerQuote: 'pass',
  },
];

describe('decideMasteryAndReview — happy path (all solid)', () => {
  it('marks the round verified and exposes all solid concepts + quotes', () => {
    const d = decideMasteryAndReview(allSolid);
    expect(d.outcome).toBe('verified');
    expect(d.markMasteryVerified).toBe(true);
    expect(d.reviewTargets).toEqual([]);
    expect(d.solidConcepts).toEqual(['a', 'b', 'c']);
    expect(d.solidAnswerQuotes).toEqual([
      'I said a clearly',
      'I said b clearly',
      'I said c clearly',
    ]);
  });
});

describe('decideMasteryAndReview — mixed (partial + misconception)', () => {
  it('returns outcome=partial; never marks mastery', () => {
    const d = decideMasteryAndReview(mixed);
    expect(d.outcome).toBe('partial');
    expect(d.markMasteryVerified).toBe(false);
  });

  it('promotes only partial+misconception concepts into reviewTargets', () => {
    const d = decideMasteryAndReview(mixed);
    expect(d.reviewTargets.map((r) => r.concept).sort()).toEqual(['b', 'c']);
    expect(d.reviewTargets.every((r) => r.source === 'challenge_round')).toBe(
      true,
    );
  });

  it('preserves correction text on misconception targets', () => {
    const d = decideMasteryAndReview(mixed);
    const cTarget = d.reviewTargets.find((r) => r.concept === 'c');
    expect(cTarget?.correction).toBe('C is actually …');
    expect(cTarget?.misconception).toBe('learner confused c with d');
  });

  it('exposes only solid concepts + quotes (never partial/misconception)', () => {
    const d = decideMasteryAndReview(mixed);
    expect(d.solidConcepts).toEqual(['a']);
    expect(d.solidAnswerQuotes).toEqual(['I said a clearly']);
    expect(d.solidAnswerQuotes).not.toContain('I partly said b');
    expect(d.solidAnswerQuotes).not.toContain('I said c incorrectly');
  });
});

describe('decideMasteryAndReview — adversarial misconception (HIGH-8)', () => {
  it('any misconception blocks mastery even if all other concepts are solid', () => {
    const mostlySolid: ChallengeRoundEvaluationItem[] = [
      {
        concept: 'a',
        result: 'solid',
        evidence: 'x',
        answerEventId: 'e1',
        learnerQuote: 'solid a',
      },
      {
        concept: 'b',
        result: 'solid',
        evidence: 'y',
        answerEventId: 'e2',
        learnerQuote: 'solid b',
      },
      {
        concept: 'c',
        result: 'misconception',
        evidence: 'subtle wrong idea',
        correction: 'right idea',
        answerEventId: 'e3',
        learnerQuote: 'wrong c',
      },
    ];
    const d = decideMasteryAndReview(mostlySolid);
    expect(d.markMasteryVerified).toBe(false);
    expect(d.outcome).toBe('partial');
    expect(d.reviewTargets.map((r) => r.concept)).toEqual(['c']);
  });

  it('a single partial also blocks mastery', () => {
    const oneShaky: ChallengeRoundEvaluationItem[] = [
      ...allSolid.slice(0, 2),
      {
        concept: 'c',
        result: 'partial',
        evidence: 'incomplete',
        answerEventId: 'e3',
        learnerQuote: 'mostly c',
      },
    ];
    expect(decideMasteryAndReview(oneShaky).markMasteryVerified).toBe(false);
  });
});

describe('decideMasteryAndReview — reteach / invalid edge cases', () => {
  it('all missing → outcome=reteach, no note, no mastery, no review targets', () => {
    const d = decideMasteryAndReview(allMissing);
    expect(d.outcome).toBe('reteach');
    expect(d.markMasteryVerified).toBe(false);
    expect(d.solidConcepts).toEqual([]);
    expect(d.solidAnswerQuotes).toEqual([]);
    expect(d.reviewTargets).toEqual([]);
  });

  // CRIT-9: a naive `solidCount === evals.length` check returns true for
  // `0 === 0`. The guard must short-circuit on empty input BEFORE that
  // check, returning `outcome: 'invalid'` so no mastery is recorded for
  // a Challenge Round that produced no evaluations (LLM failure, abort,
  // schema rejection, etc.).
  it('empty evaluations → outcome=invalid, never marks mastery (CRIT-9)', () => {
    const d = decideMasteryAndReview([]);
    expect(d.outcome).toBe('invalid');
    expect(d.markMasteryVerified).toBe(false);
    expect(d.solidConcepts).toEqual([]);
    expect(d.solidAnswerQuotes).toEqual([]);
    expect(d.reviewTargets).toEqual([]);
  });

  it('only missing + partial → outcome=partial (not reteach)', () => {
    const oneMissingOnePartial: ChallengeRoundEvaluationItem[] = [
      {
        concept: 'a',
        result: 'missing',
        evidence: 'no answer',
        answerEventId: 'e1',
        learnerQuote: 'idk',
      },
      {
        concept: 'b',
        result: 'partial',
        evidence: 'half-answer',
        answerEventId: 'e2',
        learnerQuote: 'mostly b',
      },
    ];
    const d = decideMasteryAndReview(oneMissingOnePartial);
    expect(d.outcome).toBe('partial');
    expect(d.reviewTargets.map((r) => r.concept)).toEqual(['b']);
  });
});

describe('summarizeEvaluation', () => {
  it('counts per result bucket', () => {
    expect(summarizeEvaluation(mixed)).toEqual({
      solid: 1,
      partial: 1,
      missing: 0,
      misconception: 1,
      total: 3,
    });
  });

  it('returns zeros for an empty list', () => {
    expect(summarizeEvaluation([])).toEqual({
      solid: 0,
      partial: 0,
      missing: 0,
      misconception: 0,
      total: 0,
    });
  });

  it('sums correctly across all four buckets', () => {
    const full: ChallengeRoundEvaluationItem[] = [
      ...allSolid,
      ...allMissing,
      ...mixed,
    ];
    const s = summarizeEvaluation(full);
    expect(s.total).toBe(allSolid.length + allMissing.length + mixed.length);
    expect(s.solid).toBe(4);
    expect(s.partial).toBe(1);
    expect(s.missing).toBe(2);
    expect(s.misconception).toBe(1);
  });
});
