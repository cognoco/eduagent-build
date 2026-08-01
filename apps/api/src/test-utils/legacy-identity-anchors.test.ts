import type { Database } from '@eduagent/database';

import { ensureV2IdentityForLegacyProfileTest } from './legacy-identity-anchors';

function createAnchorDb(): { db: Database; set: jest.Mock } {
  const set = jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue(undefined),
  });
  const db = {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    update: jest.fn().mockReturnValue({ set }),
    query: {
      login: {
        findFirst: jest.fn().mockResolvedValue({ id: 'login-001' }),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'membership-001' }),
      },
    },
  } as unknown as Database;
  return { db, set };
}

describe('ensureV2IdentityForLegacyProfileTest', () => {
  it('marks a credentialed owner anchor as language-confirmed', async () => {
    const { db, set } = createAnchorDb();

    await ensureV2IdentityForLegacyProfileTest(db, {
      accountId: '00000000-0000-4000-8000-000000000001',
      profileId: '00000000-0000-4000-8000-000000000002',
      displayName: 'Legacy Owner',
      birthYear: 1990,
      clerkUserId: 'clerk_legacy_owner',
      email: 'legacy-owner@test.invalid',
      seedBaselineSubscription: false,
    });

    expect(set).toHaveBeenCalledWith({
      loginId: 'login-001',
      conversationLanguageConfirmedAt: expect.any(Date),
    });
  });
});
