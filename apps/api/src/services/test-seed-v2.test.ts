import { person, type Database } from '@eduagent/database';

import { CONFIRMED_CONVERSATION_LANGUAGE_AT } from '../test-utils/conversation-language-confirmation';
import { seedChildIdentityV2, seedOwnerIdentityV2 } from './test-seed-v2';

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
