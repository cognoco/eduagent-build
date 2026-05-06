// Unit tests for Inngest step replay/memoization behavior.
// DB-touching scenarios are covered in interview-persist-curriculum.integration.test.ts.

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
  const db: Record<string, unknown> = {
    query: {
      onboardingDrafts: {
        findFirst: jest
          .fn()
          .mockResolvedValue(draft ? fullDraft(draft) : undefined),
      },
    },
    update: jest.fn().mockReturnValue(updateChain),
  };
  // A7: persist-curriculum step now wraps writes in db.transaction().
  // The unit test mocks persistCurriculum and the inner update, so the
  // transaction wrapper just needs to invoke its callback with a tx-shaped
  // value. Reusing `db` is fine — the txDb cast in the SUT erases the type.
  db['transaction'] = jest.fn(async (cb: (tx: unknown) => unknown) => cb(db));
  return db;
}

describe('interview-persist-curriculum (replay harness)', () => {
  beforeEach(() => jest.clearAllMocks());

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
});
