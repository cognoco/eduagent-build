const mockGetStepDatabase = jest.fn();
const mockCreatePendingSessionSummary = jest.fn();
const mockGenerateAndStoreLlmSummary = jest.fn();
const mockGenerateLearnerRecap = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
  };
});

jest.mock(
  '../../services/summaries' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/summaries',
    ) as typeof import('../../services/summaries');
    return {
      ...actual,
      createPendingSessionSummary: (...args: unknown[]) =>
        mockCreatePendingSessionSummary(...args),
    };
  },
);

jest.mock(
  '../../services/session-llm-summary' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/session-llm-summary',
    ) as typeof import('../../services/session-llm-summary');
    return {
      ...actual,
      generateAndStoreLlmSummary: (...args: unknown[]) =>
        mockGenerateAndStoreLlmSummary(...args),
    };
  },
);

jest.mock(
  '../../services/session-recap' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/session-recap',
    ) as typeof import('../../services/session-recap');
    return {
      ...actual,
      generateLearnerRecap: (...args: unknown[]) =>
        mockGenerateLearnerRecap(...args),
    };
  },
);

jest.mock('../../services/sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

import {
  sessionSummaryCreate,
  sessionSummaryRegenerate,
} from './summary-regenerate';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

describe('summary-regenerate handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue({});
  });

  it('creates a missing summary row and emits app/session.summary.generated', async () => {
    mockCreatePendingSessionSummary.mockResolvedValue({ id: 'summary-1' });
    mockGenerateAndStoreLlmSummary.mockResolvedValue({
      narrative:
        'Worked through algebra and balancing equations while checking each inverse operation.',
      topicsCovered: ['algebra', 'balancing equations'],
      sessionState: 'completed',
      reEntryRecommendation:
        'Start with one more one-step equation and ask the learner to narrate each move.',
    });

    const { step, sendEventCalls } = createInngestStepRunner();
    const handler = (sessionSummaryCreate as any).fn;
    const result = await handler({
      event: {
        data: {
          profileId: 'profile-1',
          sessionId: 'session-1',
          subjectId: 'subject-1',
          topicId: 'topic-1',
        },
      },
      step,
    });

    expect(result).toEqual({ status: 'completed', summaryId: 'summary-1' });
    expect(sendEventCalls).toEqual(
      expect.arrayContaining([
        {
          name: 'notify-session-summary-created',
          payload: expect.objectContaining({
            name: 'app/session.summary.generated',
            data: expect.objectContaining({
              sessionSummaryId: 'summary-1',
              profileId: 'profile-1',
              sessionId: 'session-1',
            }),
          }),
        },
      ]),
    );
  });

  it('emits app/session.summary.failed when regeneration returns null', async () => {
    mockGenerateAndStoreLlmSummary.mockResolvedValue(null);

    const { step, sendEventCalls } = createInngestStepRunner();
    const handler = (sessionSummaryRegenerate as any).fn;
    const result = await handler({
      event: {
        data: {
          profileId: 'profile-1',
          sessionId: 'session-1',
          sessionSummaryId: 'summary-1',
          subjectId: 'subject-1',
          topicId: 'topic-1',
        },
      },
      step,
    });

    expect(result).toEqual({
      status: 'skipped_no_summary',
      regenerated: false,
    });
    expect(sendEventCalls).toEqual(
      expect.arrayContaining([
        {
          name: 'notify-session-summary-regenerate-failed',
          payload: expect.objectContaining({
            name: 'app/session.summary.failed',
            data: expect.objectContaining({
              sessionSummaryId: 'summary-1',
              profileId: 'profile-1',
              sessionId: 'session-1',
            }),
          }),
        },
      ]),
    );
  });
});
