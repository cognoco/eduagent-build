const mockGetStepDatabase = jest.fn();

jest.mock('../helpers', () => ({
  getStepDatabase: () => mockGetStepDatabase(),
}));

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (
        config: Record<string, unknown>,
        _trigger: unknown,
        handler: (...a: unknown[]) => unknown
      ) => ({ fn: handler, onFailure: config.onFailure, config })
    ),
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockExtractSignals = jest.fn();
const mockPersistCurriculum = jest.fn();
jest.mock('../../services/interview', () => ({
  ...jest.requireActual('../../services/interview'),
  extractSignals: (...args: unknown[]) => mockExtractSignals(...args),
  persistCurriculum: (...args: unknown[]) => mockPersistCurriculum(...args),
}));

const mockSendPush = jest.fn();
jest.mock('../../services/notifications', () => ({
  sendPushNotification: (...args: unknown[]) => mockSendPush(...args),
}));

import { interviewPersistCurriculum } from './interview-persist-curriculum';
import { makeReplayHarness } from './_test-harness';
import { PersistCurriculumError } from '@eduagent/schemas';

const PROFILE = '00000000-0000-4000-8000-000000000001';
const DRAFT = '00000000-0000-4000-8000-000000000002';
const SUBJECT = '00000000-0000-4000-8000-000000000003';

function makeEvent() {
  return {
    data: {
      version: 1,
      draftId: DRAFT,
      profileId: PROFILE,
      subjectId: SUBJECT,
      subjectName: 'Math',
    },
  };
}

function fullDraft(overrides: {
  extractedSignals: unknown;
  exchangeHistory: unknown[];
}) {
  return {
    id: DRAFT,
    profileId: PROFILE,
    subjectId: SUBJECT,
    exchangeHistory: overrides.exchangeHistory,
    extractedSignals: overrides.extractedSignals,
    status: 'completing' as const,
    failureCode: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function mockDb({
  draft,
}: {
  draft: { extractedSignals: unknown; exchangeHistory: unknown[] } | undefined;
}) {
  const updateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: DRAFT }]),
  };
  return {
    query: {
      onboardingDrafts: {
        findFirst: jest
          .fn()
          .mockResolvedValue(draft ? fullDraft(draft) : undefined),
      },
    },
    update: jest.fn().mockReturnValue(updateChain),
  };
}

describe('interview-persist-curriculum', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cache hit: extractedSignals with goals returns cached, no LLM call', async () => {
    const cached = {
      goals: ['Learn algebra'],
      experienceLevel: 'beginner',
      currentKnowledge: 'basic arithmetic',
      interests: ['math'],
    };
    mockGetStepDatabase.mockReturnValue(
      mockDb({ draft: { extractedSignals: cached, exchangeHistory: [] } })
    );
    mockPersistCurriculum.mockResolvedValue(undefined);
    mockSendPush.mockResolvedValue(undefined);

    const handler = (
      interviewPersistCurriculum as unknown as {
        fn: (...args: unknown[]) => unknown;
      }
    ).fn;
    const harness = makeReplayHarness();
    await handler({ event: makeEvent(), step: harness.step });

    expect(mockExtractSignals).not.toHaveBeenCalled();
    expect(mockPersistCurriculum).toHaveBeenCalled();
  });

  it('cache miss: empty goals+interests triggers fresh extraction', async () => {
    mockGetStepDatabase.mockReturnValue(
      mockDb({
        draft: {
          extractedSignals: {
            goals: [],
            experienceLevel: 'beginner',
            currentKnowledge: '',
            interests: [],
          },
          exchangeHistory: ['turn'],
        },
      })
    );
    mockExtractSignals.mockResolvedValue({
      goals: ['Learn algebra'],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: ['math'],
    });
    mockPersistCurriculum.mockResolvedValue(undefined);
    mockSendPush.mockResolvedValue(undefined);

    const handler = (
      interviewPersistCurriculum as unknown as {
        fn: (...args: unknown[]) => unknown;
      }
    ).fn;
    await handler({ event: makeEvent(), step: makeReplayHarness().step });

    expect(mockExtractSignals).toHaveBeenCalled();
    expect(mockPersistCurriculum).toHaveBeenCalled();
  });

  it('extract throws once, replay-harness retry uses memoized result for prior steps', async () => {
    mockGetStepDatabase.mockReturnValue(
      mockDb({
        draft: { extractedSignals: null, exchangeHistory: ['x'] },
      })
    );
    mockExtractSignals
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({
        goals: ['Y'],
        experienceLevel: 'beginner',
        currentKnowledge: '',
        interests: [],
      });
    mockPersistCurriculum.mockResolvedValue(undefined);
    mockSendPush.mockResolvedValue(undefined);

    const handler = (
      interviewPersistCurriculum as unknown as {
        fn: (...args: unknown[]) => unknown;
      }
    ).fn;
    const harness = makeReplayHarness();

    await expect(
      handler({ event: makeEvent(), step: harness.step })
    ).rejects.toThrow(PersistCurriculumError);
    expect(mockExtractSignals).toHaveBeenCalledTimes(1);

    await handler({ event: makeEvent(), step: harness.step });
    expect(mockExtractSignals).toHaveBeenCalledTimes(2);
    expect(mockPersistCurriculum).toHaveBeenCalledTimes(1);
  });

  it('throws NonRetriableError when draft does not exist', async () => {
    mockGetStepDatabase.mockReturnValue(mockDb({ draft: undefined }));

    const handler = (
      interviewPersistCurriculum as unknown as {
        fn: (...args: unknown[]) => unknown;
      }
    ).fn;
    await expect(
      handler({ event: makeEvent(), step: makeReplayHarness().step })
    ).rejects.toThrow(/draft-disappeared/);
  });

  it('onFailure maps PersistCurriculumError to its code', async () => {
    const updateChain = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: DRAFT }]),
    };
    mockGetStepDatabase.mockReturnValue({
      update: jest.fn().mockReturnValue(updateChain),
    });

    const onFailure = (
      interviewPersistCurriculum as unknown as {
        onFailure: (...args: unknown[]) => unknown;
      }
    ).onFailure;
    await onFailure({
      event: makeEvent(),
      error: new PersistCurriculumError('extract_signals_failed'),
    });

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureCode: 'extract_signals_failed',
      })
    );
  });

  it('onFailure maps unknown errors to "unknown" code (no raw message leak)', async () => {
    const updateChain = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: DRAFT }]),
    };
    mockGetStepDatabase.mockReturnValue({
      update: jest.fn().mockReturnValue(updateChain),
    });

    const onFailure = (
      interviewPersistCurriculum as unknown as {
        onFailure: (...args: unknown[]) => unknown;
      }
    ).onFailure;
    await onFailure({
      event: makeEvent(),
      error: new Error('LLM api key sk-zzz... leaked'),
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.failureCode).toBe('unknown');
    expect(JSON.stringify(setCall)).not.toMatch(/sk-zzz/);
  });

  it('emits completion_push_failed event when sendPushNotification throws', async () => {
    const cached = {
      goals: ['Learn'],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: ['math'],
    };
    mockGetStepDatabase.mockReturnValue(
      mockDb({ draft: { extractedSignals: cached, exchangeHistory: [] } })
    );
    mockPersistCurriculum.mockResolvedValue(undefined);
    mockSendPush.mockRejectedValueOnce(new Error('Expo down'));

    const { inngest: mockInngest } = require('../client');
    const handler = (
      interviewPersistCurriculum as unknown as {
        fn: (...args: unknown[]) => unknown;
      }
    ).fn;
    await handler({ event: makeEvent(), step: makeReplayHarness().step });

    expect(mockInngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/interview.completion_push_failed',
      })
    );
  });
});
