import type {
  ChallengeRoundEvaluationItem,
  ChallengeRoundSessionState,
} from '@eduagent/schemas';
import {
  transitionChallengeState,
  resolveGraderStallTermination,
} from './state';
import { MAX_CHALLENGE_QUESTIONS } from './caps';
import { TEST_TOPIC_ID } from '@eduagent/test-utils';

const TOPIC_ID = TEST_TOPIC_ID;

function evalItem(
  overrides: Partial<ChallengeRoundEvaluationItem> = {},
): ChallengeRoundEvaluationItem {
  return {
    concept: 'photosynthesis',
    result: 'solid',
    evidence: 'learner described chloroplast role correctly',
    answerEventId: '00000000-0000-4000-8000-000000000001',
    learnerQuote: 'plants use chloroplasts to capture light',
    ...overrides,
  };
}

const baseState: ChallengeRoundSessionState = {
  state: 'offered',
  offerCount: 1,
  topicId: TOPIC_ID,
  declinedDontAskAgain: false,
  evaluations: [],
};

describe('transitionChallengeState — offer', () => {
  it('undefined → offered with offerCount=1', () => {
    const next = transitionChallengeState(undefined, {
      type: 'offer',
      topicId: TOPIC_ID,
    });
    expect(next?.state).toBe('offered');
    expect(next?.offerCount).toBe(1);
    expect(next?.topicId).toBe(TOPIC_ID);
    expect(next?.declinedDontAskAgain).toBe(false);
    expect(next?.evaluations).toEqual([]);
  });

  it('complete → offered increments offerCount', () => {
    const next = transitionChallengeState(
      { ...baseState, state: 'complete', offerCount: 2 },
      { type: 'offer', topicId: TOPIC_ID },
    );
    expect(next?.state).toBe('offered');
    expect(next?.offerCount).toBe(3);
  });

  it('aborted → offered is allowed', () => {
    const next = transitionChallengeState(
      { ...baseState, state: 'aborted' },
      { type: 'offer', topicId: TOPIC_ID },
    );
    expect(next?.state).toBe('offered');
  });

  it('rejects offer from a live state (active)', () => {
    expect(() =>
      transitionChallengeState(
        { ...baseState, state: 'active' },
        { type: 'offer', topicId: TOPIC_ID },
      ),
    ).toThrow(/illegal/i);
  });
});

describe('transitionChallengeState — accept / decline', () => {
  it('offered → accepted', () => {
    const next = transitionChallengeState(baseState, { type: 'accept' });
    expect(next?.state).toBe('accepted');
  });

  it('offered → declined preserves dontAskAgain=true', () => {
    const next = transitionChallengeState(baseState, {
      type: 'decline',
      dontAskAgain: true,
    });
    expect(next?.state).toBe('declined');
    expect(next?.declinedDontAskAgain).toBe(true);
  });

  it('offered → declined preserves dontAskAgain=false (one-off skip)', () => {
    const next = transitionChallengeState(baseState, {
      type: 'decline',
      dontAskAgain: false,
    });
    expect(next?.declinedDontAskAgain).toBe(false);
  });

  it('rejects accept from a non-offered state', () => {
    expect(() =>
      transitionChallengeState(
        { ...baseState, state: 'active' },
        { type: 'accept' },
      ),
    ).toThrow(/illegal/i);
  });

  it('rejects decline from a non-offered state', () => {
    expect(() =>
      transitionChallengeState(
        { ...baseState, state: 'accepted' },
        { type: 'decline', dontAskAgain: false },
      ),
    ).toThrow(/illegal/i);
  });
});

describe('transitionChallengeState — start', () => {
  it('accepted → active with questionIndex=0, startedAt, capped totalQuestions', () => {
    const next = transitionChallengeState(
      { ...baseState, state: 'accepted' },
      { type: 'start', totalQuestions: 5 },
    );
    expect(next?.state).toBe('active');
    expect(next?.questionIndex).toBe(0);
    expect(next?.totalQuestions).toBe(3);
    expect(next?.startedAt).toBeDefined();
  });

  it('accepted → active floors a 0 request to 1', () => {
    const next = transitionChallengeState(
      { ...baseState, state: 'accepted' },
      { type: 'start', totalQuestions: 0 },
    );
    expect(next?.totalQuestions).toBe(1);
  });

  it('rejects start from a non-accepted state', () => {
    expect(() =>
      transitionChallengeState(baseState, {
        type: 'start',
        totalQuestions: 3,
      }),
    ).toThrow(/illegal/i);
  });
});

describe('transitionChallengeState — answer_complete', () => {
  it('active → active when more questions remain; preserves prior evaluations', () => {
    const next = transitionChallengeState(
      {
        ...baseState,
        state: 'active',
        questionIndex: 0,
        totalQuestions: 3,
        evaluations: [
          evalItem({
            concept: 'a',
            answerEventId: '00000000-0000-4000-8000-000000000001',
          }),
        ],
      },
      {
        type: 'answer_complete',
        evaluation: [
          evalItem({
            concept: 'b',
            answerEventId: '00000000-0000-4000-8000-000000000002',
          }),
        ],
      },
    );
    expect(next?.state).toBe('active');
    expect(next?.questionIndex).toBe(1);
    expect(next?.evaluations).toHaveLength(2);
    expect(next?.evaluations.map((e) => e.concept)).toEqual(['a', 'b']);
  });

  it('active → drafting on last answer; preserves all evaluations', () => {
    const next = transitionChallengeState(
      {
        ...baseState,
        state: 'active',
        questionIndex: 2,
        totalQuestions: 3,
        evaluations: [
          evalItem({
            concept: 'a',
            answerEventId: '00000000-0000-4000-8000-000000000001',
          }),
          evalItem({
            concept: 'b',
            answerEventId: '00000000-0000-4000-8000-000000000002',
          }),
        ],
      },
      {
        type: 'answer_complete',
        evaluation: [
          evalItem({
            concept: 'c',
            answerEventId: '00000000-0000-4000-8000-000000000003',
          }),
        ],
      },
    );
    expect(next?.state).toBe('drafting');
    expect(next?.evaluations).toHaveLength(3);
  });

  it('accepts multiple evaluations from one answer batch', () => {
    const next = transitionChallengeState(
      {
        ...baseState,
        state: 'active',
        questionIndex: 0,
        totalQuestions: 3,
        evaluations: [],
      },
      {
        type: 'answer_complete',
        evaluation: [
          evalItem({
            concept: 'a',
            answerEventId: '00000000-0000-4000-8000-000000000001',
          }),
          evalItem({
            concept: 'b',
            answerEventId: '00000000-0000-4000-8000-000000000002',
          }),
        ],
      },
    );
    expect(next?.evaluations).toHaveLength(2);
    expect(next?.questionIndex).toBe(1);
  });

  it('rejects answer_complete from a non-active state', () => {
    expect(() =>
      transitionChallengeState(
        { ...baseState, state: 'drafting' },
        { type: 'answer_complete', evaluation: [evalItem()] },
      ),
    ).toThrow(/illegal/i);
  });

  // [FCR-2026-05-23-L1.C1.15] A partially deserialized `active` state (one of
  // questionIndex/totalQuestions missing) must fail safe to a terminal-ward
  // state rather than loop in `active` forever via divergent `??` fallbacks.
  describe('partial deserialization fails safe (no infinite loop)', () => {
    it('active with totalQuestions missing terminates to drafting', () => {
      const next = transitionChallengeState(
        {
          ...baseState,
          state: 'active',
          questionIndex: 1,
          // totalQuestions omitted — partially deserialized blob
          evaluations: [],
        } as ChallengeRoundSessionState,
        { type: 'answer_complete', evaluation: [evalItem()] },
      );
      expect(next?.state).toBe('drafting');
      // total is resolved to a coherent, capped value, never left undefined.
      expect(next?.totalQuestions).toBe(3);
    });

    it('active with questionIndex missing terminates to drafting', () => {
      const next = transitionChallengeState(
        {
          ...baseState,
          state: 'active',
          totalQuestions: 3,
          // questionIndex omitted — partially deserialized blob
          evaluations: [],
        } as ChallengeRoundSessionState,
        { type: 'answer_complete', evaluation: [evalItem()] },
      );
      expect(next?.state).toBe('drafting');
      expect(next?.totalQuestions).toBe(3);
    });

    it('active with both index/total missing terminates to drafting', () => {
      const next = transitionChallengeState(
        {
          ...baseState,
          state: 'active',
          evaluations: [],
        } as ChallengeRoundSessionState,
        { type: 'answer_complete', evaluation: [evalItem()] },
      );
      expect(next?.state).toBe('drafting');
    });

    it('active with index already past an over-cap total cannot loop', () => {
      // A corrupt persisted state where totalQuestions exceeds the hard cap
      // and the index sits beyond the real cap must not keep asking forever —
      // it terminates on the next answer_complete.
      const next = transitionChallengeState(
        {
          ...baseState,
          state: 'active',
          questionIndex: 9,
          totalQuestions: 9,
          evaluations: [],
        } as ChallengeRoundSessionState,
        { type: 'answer_complete', evaluation: [evalItem()] },
      );
      expect(next?.state).toBe('drafting');
      expect(next?.totalQuestions).toBe(3);
    });

    it('a well-formed active state still advances normally', () => {
      const next = transitionChallengeState(
        {
          ...baseState,
          state: 'active',
          questionIndex: 0,
          totalQuestions: 3,
          evaluations: [],
        },
        { type: 'answer_complete', evaluation: [evalItem()] },
      );
      expect(next?.state).toBe('active');
      expect(next?.questionIndex).toBe(1);
    });
  });
});

describe('transitionChallengeState — draft_ready / complete / abort', () => {
  it('drafting → drafting on draft_ready (idempotent acknowledgement)', () => {
    const prev: ChallengeRoundSessionState = {
      ...baseState,
      state: 'drafting',
    };
    expect(transitionChallengeState(prev, { type: 'draft_ready' })).toEqual(
      prev,
    );
  });

  it('rejects draft_ready from a non-drafting state', () => {
    expect(() =>
      transitionChallengeState(
        { ...baseState, state: 'active' },
        {
          type: 'draft_ready',
        },
      ),
    ).toThrow(/illegal/i);
  });

  it('drafting → complete', () => {
    const next = transitionChallengeState(
      { ...baseState, state: 'drafting' },
      { type: 'complete' },
    );
    expect(next?.state).toBe('complete');
  });

  it('active → complete (early finish path)', () => {
    const next = transitionChallengeState(
      { ...baseState, state: 'active' },
      { type: 'complete' },
    );
    expect(next?.state).toBe('complete');
  });

  it('rejects complete from an offered/accepted/declined state', () => {
    for (const state of ['offered', 'accepted', 'declined'] as const) {
      expect(() =>
        transitionChallengeState({ ...baseState, state }, { type: 'complete' }),
      ).toThrow(/illegal/i);
    }
  });

  it('abort works from any defined state', () => {
    for (const state of [
      'offered',
      'accepted',
      'declined',
      'active',
      'drafting',
      'complete',
    ] as const) {
      const next = transitionChallengeState(
        { ...baseState, state },
        { type: 'abort' },
      );
      expect(next?.state).toBe('aborted');
    }
  });

  it('abort is a no-op when there is no prior round', () => {
    expect(
      transitionChallengeState(undefined, { type: 'abort' }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T9 — resolveGraderStallTermination (grader stall terminal guard)
// Plan: 2026-06-26-challenge-round-grader-judge §T9
//
// Regression spec: when the grader fail-opens to [] on every active turn,
// questionIndex never advances (answer_complete never fires), and the round
// stays active forever. The guard fires when questionsAsked reaches
// MAX_CHALLENGE_QUESTIONS while evaluations.length < questionsAsked.
// ---------------------------------------------------------------------------

describe('resolveGraderStallTermination', () => {
  const TOPIC_ID_STALL = '22222222-2222-2222-2222-222222222222';

  function stallActiveState(
    questionsAsked: number,
    evaluations: ChallengeRoundEvaluationItem[],
  ): ChallengeRoundSessionState {
    return {
      state: 'active',
      offerCount: 1,
      topicId: TOPIC_ID_STALL,
      declinedDontAskAgain: false,
      questionIndex: 0,
      totalQuestions: MAX_CHALLENGE_QUESTIONS,
      questionsAsked,
      evaluations,
    };
  }

  it('does not fire when questionsAsked < MAX_CHALLENGE_QUESTIONS', () => {
    const result = resolveGraderStallTermination(
      stallActiveState(MAX_CHALLENGE_QUESTIONS - 1, []),
    );
    expect(result).toBeUndefined();
  });

  it('does not fire when all questions have evaluations (no stall)', () => {
    const evals: ChallengeRoundEvaluationItem[] = Array.from(
      { length: MAX_CHALLENGE_QUESTIONS },
      (_, i) => ({
        concept: `concept ${i}`,
        result: 'solid' as const,
        evidence: 'ok',
        answerEventId: `00000000-0000-4000-8000-00000000000${i + 1}`,
        learnerQuote: 'quote',
      }),
    );
    const result = resolveGraderStallTermination(
      stallActiveState(MAX_CHALLENGE_QUESTIONS, evals),
    );
    expect(result).toBeUndefined();
  });

  it('does not fire for non-active state', () => {
    const drafting: ChallengeRoundSessionState = {
      state: 'drafting',
      offerCount: 1,
      topicId: TOPIC_ID_STALL,
      declinedDontAskAgain: false,
      questionsAsked: MAX_CHALLENGE_QUESTIONS,
      evaluations: [],
    };
    expect(resolveGraderStallTermination(drafting)).toBeUndefined();
  });

  // T9 key regression: MAX_CHALLENGE_QUESTIONS=3, 3 asked, 1 evaluation
  // (exactly the grader fail-open stall scenario). The guard must fire and
  // return a terminal NON-ACTIVE state so the round cannot loop forever.
  // markMasteryVerified is NEVER true because the state is `complete` and
  // finalizeChallengeRoundIfReady skips non-drafting states entirely.
  it('[T9 RED→GREEN] 3 questions asked, 1 recorded evaluation → terminal complete state', () => {
    const onePartialEval: ChallengeRoundEvaluationItem = {
      concept: 'collision theory',
      result: 'partial',
      evidence: 'partial understanding shown',
      answerEventId: '00000000-0000-4000-8000-000000000001',
      learnerQuote: 'particles move faster',
    };

    const state = stallActiveState(MAX_CHALLENGE_QUESTIONS, [onePartialEval]);
    // Precondition: questionsAsked (3) >= MAX (3) AND evaluations.length (1) < questionsAsked (3)
    expect(state.questionsAsked).toBe(MAX_CHALLENGE_QUESTIONS);
    expect(state.evaluations.length).toBeLessThan(MAX_CHALLENGE_QUESTIONS);

    const terminal = resolveGraderStallTermination(state);

    // Guard must fire: result is defined
    expect(terminal).toBeDefined();
    // Result MUST be terminal — not active (the round cannot loop)
    expect(terminal?.state).not.toBe('active');
    // With no solid evaluations, goes to complete (no note, no mastery path)
    expect(terminal?.state).toBe('complete');
    // Evaluations are preserved in the terminal state
    expect(terminal?.evaluations).toEqual([onePartialEval]);
  });

  it('3 questions asked, 0 evaluations (all grader failures) → complete', () => {
    const terminal = resolveGraderStallTermination(
      stallActiveState(MAX_CHALLENGE_QUESTIONS, []),
    );
    expect(terminal?.state).toBe('complete');
  });

  it('questionsAsked defaults from undefined (legacy state) — guard treats as 0, no fire', () => {
    // A state persisted before questionsAsked was added has questionsAsked=undefined.
    // The ?? 0 default means it reads as 0, which is < MAX, so the guard does not fire.
    const legacy: ChallengeRoundSessionState = {
      state: 'active',
      offerCount: 1,
      topicId: TOPIC_ID_STALL,
      declinedDontAskAgain: false,
      questionIndex: 0,
      totalQuestions: MAX_CHALLENGE_QUESTIONS,
      // questionsAsked is absent (undefined) — pre-T9 persisted state
      evaluations: [],
    };
    expect(resolveGraderStallTermination(legacy)).toBeUndefined();
  });
});
