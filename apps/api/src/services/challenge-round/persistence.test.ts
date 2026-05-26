import type { Database } from '@eduagent/database';
import { assessments } from '@eduagent/database';

import type { ReviewTarget } from './evaluation';
import {
  persistChallengeRoundMasteryEvidence,
  upsertChallengeRoundWeakSpots,
} from './persistence';

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000101';
const SUBJECT_ID = '00000000-0000-4000-8000-000000000201';
const TOPIC_ID = '00000000-0000-4000-8000-000000000301';
const NOW = new Date('2026-05-26T12:00:00.000Z');
const PENDING_EXPIRES_AT = new Date('2026-06-02T12:00:00.000Z');

function createSelectChain(rows: unknown[]) {
  const chain = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  return chain;
}

function createInsertChain(returnedRows: Array<{ id: string }> = []) {
  const chain = {
    values: jest.fn(),
    returning: jest.fn(),
  };
  chain.values.mockReturnValue(chain);
  chain.returning.mockResolvedValue(returnedRows);
  return chain;
}

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

function makeDb({
  ownedRows = [
    { sessionId: SESSION_ID, subjectId: SUBJECT_ID, topicId: TOPIC_ID },
  ],
  existingWeakSpots = [],
  insertedRows = [],
  updatedRows = [],
}: {
  ownedRows?: unknown[];
  existingWeakSpots?: unknown[];
  insertedRows?: Array<{ id: string }>;
  updatedRows?: Array<{ id: string }>;
} = {}) {
  const selectChain = createSelectChain(ownedRows);
  const insertChain = createInsertChain(insertedRows);
  const updateChain = createUpdateChain(updatedRows);
  const findMany = jest.fn().mockResolvedValue(existingWeakSpots);
  const db = {
    select: jest.fn(() => selectChain),
    insert: jest.fn(() => insertChain),
    update: jest.fn(() => updateChain),
    query: {
      needsDeepeningTopics: {
        findMany,
      },
    },
  } as unknown as Database;

  return { db, selectChain, insertChain, updateChain, findMany };
}

describe('persistChallengeRoundMasteryEvidence', () => {
  it('inserts a fresh transfer assessment row owned by the Challenge Round session topic', async () => {
    const { db, insertChain } = makeDb({
      insertedRows: [{ id: 'assessment-1' }],
    });

    const result = await persistChallengeRoundMasteryEvidence(db, PROFILE_ID, {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      now: NOW,
    });

    expect(result).toEqual({ assessmentId: 'assessment-1' });
    expect(db.insert).toHaveBeenCalledWith(assessments);
    expect(insertChain.values).toHaveBeenCalledWith({
      profileId: PROFILE_ID,
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
      sessionId: SESSION_ID,
      verificationDepth: 'transfer',
      status: 'passed',
      masteryScore: 1,
      qualityRating: 5,
      exchangeHistory: [],
      masteryChallengeVerifiedAt: NOW,
    });
  });

  it('does not insert mastery evidence when the session/topic ownership chain is missing', async () => {
    const { db, insertChain } = makeDb({ ownedRows: [] });

    await expect(
      persistChallengeRoundMasteryEvidence(db, PROFILE_ID, {
        sessionId: SESSION_ID,
        topicId: TOPIC_ID,
        now: NOW,
      }),
    ).rejects.toThrow('Session');

    expect(insertChain.values).not.toHaveBeenCalled();
  });
});

describe('upsertChallengeRoundWeakSpots', () => {
  const reviewTargets: ReviewTarget[] = [
    {
      concept: 'Balancing equations',
      answerEventId: '00000000-0000-4000-8000-000000000401',
      source: 'challenge_round',
    },
    {
      concept: 'Ionic charge',
      answerEventId: '00000000-0000-4000-8000-000000000402',
      misconception: 'Learner treated charge as atom count',
      correction: 'Charge is electron imbalance, not atom count.',
      source: 'challenge_round',
    },
  ];

  it('inserts new weak spots as pending_review Challenge Round rows with seven-day expiry', async () => {
    const { db, insertChain, updateChain } = makeDb({
      insertedRows: [{ id: 'weak-1' }, { id: 'weak-2' }],
    });

    const result = await upsertChallengeRoundWeakSpots(db, PROFILE_ID, {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      reviewTargets,
      now: NOW,
    });

    expect(result).toEqual({
      insertedCount: 2,
      insertedIds: ['weak-1', 'weak-2'],
      updatedCount: 0,
      updatedIds: [],
    });
    expect(updateChain.set).not.toHaveBeenCalled();
    expect(insertChain.values).toHaveBeenCalledWith([
      {
        profileId: PROFILE_ID,
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
        status: 'pending_review',
        source: 'challenge_round',
        concept: 'Balancing equations',
        misconception: null,
        correction: null,
        pendingExpiresAt: PENDING_EXPIRES_AT,
        updatedAt: NOW,
      },
      {
        profileId: PROFILE_ID,
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
        status: 'pending_review',
        source: 'challenge_round',
        concept: 'Ionic charge',
        misconception: 'Learner treated charge as atom count',
        correction: 'Charge is electron imbalance, not atom count.',
        pendingExpiresAt: PENDING_EXPIRES_AT,
        updatedAt: NOW,
      },
    ]);
  });

  it('updates the newest matching pending_review row instead of inserting a duplicate concept', async () => {
    const { db, insertChain, updateChain } = makeDb({
      existingWeakSpots: [
        {
          id: 'older-pending',
          profileId: PROFILE_ID,
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
          status: 'pending_review',
          source: 'challenge_round',
          concept: 'Ionic charge',
          createdAt: new Date('2026-05-25T12:00:00.000Z'),
        },
        {
          id: 'newer-pending',
          profileId: PROFILE_ID,
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
          status: 'pending_review',
          source: 'challenge_round',
          concept: 'Ionic charge',
          createdAt: new Date('2026-05-26T11:00:00.000Z'),
        },
      ],
      updatedRows: [{ id: 'newer-pending' }],
    });

    const result = await upsertChallengeRoundWeakSpots(db, PROFILE_ID, {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      reviewTargets: [reviewTargets[1]!],
      now: NOW,
    });

    expect(result).toEqual({
      insertedCount: 0,
      insertedIds: [],
      updatedCount: 1,
      updatedIds: ['newer-pending'],
    });
    expect(insertChain.values).not.toHaveBeenCalled();
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending_review',
        misconception: 'Learner treated charge as atom count',
        correction: 'Charge is electron imbalance, not atom count.',
        pendingExpiresAt: PENDING_EXPIRES_AT,
        updatedAt: NOW,
      }),
    );
    const whereClause = updateChain.where.mock.calls[0]![0];
    expect(extractSqlValues(whereClause)).toContain('newer-pending');
    expect(extractSqlValues(whereClause)).not.toContain('older-pending');
  });

  it('keeps existing active rows active and does not refresh pending expiry', async () => {
    const { db, insertChain, updateChain } = makeDb({
      existingWeakSpots: [
        {
          id: 'active-row',
          profileId: PROFILE_ID,
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
          status: 'active',
          source: 'challenge_round',
          concept: 'Balancing equations',
          pendingExpiresAt: null,
          createdAt: new Date('2026-05-26T11:00:00.000Z'),
        },
      ],
      updatedRows: [{ id: 'active-row' }],
    });

    const result = await upsertChallengeRoundWeakSpots(db, PROFILE_ID, {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      reviewTargets: [reviewTargets[0]!],
      now: NOW,
    });

    expect(result.updatedIds).toEqual(['active-row']);
    expect(insertChain.values).not.toHaveBeenCalled();
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.not.objectContaining({
        status: 'pending_review',
        pendingExpiresAt: expect.any(Date),
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        updatedAt: NOW,
      }),
    );
  });
});
