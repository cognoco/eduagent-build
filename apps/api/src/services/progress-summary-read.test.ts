jest.mock('drizzle-orm', () => ({
  and: jest.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  desc: jest.fn((column: unknown) => ({ op: 'desc', column })),
  eq: jest.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));

jest.mock('@eduagent/database', () => ({
  learningSessions: {
    id: 'learningSessions.id',
    profileId: 'learningSessions.profileId',
    startedAt: 'learningSessions.startedAt',
    status: 'learningSessions.status',
  },
  progressSummaries: {
    profileId: 'progressSummaries.profileId',
  },
}));

import { eq } from 'drizzle-orm';
import { learningSessions } from '@eduagent/database';
import { getProgressSummary } from './progress-summary';

function createDb(latestRows: Array<{ id: string; startedAt: Date }> = []) {
  return {
    query: {
      progressSummaries: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            limit: jest.fn().mockResolvedValue(latestRows),
          })),
        })),
      })),
    })),
  };
}

describe('getProgressSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('[BREAK] computes freshness from completed sessions only', async () => {
    const db = createDb();

    await getProgressSummary(db as never, 'child-1');

    expect(eq).toHaveBeenCalledWith(learningSessions.status, 'completed');
  });
});
