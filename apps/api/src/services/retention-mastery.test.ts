import { inspect } from 'node:util';
import type { Database } from '@eduagent/database';
import { curriculumBooks, retentionCards } from '@eduagent/database';
import { stampMasteryOnVerify } from './retention-mastery';

function createUpdateDb() {
  const updateCalls: Array<{
    table: unknown;
    setArg?: unknown;
    whereArg?: unknown;
  }> = [];

  const update = jest.fn((table: unknown) => {
    const call = { table } as (typeof updateCalls)[number];
    updateCalls.push(call);

    return {
      set: jest.fn((setArg: unknown) => {
        call.setArg = setArg;

        return {
          where: jest.fn((whereArg: unknown) => {
            call.whereArg = whereArg;
            return Promise.resolve(undefined);
          }),
        };
      }),
    };
  });

  const db = {
    update,
    // stampMasteryOnVerify wraps the card + book stamps in a single
    // transaction so the book-completeness check sees the committed card stamp.
    // The fake tx delegates to the same `update` tracker.
    transaction: jest.fn(
      async (cb: (tx: unknown) => Promise<unknown>) => await cb({ update }),
    ),
  } as unknown as Database;

  return { db, updateCalls };
}

function inspectWhere(whereArg: unknown) {
  return inspect(whereArg, { depth: 20 }).toLowerCase();
}

describe('stampMasteryOnVerify', () => {
  const masteredAt = new Date('2026-05-30T12:00:00.000Z');

  it('does not write mastery stamps when the review did not enter verified', async () => {
    const { db } = createUpdateDb();

    await stampMasteryOnVerify(db, {
      profileId: 'profile-1',
      topicId: 'topic-1',
      cardId: 'card-1',
      xpChange: 'decayed',
      masteredAt,
    });

    expect(db.update).not.toHaveBeenCalled();
  });

  it('sets the card stamp once and re-evaluates the book atomically', async () => {
    const { db, updateCalls } = createUpdateDb();

    await stampMasteryOnVerify(db, {
      profileId: 'profile-1',
      topicId: 'topic-1',
      cardId: 'card-1',
      xpChange: 'verified',
      masteredAt,
    });

    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]!.table).toBe(retentionCards);
    expect(updateCalls[0]!.setArg).toEqual({
      masteredAt,
      updatedAt: masteredAt,
    });
    expect(inspectWhere(updateCalls[0]!.whereArg)).toContain('mastered_at');

    expect(updateCalls[1]!.table).toBe(curriculumBooks);
    expect(updateCalls[1]!.setArg).toEqual({
      masteredAt,
      updatedAt: masteredAt,
    });
    const bookWhere = inspectWhere(updateCalls[1]!.whereArg);
    expect(bookWhere).toContain('not exists');
    expect(bookWhere).toContain('curriculum_topics');
    expect(bookWhere).toContain('retention_cards');
    expect(bookWhere).toContain('mastered_at is null');
  });
});
