import { updateConversationLanguageV2 } from './onboarding-v2';

function recordingDb() {
  let written: Record<string, unknown> | undefined;
  const chain = {
    set(values: Record<string, unknown>) {
      written = values;
      return chain;
    },
    where() {
      return chain;
    },
    returning: jest.fn().mockResolvedValue([{ id: 'person-1' }]),
  };
  return {
    db: {
      update: jest.fn(() => chain),
    } as never,
    written: () => written,
  };
}

describe('updateConversationLanguageV2', () => {
  it('[WI-1556] persists explicit confirmation with the language atomically', async () => {
    const fixture = recordingDb();

    await updateConversationLanguageV2(
      fixture.db,
      'person-1',
      'org-1',
      'cs',
      true,
    );

    expect(fixture.written()).toMatchObject({
      conversationLanguage: 'cs',
      conversationLanguageConfirmedAt: expect.any(Date),
    });
  });

  it('[WI-1556] automatic locale sync does not manufacture confirmation', async () => {
    const fixture = recordingDb();

    await updateConversationLanguageV2(
      fixture.db,
      'person-1',
      'org-1',
      'cs',
      false,
    );

    expect(fixture.written()).toMatchObject({ conversationLanguage: 'cs' });
    expect(fixture.written()).not.toHaveProperty(
      'conversationLanguageConfirmedAt',
    );
  });
});
