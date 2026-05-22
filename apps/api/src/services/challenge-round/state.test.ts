import type {
  ChallengeRoundEvaluationItem,
  ChallengeRoundSessionState,
} from '@eduagent/schemas';
import { transitionChallengeState } from './state';

const TOPIC_ID = '11111111-1111-1111-1111-111111111111';

function evalItem(
  overrides: Partial<ChallengeRoundEvaluationItem> = {},
): ChallengeRoundEvaluationItem {
  return {
    concept: 'photosynthesis',
    result: 'solid',
    evidence: 'learner described chloroplast role correctly',
    answerEventId: '00000000-0000-0000-0000-000000000001',
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
            answerEventId: '00000000-0000-0000-0000-000000000001',
          }),
        ],
      },
      {
        type: 'answer_complete',
        evaluation: [
          evalItem({
            concept: 'b',
            answerEventId: '00000000-0000-0000-0000-000000000002',
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
            answerEventId: '00000000-0000-0000-0000-000000000001',
          }),
          evalItem({
            concept: 'b',
            answerEventId: '00000000-0000-0000-0000-000000000002',
          }),
        ],
      },
      {
        type: 'answer_complete',
        evaluation: [
          evalItem({
            concept: 'c',
            answerEventId: '00000000-0000-0000-0000-000000000003',
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
            answerEventId: '00000000-0000-0000-0000-000000000001',
          }),
          evalItem({
            concept: 'b',
            answerEventId: '00000000-0000-0000-0000-000000000002',
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
