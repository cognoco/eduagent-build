import { learningSessions, person } from '@eduagent/database';

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
});
