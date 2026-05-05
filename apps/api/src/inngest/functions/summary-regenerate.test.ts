const mockGetStepDatabase = jest.fn();
const mockCreatePendingSessionSummary = jest.fn();
const mockGenerateAndStoreLlmSummary = jest.fn();
const mockGenerateLearnerRecap = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('../helpers', () => ({
  getStepDatabase: () => mockGetStepDatabase(),
}));

jest.mock('../../services/summaries', () => ({
  createPendingSessionSummary: (...args: unknown[]) =>
    mockCreatePendingSessionSummary(...args),
}));

jest.mock('../../services/session-llm-summary', () => ({
  generateAndStoreLlmSummary: (...args: unknown[]) =>
    mockGenerateAndStoreLlmSummary(...args),
}));

jest.mock('../../services/session-recap', () => ({
  generateLearnerRecap: (...args: unknown[]) =>
    mockGenerateLearnerRecap(...args),
}));

jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import {
  sessionSummaryCreate,
  sessionSummaryRegenerate,
} from './summary-regenerate';

function createStep() {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
}

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

    const step = createStep();
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
    expect(step.sendEvent).toHaveBeenCalledWith(
      'notify-session-summary-created',
      expect.objectContaining({
        name: 'app/session.summary.generated',
        data: expect.objectContaining({
          sessionSummaryId: 'summary-1',
          profileId: 'profile-1',
          sessionId: 'session-1',
        }),
      })
    );
  });

  it('emits app/session.summary.failed when regeneration returns null', async () => {
    mockGenerateAndStoreLlmSummary.mockResolvedValue(null);

    const step = createStep();
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
    expect(step.sendEvent).toHaveBeenCalledWith(
      'notify-session-summary-regenerate-failed',
      expect.objectContaining({
        name: 'app/session.summary.failed',
        data: expect.objectContaining({
          sessionSummaryId: 'summary-1',
          profileId: 'profile-1',
          sessionId: 'session-1',
        }),
      })
    );
  });
});
