// ---------------------------------------------------------------------------
// Account Service Tests
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { findAccountByClerkId, findOrCreateAccount } from './account';

// Mock the billing service — trial auto-creation calls createSubscription
const mockCreateSubscription = jest.fn().mockResolvedValue({
  id: 'sub-trial',
  accountId: 'new-acc',
  tier: 'free',
  status: 'trial',
});
jest.mock('./billing', () => ({
  createSubscription: (...args: unknown[]) => mockCreateSubscription(...args),
}));

const NOW = new Date('2025-01-15T10:00:00.000Z');

function mockAccountRow(
  overrides?: Partial<{ id: string; clerkUserId: string; email: string }>
) {
  return {
    id: overrides?.id ?? 'acc-1',
    clerkUserId: overrides?.clerkUserId ?? 'clerk_user_123',
    email: overrides?.email ?? 'user@example.com',
    createdAt: NOW,
    updatedAt: NOW,
    deletionScheduledAt: null,
    deletionCancelledAt: null,
  };
}

function createMockDb({
  findFirstResult = undefined as ReturnType<typeof mockAccountRow> | undefined,
  insertReturning = [] as ReturnType<typeof mockAccountRow>[],
} = {}): Database {
  return {
    query: {
      accounts: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoNothing: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(insertReturning),
        }),
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
  } as unknown as Database;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('findAccountByClerkId', () => {
  it('returns null when account not found', async () => {
    const db = createMockDb({ findFirstResult: undefined });
    const result = await findAccountByClerkId(db, 'clerk_user_123');

    expect(result).toBeNull();
  });

  it('returns mapped account when found', async () => {
    const row = mockAccountRow();
    const db = createMockDb({ findFirstResult: row });
    const result = await findAccountByClerkId(db, 'clerk_user_123');

    expect(result).toEqual({
      id: 'acc-1',
      clerkUserId: 'clerk_user_123',
      email: 'user@example.com',
      createdAt: '2025-01-15T10:00:00.000Z',
      updatedAt: '2025-01-15T10:00:00.000Z',
    });
  });
});

describe('findOrCreateAccount', () => {
  it('returns existing account when found', async () => {
    const row = mockAccountRow({
      clerkUserId: 'clerk_user_456',
      email: 'other@example.com',
    });
    const db = createMockDb({ findFirstResult: row });
    const result = await findOrCreateAccount(
      db,
      'clerk_user_456',
      'other@example.com'
    );

    expect(result.clerkUserId).toBe('clerk_user_456');
    expect(result.email).toBe('other@example.com');
    expect(db.insert).not.toHaveBeenCalled();
    // Should NOT create a trial subscription for existing accounts
    expect(mockCreateSubscription).not.toHaveBeenCalled();
  });

  it('creates new account when not found', async () => {
    const newRow = mockAccountRow({
      id: 'new-acc',
      clerkUserId: 'clerk_user_789',
      email: 'new@example.com',
    });
    const db = createMockDb({
      findFirstResult: undefined,
      insertReturning: [newRow],
    });
    const result = await findOrCreateAccount(
      db,
      'clerk_user_789',
      'new@example.com'
    );

    expect(result.id).toBe('new-acc');
    expect(result.clerkUserId).toBe('clerk_user_789');
    expect(result.email).toBe('new@example.com');
    expect(db.insert).toHaveBeenCalled();
  });

  it('auto-creates a trial subscription for new accounts (FR108)', async () => {
    const newRow = mockAccountRow({
      id: 'new-acc',
      clerkUserId: 'clerk_user_789',
      email: 'new@example.com',
    });
    const db = createMockDb({
      findFirstResult: undefined,
      insertReturning: [newRow],
    });

    await findOrCreateAccount(db, 'clerk_user_789', 'new@example.com');

    expect(mockCreateSubscription).toHaveBeenCalledTimes(1);
    expect(mockCreateSubscription).toHaveBeenCalledWith(
      db,
      'new-acc',
      'free',
      500,
      expect.objectContaining({
        status: 'trial',
        trialEndsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      })
    );
  });

  it('sets trial to expire 14 days from creation', async () => {
    const newRow = mockAccountRow({
      id: 'new-acc',
      clerkUserId: 'clerk_user_789',
      email: 'new@example.com',
    });
    const db = createMockDb({
      findFirstResult: undefined,
      insertReturning: [newRow],
    });

    const before = Date.now();
    await findOrCreateAccount(db, 'clerk_user_789', 'new@example.com');
    const after = Date.now();

    const callArgs = mockCreateSubscription.mock.calls[0];
    const options = callArgs[4] as { trialEndsAt: string };
    const trialEndsAt = new Date(options.trialEndsAt).getTime();

    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
    expect(trialEndsAt).toBeGreaterThanOrEqual(before + FOURTEEN_DAYS_MS);
    expect(trialEndsAt).toBeLessThanOrEqual(after + FOURTEEN_DAYS_MS);
  });

  it('returns account with correct shape', async () => {
    const row = mockAccountRow();
    const db = createMockDb({ findFirstResult: row });
    const result = await findOrCreateAccount(
      db,
      'clerk_user_123',
      'user@example.com'
    );

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('clerkUserId');
    expect(result).toHaveProperty('email');
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('updatedAt');
  });

  it('returns ISO 8601 timestamps', async () => {
    const row = mockAccountRow();
    const db = createMockDb({ findFirstResult: row });
    const result = await findOrCreateAccount(
      db,
      'clerk_user_123',
      'user@example.com'
    );

    expect(() => new Date(result.createdAt)).not.toThrow();
    expect(() => new Date(result.updatedAt)).not.toThrow();
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
