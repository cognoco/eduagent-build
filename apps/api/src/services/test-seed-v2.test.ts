import { person } from '@eduagent/database';

import {
  createRecordingDb,
  type TestSeedInsertRecord,
} from '../test-utils/test-seed-db';
import { seedChildIdentityV2, seedOwnerIdentityV2 } from './test-seed-v2';

function insertedPerson(
  inserts: TestSeedInsertRecord[],
  personId: string,
): Record<string, unknown> {
  const row = inserts
    .filter((record) => record.table === person)
    .flatMap((record) =>
      Array.isArray(record.values) ? record.values : [record.values],
    )
    .find((candidate) => candidate.id === personId);
  if (!row) throw new Error(`No person row found for ${personId}`);
  return row;
}

describe('v2 identity test seeds — conversation-language confirmation', () => {
  it('marks a seeded owner as an existing language-confirmed persona', async () => {
    const { db, inserts } = createRecordingDb();

    const owner = await seedOwnerIdentityV2(db, {
      email: 'owner@test.invalid',
      clerkUserId: 'clerk_seed_owner',
      displayName: 'Seed Owner',
      birthYear: 1990,
    });

    expect(
      insertedPerson(inserts, owner.personId).conversationLanguageConfirmedAt,
    ).toBeInstanceOf(Date);
  });

  it('keeps a managed child unconfirmed until they gain their own credential', async () => {
    const { db, inserts } = createRecordingDb();

    const child = await seedChildIdentityV2(db, {
      organizationId: '00000000-0000-4000-8000-000000000001',
      displayName: 'Managed Child',
      birthYear: 2014,
    });

    expect(
      insertedPerson(inserts, child.personId).conversationLanguageConfirmedAt,
    ).toBeNull();
  });
});
