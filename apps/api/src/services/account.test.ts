// ---------------------------------------------------------------------------
// Account Service Tests
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { findAccountByClerkId, findOrCreateAccount } from './account';

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
