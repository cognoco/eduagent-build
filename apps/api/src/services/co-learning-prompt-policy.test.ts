import { RateLimitedError } from '@eduagent/schemas';

import {
  CoLearningPromptPolicyError,
  assertCoLearningPromptAllowed,
} from './co-learning-prompt-policy';
import { NUDGE_RATE_LIMIT } from './nudge';

const BASE = {
  supportershipId: '00000000-0000-4000-8000-000000000001',
  supporterPersonId: '00000000-0000-4000-8000-000000000002',
  supporteePersonId: '00000000-0000-4000-8000-000000000003',
};

describe('co-learning prompt policy', () => {
  it('allows optional connection framing and returns fill-only no-receipt payloads', () => {
    const payload = assertCoLearningPromptAllowed({
      ...BASE,
      suggestedText: 'Zuzana learned this too. Want to explain it back?',
      now: new Date('2026-06-20T12:00:00.000Z'),
    });

    expect(payload).toMatchObject({
      dismissible: true,
      fillOnly: true,
      readReceipt: false,
    });
    expect('openedAt' in payload).toBe(false);
    expect('dismissedAt' in payload).toBe(false);
  });

  it('blocks parent-quiz and obligation framing', () => {
    expect(() =>
      assertCoLearningPromptAllowed({
        ...BASE,
        suggestedText: 'Mum wants to quiz you. Prove you understand it.',
      }),
    ).toThrow(CoLearningPromptPolicyError);
  });

  it('consults the nudge limiter', () => {
    expect(() =>
      assertCoLearningPromptAllowed({
        ...BASE,
        suggestedText: 'Zuzana learned this too. Want to explain it back?',
        recentPromptCount: NUDGE_RATE_LIMIT,
      }),
    ).toThrow(RateLimitedError);
  });
});
