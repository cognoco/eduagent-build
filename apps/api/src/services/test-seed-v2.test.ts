import { person, type Database } from '@eduagent/database';

import {
  createRecordingDb,
  type TestSeedInsertRecord,
} from '../test-utils/test-seed-db';
import { CONFIRMED_CONVERSATION_LANGUAGE_AT } from '../test-utils/conversation-language-confirmation';
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
  it('[WI-1556] marks a seeded owner as an existing language-confirmed persona', async () => {
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

  it('[WI-1556] keeps a managed child unconfirmed until they gain their own credential', async () => {
    const { db, inserts } = createRecordingDb();

    const child = await seedChildIdentityV2(db, {
      organizationId: '00000000-0000-4000-8000-000000000001',
      displayName: 'Managed Child',
      birthYear: 2014,
      conversationLanguageConfirmed: false,
    });

    expect(
      insertedPerson(inserts, child.personId).conversationLanguageConfirmedAt,
    ).toBeNull();
  });
});

function createCapturingDatabase(): {
  db: Database;
  insertedRows: Map<unknown, unknown[]>;
} {
  const insertedRows = new Map<unknown, unknown[]>();
  const db = {
    insert: jest.fn((table: unknown) => ({
      values: jest.fn(async (row: unknown) => {
        insertedRows.set(table, [...(insertedRows.get(table) ?? []), row]);
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn().mockResolvedValue(undefined),
      })),
    })),
  } as unknown as Database;

  return { db, insertedRows };
}

describe('test-seed-v2 established identities', () => {
  it('[WI-2944] confirms the conversation language for a credentialed owner', async () => {
    const { db, insertedRows } = createCapturingDatabase();

    const result = await seedOwnerIdentityV2(db, {
      email: 'owner@example.com',
      clerkUserId: 'user_owner',
      displayName: 'Established Owner',
      birthYear: 1985,
    });

    expect(insertedRows.get(person)).toContainEqual(
      expect.objectContaining({
        id: result.personId,
        conversationLanguageConfirmedAt: CONFIRMED_CONVERSATION_LANGUAGE_AT,
      }),
    );
  });

  it('[WI-2944] confirms the conversation language for a managed child', async () => {
    const { db, insertedRows } = createCapturingDatabase();

    const result = await seedChildIdentityV2(db, {
      organizationId: '00000000-0000-7000-8000-000000000001',
      displayName: 'Established Child',
      birthYear: 2012,
    });

    expect(insertedRows.get(person)).toContainEqual(
      expect.objectContaining({
        id: result.personId,
        conversationLanguageConfirmedAt: CONFIRMED_CONVERSATION_LANGUAGE_AT,
      }),
    );
  });
});
