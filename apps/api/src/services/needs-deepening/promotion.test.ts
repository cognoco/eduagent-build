import type { Database } from '@eduagent/database';
import {
  expirePendingDeepeningRows,
  promotePendingDeepening,
} from './promotion';

const NOW = new Date('2026-05-25T12:00:00.000Z');

function createUpdateChain(returnedRows: Array<{ id: string }> = []) {
  const chain = {
    set: jest.fn(),
    where: jest.fn(),
    returning: jest.fn(),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.returning.mockResolvedValue(returnedRows);
  return chain;
}

function createDeleteChain(returnedRows: Array<{ id: string }> = []) {
  const chain = {
    where: jest.fn(),
    returning: jest.fn(),
  };
  chain.where.mockReturnValue(chain);
  chain.returning.mockResolvedValue(returnedRows);
  return chain;
}

function createDb({
  pendingRows = [],
  promotedRows = [],
  expiredRows = [],
}: {
  pendingRows?: unknown[];
  promotedRows?: Array<{ id: string }>;
  expiredRows?: Array<{ id: string }>;
} = {}) {
  const findMany = jest.fn().mockResolvedValue(pendingRows);
  const updateChain = createUpdateChain(promotedRows);
  const deleteChain = createDeleteChain(expiredRows);
  const db = {
    query: {
      needsDeepeningTopics: {
        findMany,
      },
    },
    update: jest.fn(() => updateChain),
    delete: jest.fn(() => deleteChain),
  } as unknown as Database;

  return { db, findMany, updateChain, deleteChain };
}

function extractSqlValues(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') return [];
  if (value instanceof Date) return [value];

  const record = value as Record<string, unknown>;
  return [
    ...(record.value !== undefined ? [record.value] : []),
    ...(Array.isArray(record.queryChunks)
      ? record.queryChunks.flatMap((chunk) => extractSqlValues(chunk))
      : []),
  ];
}

describe('promotePendingDeepening', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('promotes unexpired pending_review rows for the requested profile/topic', async () => {
    const { db, updateChain } = createDb({
      pendingRows: [
        {
          id: 'pending-1',
          profileId: 'profile-1',
          topicId: 'topic-1',
          status: 'pending_review',
          pendingExpiresAt: new Date('2026-05-26T12:00:00.000Z'),
        },
      ],
      promotedRows: [{ id: 'pending-1' }],
    });

    const result = await promotePendingDeepening(
      db,
      'profile-1',
      'topic-1',
      'answer_struggle',
    );

    expect(result).toEqual({ promotedCount: 1, promotedIds: ['pending-1'] });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        pendingExpiresAt: null,
        updatedAt: expect.any(Date),
      }),
    );
    expect(updateChain.returning).toHaveBeenCalledWith({
      id: expect.anything(),
    });
  });

  it('does not promote expired pending_review rows', async () => {
    const { db, updateChain } = createDb({
      pendingRows: [
        {
          id: 'expired-pending',
          profileId: 'profile-1',
          topicId: 'topic-1',
          status: 'pending_review',
          pendingExpiresAt: new Date('2026-05-24T12:00:00.000Z'),
        },
      ],
    });

    const result = await promotePendingDeepening(
      db,
      'profile-1',
      'topic-1',
      'retention_again',
    );

    expect(result).toEqual({ promotedCount: 0, promotedIds: [] });
    expect(updateChain.set).not.toHaveBeenCalled();
  });
});

describe('expirePendingDeepeningRows', () => {
  it('deletes expired pending_review rows and leaves active/non-expired rows alone', async () => {
    const { db, deleteChain } = createDb({
      expiredRows: [{ id: 'expired-1' }, { id: 'expired-2' }],
    });

    const result = await expirePendingDeepeningRows(db, NOW);

    expect(result).toEqual({
      expiredCount: 2,
      expiredIds: ['expired-1', 'expired-2'],
    });
    expect(deleteChain.where).toHaveBeenCalledTimes(1);
    const whereClause = deleteChain.where.mock.calls[0]![0];
    expect(extractSqlValues(whereClause)).toEqual(
      expect.arrayContaining(['pending_review', NOW]),
    );
    expect(deleteChain.returning).toHaveBeenCalledWith({
      id: expect.anything(),
    });
  });
});
