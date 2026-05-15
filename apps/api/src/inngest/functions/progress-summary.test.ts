const mockGetStepDatabase = jest.fn();
const mockBuildKnowledgeInventory = jest.fn();
const mockFindLatestCompletedLearningSession = jest.fn();
const mockGenerateProgressSummary = jest.fn();
const mockUpsertProgressSummary = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  desc: jest.fn((column: unknown) => ({ op: 'desc', column })),
  eq: jest.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));

jest.mock('@eduagent/database', () => ({
  familyLinks: { childProfileId: 'familyLinks.childProfileId' },
  learningSessions: {
    id: 'learningSessions.id',
    profileId: 'learningSessions.profileId',
    startedAt: 'learningSessions.startedAt',
    status: 'learningSessions.status',
  },
  profiles: { id: 'profiles.id' },
}));

jest.mock('../helpers' /* gc1-allow: controls step DB boundary */, () => ({
  ...jest.requireActual('../helpers'),
  getStepDatabase: () => mockGetStepDatabase(),
}));

jest.mock('../client' /* gc1-allow: capture registered handler */, () => ({
  ...jest.requireActual('../client'),
  inngest: {
    createFunction: jest.fn((_opts, _trigger, fn) =>
      Object.assign(fn, { fn, opts: _opts, trigger: _trigger }),
    ),
  },
}));

// prettier-ignore
jest.mock(/* gc1-allow: isolate orchestration */ '../../services/snapshot-aggregation', () => ({
  buildKnowledgeInventory: (...args: unknown[]) =>
    mockBuildKnowledgeInventory(...args),
}));

// prettier-ignore
jest.mock(/* gc1-allow: deterministic branch control */ '../../services/progress-summary', () => ({
  deterministicProgressSummaryFallback: (childName: string) =>
    `Fallback summary for ${childName}.`,
  findLatestCompletedLearningSession: (...args: unknown[]) =>
    mockFindLatestCompletedLearningSession(...args),
  generateProgressSummary: (...args: unknown[]) =>
    mockGenerateProgressSummary(...args),
  upsertProgressSummary: (...args: unknown[]) =>
    mockUpsertProgressSummary(...args),
}));

jest.mock('../../services/sentry' /* gc1-allow: assert capture */, () => ({
  ...jest.requireActual('../../services/sentry'),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { eq } from 'drizzle-orm';
import { learningSessions } from '@eduagent/database';
import { progressSummaryGeneration } from './progress-summary';

function createStep() {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
}

function createDb(fallbackRows: Array<{ id: string; startedAt: Date }> = []) {
  return {
    query: {
      familyLinks: { findFirst: jest.fn().mockResolvedValue({ id: 'link-1' }) },
      profiles: {
        findFirst: jest.fn().mockResolvedValue({ displayName: 'Emma' }),
      },
    },
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            limit: jest.fn().mockResolvedValue(fallbackRows),
          })),
        })),
      })),
    })),
  };
}

async function invokeProgressSummary(data: {
  profileId?: string;
  sessionId?: string;
}) {
  const step = createStep();
  const handler = (progressSummaryGeneration as any).fn;
  const result = await handler({ event: { data }, step });
  return { result, step };
}

describe('progressSummaryGeneration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildKnowledgeInventory.mockResolvedValue({
      profileId: 'child-1',
      snapshotDate: '2026-05-13',
      currentlyWorkingOn: [],
      thisWeekMini: { sessions: 1, wordsLearned: 0, topicsTouched: 1 },
      global: {
        topicsAttempted: 1,
        topicsMastered: 0,
        vocabularyTotal: 0,
        vocabularyMastered: 0,
        weeklyDeltaTopicsMastered: null,
        weeklyDeltaVocabularyTotal: null,
        weeklyDeltaTopicsExplored: null,
        totalSessions: 1,
        totalActiveMinutes: 10,
        totalWallClockMinutes: 12,
        currentStreak: 1,
        longestStreak: 1,
      },
      subjects: [],
    });
    mockFindLatestCompletedLearningSession.mockResolvedValue(null);
    mockGenerateProgressSummary.mockResolvedValue('Generated summary.');
    mockUpsertProgressSummary.mockResolvedValue(undefined);
  });

  it('[BREAK] scopes fallback session lookup by profileId', async () => {
    const db = createDb([
      {
        id: 'session-1',
        startedAt: new Date('2026-05-13T10:00:00Z'),
      },
    ]);
    mockGetStepDatabase.mockReturnValue(db);

    await invokeProgressSummary({
      profileId: 'child-1',
      sessionId: 'session-1',
    });

    expect(eq).toHaveBeenCalledWith(learningSessions.profileId, 'child-1');
  });

  it('persists deterministic fallback when LLM summary generation fails', async () => {
    const db = createDb([
      {
        id: 'session-1',
        startedAt: new Date('2026-05-13T10:00:00Z'),
      },
    ]);
    mockGetStepDatabase.mockReturnValue(db);
    mockGenerateProgressSummary.mockRejectedValue(new Error('LLM down'));

    await invokeProgressSummary({
      profileId: 'child-1',
      sessionId: 'session-1',
    });

    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockUpsertProgressSummary).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        childProfileId: 'child-1',
        summary: 'Fallback summary for Emma.',
      }),
    );
  });
});
