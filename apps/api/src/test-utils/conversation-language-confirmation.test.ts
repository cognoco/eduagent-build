import { person, type Database } from '@eduagent/database';

import {
  CONFIRMED_CONVERSATION_LANGUAGE_AT,
  markConversationLanguageConfirmedForTest,
} from './conversation-language-confirmation';

describe('[WI-1556] markConversationLanguageConfirmedForTest', () => {
  function makeDb() {
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    return {
      db: { update } as unknown as Database,
      update,
      set,
      where,
    };
  }

  it('confirms the conversation language for exactly the given profile', async () => {
    const { db, update, set, where } = makeDb();

    await markConversationLanguageConfirmedForTest(db, 'prof-abc');

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(person);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      conversationLanguageConfirmedAt: CONFIRMED_CONVERSATION_LANGUAGE_AT,
    });
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('exposes a single canonical confirmed-at instant so no suite inlines its own literal', () => {
    expect(CONFIRMED_CONVERSATION_LANGUAGE_AT).toBeInstanceOf(Date);
    expect(CONFIRMED_CONVERSATION_LANGUAGE_AT.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });
});
