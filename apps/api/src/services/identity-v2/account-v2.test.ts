// ---------------------------------------------------------------------------
// [WI-586 C4] account-v2 — updateLoginEmailFromClerk write-path guard.
//
// The v2 twin must write `login.email` (NOT the dropped `accounts.email`).
// Mirrors the legacy `updateAccountEmailFromClerk` unit tests
// (services/account.test.ts): Clerk verification is driven via an injected
// `fetchImpl`, the DB via a transactional mock, and the non-core security
// notification via the external-boundary `inngest/client` mock.
// ---------------------------------------------------------------------------

import { login } from '@eduagent/database';
import type { Database } from '@eduagent/database';
import { ConflictError } from '../../errors';
import { updateLoginEmailFromClerk } from './account-v2';

const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock(
  '../../inngest/client' /* gc1-allow: external-boundary — Inngest framework client */,
  () => {
    const actual = jest.requireActual(
      '../../inngest/client',
    ) as typeof import('../../inngest/client');
    return {
      ...actual,
      inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
    };
  },
);

const NOW = new Date('2025-01-15T10:00:00.000Z');

function mockLoginRow(
  overrides?: Partial<{ clerkUserId: string; email: string; personId: string }>,
) {
  return {
    id: 'login-1',
    personId: overrides?.personId ?? 'person-1',
    clerkUserId: overrides?.clerkUserId ?? 'user_test',
    email: overrides?.email ?? 'old@example.com',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function clerkUserFetch(
  primaryEmail: string,
): jest.MockedFunction<typeof fetch> {
  return jest.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        primary_email_address_id: 'email-primary',
        email_addresses: [
          {
            id: 'email-primary',
            email_address: primaryEmail,
            verification: { status: 'verified' },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  ) as jest.MockedFunction<typeof fetch>;
}

function createLoginEmailUpdateDb({
  emailLookupResult = undefined as ReturnType<typeof mockLoginRow> | undefined,
  // Two findFirst calls inside the tx: (1) by-email collision check, then
  // (2) by-clerkUserId current row (to capture the old email for the
  // security notification).
  currentLoginRow = undefined as ReturnType<typeof mockLoginRow> | undefined,
  updateReturning = [] as Array<{ email: string; personId: string }>,
} = {}) {
  const returning = jest.fn().mockResolvedValue(updateReturning);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  const update = jest.fn().mockReturnValue({ set });
  const tx = {
    query: {
      login: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(emailLookupResult)
          .mockResolvedValueOnce(currentLoginRow)
          .mockResolvedValue(currentLoginRow),
      },
    },
    update,
  };
  const db = {
    transaction: jest.fn(async (callback: (inner: typeof tx) => unknown) =>
      callback(tx),
    ),
  } as unknown as Database;
  return { db, tx, update, set, where, returning };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateLoginEmailFromClerk (WI-586 C4 v2 twin)', () => {
  it('writes login.email (not the dropped accounts table) when the requested email matches the Clerk verified primary', async () => {
    const { db, tx, update, set } = createLoginEmailUpdateDb({
      emailLookupResult: undefined,
      currentLoginRow: mockLoginRow({
        clerkUserId: 'user_test',
        email: 'old@example.com',
      }),
      updateReturning: [{ email: 'new@example.com', personId: 'person-1' }],
    });
    const fetchImpl = clerkUserFetch('new@example.com');

    const result = await updateLoginEmailFromClerk(db, {
      clerkUserId: 'user_test',
      requestedEmail: 'new@example.com',
      organizationId: 'org-1',
      clerkSecretKey: 'sk_test',
      fetchImpl,
    });

    expect(result.email).toBe('new@example.com');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    // Two lookups: by-email collision check + by-clerkUserId current row.
    expect(tx.query.login.findFirst).toHaveBeenCalledTimes(2);
    // THE WRITE: targets the `login` table and sets email to the verified value.
    expect(update).toHaveBeenCalledWith(login);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com' }),
    );
    // old → new is a real change → security notification to the OLD address.
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/account.security-event',
        data: expect.objectContaining({
          type: 'email_changed',
          to: 'old@example.com',
        }),
      }),
    );
    // Clerk lookup forced through the injected fetch with the caller's key.
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.clerk.com/v1/users/user_test',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk_test' },
      }),
    );
  });

  it('[BREAK] rejects with ConflictError and performs no write when the email already belongs to another login row', async () => {
    const { db, update } = createLoginEmailUpdateDb({
      emailLookupResult: mockLoginRow({
        clerkUserId: 'different_user',
        email: 'new@example.com',
      }),
      updateReturning: [],
    });

    await expect(
      updateLoginEmailFromClerk(db, {
        clerkUserId: 'user_test',
        requestedEmail: 'new@example.com',
        organizationId: 'org-1',
        clerkSecretKey: 'sk_test',
        fetchImpl: clerkUserFetch('new@example.com'),
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(update).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});
