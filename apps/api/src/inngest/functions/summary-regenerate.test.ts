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

import { NonRetriableError } from 'inngest';
import {
  sessionSummaryCreate,
  sessionSummaryRegenerate,
  learnerRecapRegenerate,
} from './summary-regenerate';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

// Use valid v4 UUIDs — summaryEventPayloadSchema validates uuid format (RFC 4122)
const PROFILE_ID = 'a1b2c3d4-e5f6-4111-8111-a1b2c3d4e5f6';
const SESSION_ID = 'b2c3d4e5-f6a1-4222-8222-b2c3d4e5f6a1';
const SUBJECT_ID = 'c3d4e5f6-a1b2-4333-8333-c3d4e5f6a1b2';
const TOPIC_ID = 'd4e5f6a1-b2c3-4444-8444-d4e5f6a1b2c3';
const SUMMARY_ID = 'e5f6a1b2-c3d4-4555-8555-e5f6a1b2c3d4';
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

describe('summary-regenerate handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure existing tests exercise the legacy (flag-off) path — the v2 path
    // (getPersonLlmContext) requires a db.query.person mock that is not wired
    // here. v2-path coverage belongs in a separate v2 test block (CUT-B3).
    // [WI-586 C6] flag-off isolation: delete any ambient IDENTITY_V2_ENABLED.
    delete process.env['IDENTITY_V2_ENABLED'];
    // i18n Phase 1: summary-regenerate calls db.select({conversationLanguage}).from(profiles).where(...).limit(1)
    const mockSelectLimit = jest
      .fn()
      .mockResolvedValue([{ conversationLanguage: null }]);
    const mockSelectWhere = jest
      .fn()
      .mockReturnValue({ limit: mockSelectLimit });
    const mockSelectFrom = jest
      .fn()
      .mockReturnValue({ where: mockSelectWhere });
    const mockSelect = jest.fn().mockReturnValue({ from: mockSelectFrom });
    mockGetStepDatabase.mockReturnValue({ select: mockSelect });
  });

  it('creates a missing summary row and emits app/session.summary.generated', async () => {
    mockCreatePendingSessionSummary.mockResolvedValue({ id: SUMMARY_ID });
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
          profileId: PROFILE_ID,
          sessionId: SESSION_ID,
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
          timestamp: TIMESTAMP,
        },
      },
      step,
    });

    expect(result).toEqual({ status: 'completed', summaryId: SUMMARY_ID });
    expect(sendEventCalls).toEqual(
      expect.arrayContaining([
        {
          name: 'notify-session-summary-created',
          payload: expect.objectContaining({
            name: 'app/session.summary.generated',
            data: expect.objectContaining({
              sessionSummaryId: SUMMARY_ID,
              profileId: PROFILE_ID,
              sessionId: SESSION_ID,
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
          profileId: PROFILE_ID,
          sessionId: SESSION_ID,
          sessionSummaryId: SUMMARY_ID,
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
          timestamp: TIMESTAMP,
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
              sessionSummaryId: SUMMARY_ID,
              profileId: PROFILE_ID,
              sessionId: SESSION_ID,
            }),
          }),
        },
      ]),
    );
  });

  // ---------------------------------------------------------------------------
  // [FIX-425] Break tests — payload validation for sessionSummaryRegenerate
  // ---------------------------------------------------------------------------

  describe('[FIX-425] sessionSummaryRegenerate payload validation', () => {
    it('throws NonRetriableError and skips LLM when profileId is not a UUID', async () => {
      const { step } = createInngestStepRunner();
      const handler = (sessionSummaryRegenerate as any).fn;
      await expect(
        handler({
          event: {
            data: {
              profileId: 'not-a-uuid',
              sessionId: SESSION_ID,
              sessionSummaryId: SUMMARY_ID,
              timestamp: TIMESTAMP,
            },
          },
          step,
        }),
      ).rejects.toThrow(NonRetriableError);
      expect(mockGenerateAndStoreLlmSummary).not.toHaveBeenCalled();
    });

    it('throws NonRetriableError and skips LLM when sessionId is missing', async () => {
      const { step } = createInngestStepRunner();
      const handler = (sessionSummaryRegenerate as any).fn;
      await expect(
        handler({
          event: {
            data: {
              profileId: PROFILE_ID,
              sessionSummaryId: SUMMARY_ID,
              timestamp: TIMESTAMP,
            },
          },
          step,
        }),
      ).rejects.toThrow(NonRetriableError);
      expect(mockGenerateAndStoreLlmSummary).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // [FIX-428] Break tests — payload validation for sessionSummaryCreate
  // ---------------------------------------------------------------------------

  describe('[FIX-428] sessionSummaryCreate payload validation', () => {
    it('throws NonRetriableError and skips LLM when profileId is not a UUID', async () => {
      const { step } = createInngestStepRunner();
      const handler = (sessionSummaryCreate as any).fn;
      await expect(
        handler({
          event: {
            data: {
              profileId: 'not-a-uuid',
              sessionId: SESSION_ID,
              timestamp: TIMESTAMP,
            },
          },
          step,
        }),
      ).rejects.toThrow(NonRetriableError);
      expect(mockCreatePendingSessionSummary).not.toHaveBeenCalled();
      expect(mockGenerateAndStoreLlmSummary).not.toHaveBeenCalled();
    });

    it('throws NonRetriableError and skips LLM when sessionId is missing', async () => {
      const { step } = createInngestStepRunner();
      const handler = (sessionSummaryCreate as any).fn;
      await expect(
        handler({
          event: {
            data: { profileId: PROFILE_ID, timestamp: TIMESTAMP },
          },
          step,
        }),
      ).rejects.toThrow(NonRetriableError);
      expect(mockCreatePendingSessionSummary).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // [FIX-429] Break tests — payload validation for learnerRecapRegenerate
  // ---------------------------------------------------------------------------

  describe('[FIX-429] learnerRecapRegenerate payload validation', () => {
    it('throws NonRetriableError and skips LLM recap when profileId is not a UUID', async () => {
      const { step } = createInngestStepRunner();
      const handler = (learnerRecapRegenerate as any).fn;
      await expect(
        handler({
          event: {
            data: {
              profileId: 'not-a-uuid',
              sessionId: SESSION_ID,
              timestamp: TIMESTAMP,
            },
          },
          step,
        }),
      ).rejects.toThrow(NonRetriableError);
      expect(mockGenerateLearnerRecap).not.toHaveBeenCalled();
    });

    it('throws NonRetriableError and skips LLM recap when sessionId is missing', async () => {
      const { step } = createInngestStepRunner();
      const handler = (learnerRecapRegenerate as any).fn;
      await expect(
        handler({
          event: {
            data: { profileId: PROFILE_ID, timestamp: TIMESTAMP },
          },
          step,
        }),
      ).rejects.toThrow(NonRetriableError);
      expect(mockGenerateLearnerRecap).not.toHaveBeenCalled();
    });
  });
});
