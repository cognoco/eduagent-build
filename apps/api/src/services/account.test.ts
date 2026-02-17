// ---------------------------------------------------------------------------
// Account Service Tests
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { findAccountByClerkId, findOrCreateAccount } from './account';

// Stub database — no actual queries are executed in these stubs
const db = {} as Database;

describe('findAccountByClerkId', () => {
  it('returns null (TODO stub — no DB integration yet)', async () => {
    const result = await findAccountByClerkId(db, 'clerk_user_123');

    expect(result).toBeNull();
  });
});

describe('findOrCreateAccount', () => {
  it('returns account with correct shape', async () => {
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

  it('returns correct email and clerkUserId', async () => {
    const result = await findOrCreateAccount(
      db,
      'clerk_user_456',
      'other@example.com'
    );

    expect(result.clerkUserId).toBe('clerk_user_456');
    expect(result.email).toBe('other@example.com');
  });

  it('returns ISO 8601 timestamps', async () => {
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
