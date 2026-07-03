// ---------------------------------------------------------------------------
// Account Service Tests
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { createDatabaseModuleMock } from '../test-utils/database-module';
import { findAccountByClerkId } from './account';

const NOW = new Date('2025-01-15T10:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
});

// [WI-1254] findAccountByClerkId now reads the v2 identity graph
// (login→membership→organization via resolveIdentityV2) rather than the
// legacy `accounts` table. Seed the canonical graph via
// createDatabaseModuleMock (the established pattern for exercising
// resolveIdentityV2 for real — see test-utils/database-module.ts) instead of
// convenience-mocking `db.query.accounts.findFirst`.
describe('findAccountByClerkId', () => {
  it('returns null when the login row is not found', async () => {
    const { db } = createDatabaseModuleMock({
      db: {
        query: {
          login: { findFirst: jest.fn().mockResolvedValue(undefined) },
        },
      },
    });
    const result = await findAccountByClerkId(
      db as unknown as Database,
      'no_such_clerk_user',
    );

    expect(result).toBeNull();
  });

  it('returns the resolved account when the identity graph resolves', async () => {
    const { db } = createDatabaseModuleMock();
    const result = await findAccountByClerkId(
      db as unknown as Database,
      'user_test',
    );

    expect(result).toEqual({
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      timezone: 'UTC',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('maps the organization timezone when present', async () => {
    const { db } = createDatabaseModuleMock({
      db: {
        query: {
          organization: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'test-account-id',
              timezone: 'Europe/Prague',
              createdAt: NOW,
              updatedAt: NOW,
            }),
          },
        },
      },
    });
    const result = await findAccountByClerkId(
      db as unknown as Database,
      'user_test',
    );

    expect(result!.timezone).toBe('Europe/Prague');
  });
});
