import {
  learningSessions,
  person,
  practiceActivityEvents,
} from '@eduagent/database';

import { createRecordingDb } from './test-seed-db';

describe('createRecordingDb', () => {
  it('keeps each insert builder bound to its own table when builders interleave', async () => {
    const { db, inserts } = createRecordingDb();
    const personInsert = db.insert(person);
    const sessionInsert = db.insert(learningSessions);

    await personInsert.values({ id: 'person-1' } as never);
    await sessionInsert.values({ id: 'session-1' } as never);

    expect(inserts).toEqual([
      { table: person, values: { id: 'person-1' } },
      { table: learningSessions, values: { id: 'session-1' } },
    ]);
  });

  it('persists and returns the stable seeded practice-activity identity', async () => {
    const { db, inserts } = createRecordingDb();

    const returnedRows = await db
      .insert(practiceActivityEvents)
      .values({ profileId: 'profile-1' } as never)
      .onConflictDoNothing()
      .returning();

    expect(returnedRows).toEqual([
      expect.objectContaining({
        id: '019d14f4-735f-7e11-8800-000000000001',
      }),
    ]);
    expect(inserts).toContainEqual({
      table: practiceActivityEvents,
      values: expect.objectContaining({
        id: '019d14f4-735f-7e11-8800-000000000001',
      }),
    });
  });
});
