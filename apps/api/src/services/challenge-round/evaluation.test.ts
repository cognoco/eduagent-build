import type { ChallengeRoundEvaluationItem } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import {
  decideMasteryAndReview,
  summarizeEvaluation,
  validateEvaluationEventIds,
} from './evaluation';

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

// ---------------------------------------------------------------------------
// [#477] validateEvaluationEventIds — answerEventId ownership guard
// ---------------------------------------------------------------------------
//
// Break tests (red-green pattern):
//   1. An answerEventId that belongs to another profile → whole evaluation
//      rejected (strict mode). Re-verify by removing the throw — test fails.
//   2. Valid IDs from the correct session → learnerQuote replaced with real
//      event content so validateNoteDraft cannot be fed LLM-supplied text.
//
// DB is mocked as a minimal object (not jest.mock — no module replacement).
// createScopedRepository(db, profileId) calls db.query.sessionEvents.findMany
// internally; we control the returned rows to exercise both paths.

// Unit-mock: multi-table join not required — guard only needs sessionEvents rows to verify profileId ownership.
function makeSessionEventsDb(rows: Array<{ id: string; content: string }>) {
  return {
    query: {
      sessionEvents: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    },
  } as unknown as Database;
}

describe('validateEvaluationEventIds — [#477] ownership guard', () => {
  const profileId = 'profile-owner';
  const sessionId = 'session-abc';

  const evals: ChallengeRoundEvaluationItem[] = [
    {
      concept: 'a',
      result: 'solid',
      evidence: 'x',
      answerEventId: 'evt-1',
      learnerQuote: 'LLM-supplied quote for a',
    },
    {
      concept: 'b',
      result: 'partial',
      evidence: 'y',
      answerEventId: 'evt-2',
      learnerQuote: 'LLM-supplied quote for b',
    },
  ];

  it('[#477] rejects the whole evaluation when any answerEventId is missing from the session', async () => {
    // DB returns only evt-1; evt-2 absent (belongs to another profile/session).
    // Strict mode: even one missing id → throw → caller treats as invalid.
    const db = makeSessionEventsDb([
      { id: 'evt-1', content: 'real content a' },
    ]);
    await expect(
      validateEvaluationEventIds(db, profileId, sessionId, evals),
    ).rejects.toThrow('[#477]');
  });

  it('[#477] rejects when no IDs match (all belong to another profile/session)', async () => {
    const db = makeSessionEventsDb([]);
    await expect(
      validateEvaluationEventIds(db, profileId, sessionId, evals),
    ).rejects.toThrow('[#477]');
  });

  it('[#477] replaces LLM-supplied learnerQuote with actual event content when all IDs are valid', async () => {
    const db = makeSessionEventsDb([
      { id: 'evt-1', content: 'real learner answer for a' },
      { id: 'evt-2', content: 'real learner answer for b' },
    ]);
    const validated = await validateEvaluationEventIds(
      db,
      profileId,
      sessionId,
      evals,
    );
    // LLM-supplied quotes replaced by verified DB content.
    expect(validated[0]!.learnerQuote).toBe('real learner answer for a');
    expect(validated[1]!.learnerQuote).toBe('real learner answer for b');
    // Other fields are preserved.
    expect(validated[0]!.concept).toBe('a');
    expect(validated[1]!.result).toBe('partial');
  });

  it('[#477] returns empty array without hitting DB when evals is empty', async () => {
    const db = makeSessionEventsDb([]);
    const validated = await validateEvaluationEventIds(
      db,
      profileId,
      sessionId,
      [],
    );
    expect(validated).toEqual([]);
    expect(
      (db.query.sessionEvents.findMany as jest.Mock).mock.calls.length,
    ).toBe(0);
  });
});
