import type { Database } from '@eduagent/database';
import { NotFoundError } from '../errors';
import {
  assertOwnedCurriculumTopic,
  findOwnedCurriculumTopic,
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
});
