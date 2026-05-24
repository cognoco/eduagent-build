import type { Database } from '@eduagent/database';
import { NotFoundError } from '../errors';
import {
  assertOwnedCurriculumTopic,
  findOwnedCurriculumTopic,
  findOwnedCurriculumTopics,
} from './curriculum-topic-ownership';

function createJoinedSelectMock(rows: unknown[]): {
  db: Database;
  where: jest.Mock;
} {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn(() => ({ limit }));
  const thirdJoin = jest.fn(() => ({ where }));
  const secondJoin = jest.fn(() => ({ innerJoin: thirdJoin }));
  const firstJoin = jest.fn(() => ({ innerJoin: secondJoin }));
  const from = jest.fn(() => ({ innerJoin: firstJoin }));
  const select = jest.fn(() => ({ from }));

  return {
    db: { select } as unknown as Database,
    where,
  };
}

function createBatchJoinedSelectMock(rows: unknown[]): {
  db: Database;
  select: jest.Mock;
  where: jest.Mock;
} {
  const where = jest.fn().mockResolvedValue(rows);
  const thirdJoin = jest.fn(() => ({ where }));
  const secondJoin = jest.fn(() => ({ innerJoin: thirdJoin }));
  const firstJoin = jest.fn(() => ({ innerJoin: secondJoin }));
  const from = jest.fn(() => ({ innerJoin: firstJoin }));
  const select = jest.fn(() => ({ from }));

  return {
    db: { select } as unknown as Database,
    select,
    where,
  };
}

describe('curriculum-topic-ownership', () => {
  it('returns owned topic metadata from the joined parent-chain query', async () => {
    const { db, where } = createJoinedSelectMock([
      {
        topicId: 'topic-owned',
        topicTitle: 'Owned Topic',
        topicDescription: 'desc',
        bookId: 'book-owned',
        bookTitle: 'Book',
        curriculumId: 'curriculum-owned',
        subjectId: 'subject-owned',
      },
    ]);

    await expect(
      findOwnedCurriculumTopic(db, {
        profileId: 'profile-owned',
        topicId: 'topic-owned',
      }),
    ).resolves.toMatchObject({
      topicId: 'topic-owned',
      topicTitle: 'Owned Topic',
      subjectId: 'subject-owned',
    });
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('throws NotFoundError from assertOwnedCurriculumTopic when topic is not owned', async () => {
    const { db } = createJoinedSelectMock([]);

    await expect(
      assertOwnedCurriculumTopic(db, {
        profileId: 'profile-a',
        topicId: 'topic-b',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('[WI-80] returns an empty batch without querying when no topic ids are provided', async () => {
    const { db, select } = createBatchJoinedSelectMock([]);

    await expect(
      findOwnedCurriculumTopics(db, {
        profileId: 'profile-owned',
        topicIds: [],
      }),
    ).resolves.toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('[WI-80] returns only topics proven by the dual parent-chain batch query', async () => {
    const { db, where } = createBatchJoinedSelectMock([
      {
        topicId: 'topic-owned',
        topicTitle: 'Owned Topic',
        topicDescription: 'desc',
        bookId: 'book-owned',
        bookTitle: 'Book',
        curriculumId: 'curriculum-owned',
        subjectId: 'subject-owned',
      },
    ]);

    await expect(
      findOwnedCurriculumTopics(db, {
        profileId: 'profile-owned',
        topicIds: ['topic-owned', 'topic-foreign'],
        subjectId: 'subject-owned',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        topicId: 'topic-owned',
        subjectId: 'subject-owned',
      }),
    ]);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
