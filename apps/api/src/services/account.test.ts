// ---------------------------------------------------------------------------
// Account Service Tests (Story 5.2: timezone-aware trial provisioning)
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { findAccountByClerkId, findOrCreateAccount } from './account';

// Mock the billing service — trial auto-creation calls createSubscription
const mockCreateSubscription = jest.fn().mockResolvedValue({
  id: 'sub-trial',
  accountId: 'new-acc',
  tier: 'plus',
  status: 'trial',
});
jest.mock('./billing', () => ({
  createSubscription: (...args: unknown[]) => mockCreateSubscription(...args),
}));

// Mock the trial service — computeTrialEndDate
const mockComputeTrialEndDate = jest
  .fn()
  .mockReturnValue(new Date('2025-01-29T23:59:59.999Z'));
jest.mock('./trial', () => ({
  computeTrialEndDate: (...args: unknown[]) => mockComputeTrialEndDate(...args),
}));

// Mock the subscription service — getTierConfig
jest.mock('./subscription', () => ({
  getTierConfig: jest.fn().mockReturnValue({
    monthlyQuota: 500,
    maxProfiles: 1,
    priceMonthly: 18.99,
    priceYearly: 168,
    topUpPrice: 10,
    topUpAmount: 500,
  }),
}));

const NOW = new Date('2025-01-15T10:00:00.000Z');

function mockAccountRow(
  overrides?: Partial<{
    id: string;
    clerkUserId: string;
    email: string;
    timezone: string | null;
  }>
) {
  return {
    id: overrides?.id ?? 'acc-1',
    clerkUserId: overrides?.clerkUserId ?? 'clerk_user_123',
    email: overrides?.email ?? 'user@example.com',
    timezone: overrides?.timezone ?? null,
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
      timezone: null,
      createdAt: '2025-01-15T10:00:00.000Z',
      updatedAt: '2025-01-15T10:00:00.000Z',
    });
  });

  it('maps timezone when present', async () => {
    const row = mockAccountRow({ timezone: 'Europe/Prague' });
    const db = createMockDb({ findFirstResult: row });
    const result = await findAccountByClerkId(db, 'clerk_user_123');

    expect(result!.timezone).toBe('Europe/Prague');
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

  it('auto-creates a trial subscription with Plus tier for new accounts (FR108)', async () => {
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
      'plus',
      500,
      expect.objectContaining({
        status: 'trial',
        trialEndsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      })
    );
  });

  it('uses computeTrialEndDate for timezone-aware trial expiry', async () => {
    const newRow = mockAccountRow({
      id: 'new-acc',
      clerkUserId: 'clerk_user_789',
      email: 'new@example.com',
    });
    const db = createMockDb({
      findFirstResult: undefined,
      insertReturning: [newRow],
    });

    await findOrCreateAccount(
      db,
      'clerk_user_789',
      'new@example.com',
      'Europe/Prague'
    );

    expect(mockComputeTrialEndDate).toHaveBeenCalledWith(
      expect.any(Date),
      'Europe/Prague'
    );
  });

  it('passes null timezone to computeTrialEndDate when not provided', async () => {
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

    expect(mockComputeTrialEndDate).toHaveBeenCalledWith(
      expect.any(Date),
      undefined
    );
  });

  it('stores timezone on account row when provided', async () => {
    const newRow = mockAccountRow({
      id: 'new-acc',
      clerkUserId: 'clerk_user_789',
      email: 'new@example.com',
      timezone: 'America/New_York',
    });
    const db = createMockDb({
      findFirstResult: undefined,
      insertReturning: [newRow],
    });

    await findOrCreateAccount(
      db,
      'clerk_user_789',
      'new@example.com',
      'America/New_York'
    );

    // Verify insert was called with timezone
    const insertCall = (db.insert as jest.Mock).mock.results[0].value;
    const valuesCall = insertCall.values as jest.Mock;
    const values = valuesCall.mock.calls[0][0];
    expect(values.timezone).toBe('America/New_York');
  });

  it('stores null timezone when not provided', async () => {
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

    const insertCall = (db.insert as jest.Mock).mock.results[0].value;
    const valuesCall = insertCall.values as jest.Mock;
    const values = valuesCall.mock.calls[0][0];
    expect(values.timezone).toBeNull();
  });

  it('returns account with correct shape including timezone', async () => {
    const row = mockAccountRow({ timezone: 'Asia/Tokyo' });
    const db = createMockDb({ findFirstResult: row });
    const result = await findOrCreateAccount(
      db,
      'clerk_user_123',
      'user@example.com'
    );

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('clerkUserId');
    expect(result).toHaveProperty('email');
    expect(result).toHaveProperty('timezone');
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('updatedAt');
    expect(result.timezone).toBe('Asia/Tokyo');
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
