// ---------------------------------------------------------------------------
// Account Service Tests (Story 5.2: timezone-aware trial provisioning)
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';
import {
  findAccountByClerkId,
  findOrCreateAccount,
  updateAccountEmailFromClerk,
} from './account';

// Mock the billing service — trial auto-creation calls createSubscription
const mockCreateSubscription = jest.fn().mockResolvedValue({
  id: 'sub-trial',
  accountId: 'new-acc',
  tier: 'plus',
  status: 'trial',
});
// [BUG-417] getSubscriptionByAccountId is now called on the existing-account
// branch to detect a missing trial subscription. Default: return a stub
// subscription so existing tests that take the findFirst path (account found)
// do not trigger the repair path. BUG-417 tests override this per-test.
const mockGetSubscriptionByAccountId = jest.fn().mockResolvedValue({
  id: 'sub-existing',
  accountId: 'acc-1',
  tier: 'plus',
  status: 'trial',
});
jest.mock('./billing', () => {
  const actual = jest.requireActual('./billing') as typeof import('./billing');
  return {
    ...actual,
    createSubscription: (...args: unknown[]) => mockCreateSubscription(...args),
    getSubscriptionByAccountId: (...args: unknown[]) =>
      mockGetSubscriptionByAccountId(...args),
  };
});

// Mock the trial service — computeTrialEndDate
const mockComputeTrialEndDate = jest
  .fn()
  .mockReturnValue(new Date('2025-01-29T23:59:59.999Z'));
jest.mock('./trial', () => {
  const actual = jest.requireActual('./trial') as typeof import('./trial');
  return {
    ...actual,
    computeTrialEndDate: (...args: unknown[]) =>
      mockComputeTrialEndDate(...args),
  };
});

// Mock the subscription service — getTierConfig
jest.mock('./subscription', () => {
  const actual = jest.requireActual(
    './subscription',
  ) as typeof import('./subscription');
  return {
    ...actual,
    getTierConfig: jest.fn().mockReturnValue({
      monthlyQuota: 500,
      dailyLimit: null,
      maxProfiles: 1,
      priceMonthly: 18.99,
      priceYearly: 168,
      topUpPrice: 10,
      topUpAmount: 500,
    }),
  };
});

// [BUG-837 / F-SVC-003] The trial-creation catch path now escalates via
// inngest event + sentry capture + structured log. Mock the dispatch
// surfaces so tests can assert escalation without a real Inngest client.
const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
  };
});

const mockCaptureException = jest.fn();
jest.mock('./sentry', () => {
  const actual = jest.requireActual('./sentry') as typeof import('./sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

const NOW = new Date('2025-01-15T10:00:00.000Z');

function mockAccountRow(
  overrides?: Partial<{
    id: string;
    clerkUserId: string;
    email: string;
    timezone: string | null;
  }>,
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

function createEmailUpdateDb({
  emailLookupResult = undefined as
    | ReturnType<typeof mockAccountRow>
    | undefined,
  // [CRITICAL-2a] The service now does TWO findFirst calls inside the tx:
  // (1) the by-email collision check → emailLookupResult, then
  // (2) the by-clerkUserId lookup of the CURRENT row (to capture the old
  // email for the security-notification) → currentAccountRow.
  currentAccountRow = undefined as
    | ReturnType<typeof mockAccountRow>
    | undefined,
  updateReturning = [] as ReturnType<typeof mockAccountRow>[],
} = {}): {
  db: Database;
  tx: {
    query: { accounts: { findFirst: jest.Mock } };
    update: jest.Mock;
  };
} {
  const returning = jest.fn().mockResolvedValue(updateReturning);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  const update = jest.fn().mockReturnValue({ set });
  const tx = {
    query: {
      accounts: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(emailLookupResult)
          .mockResolvedValueOnce(currentAccountRow)
          .mockResolvedValue(currentAccountRow),
      },
    },
    update,
  };
  const db = {
    transaction: jest.fn(async (callback: (inner: typeof tx) => unknown) =>
      callback(tx),
    ),
  } as unknown as Database;
  return { db, tx };
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
      'other@example.com',
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
      'new@example.com',
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
      }),
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
      'Europe/Prague',
    );

    expect(mockComputeTrialEndDate).toHaveBeenCalledWith(
      expect.any(Date),
      'Europe/Prague',
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
      undefined,
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
      'America/New_York',
    );

    // Verify insert was called with timezone
    const insertCall = (db.insert as jest.Mock).mock.results[0]!.value;
    const valuesCall = insertCall.values as jest.Mock;
    const values = valuesCall.mock.calls[0]![0];
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

    const insertCall = (db.insert as jest.Mock).mock.results[0]!.value;
    const valuesCall = insertCall.values as jest.Mock;
    const values = valuesCall.mock.calls[0]![0];
    expect(values.timezone).toBeNull();
  });

  it('returns account with correct shape including timezone', async () => {
    const row = mockAccountRow({ timezone: 'Asia/Tokyo' });
    const db = createMockDb({ findFirstResult: row });
    const result = await findOrCreateAccount(
      db,
      'clerk_user_123',
      'user@example.com',
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
      'user@example.com',
    );

    expect(() => new Date(result.createdAt)).not.toThrow();
    expect(() => new Date(result.updatedAt)).not.toThrow();
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // [BUG-837 / F-SVC-003] When createSubscription throws, account creation
  // must still succeed (lazy-provision contract) — but the failure MUST
  // escalate per AGENTS.md ("Silent recovery without escalation is banned in
  // billing/auth/webhook code"). Three escalation surfaces required:
  // structured log, Sentry capture, Inngest event.
  describe('[BUG-837] trial subscription failure escalation', () => {
    it('[BREAK] account is still returned when createSubscription throws (lazy-provision contract)', async () => {
      mockCreateSubscription.mockRejectedValueOnce(
        new Error('DB constraint violation'),
      );
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
        'new@example.com',
      );

      expect(result.id).toBe('new-acc');
    });

    it('[BREAK] silent recovery is banned: subscription failure dispatches app/billing.trial_subscription_failed', async () => {
      mockCreateSubscription.mockRejectedValueOnce(
        new Error('DB constraint violation'),
      );
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

      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/billing.trial_subscription_failed',
          data: expect.objectContaining({
            accountId: 'new-acc',
            reason: 'DB constraint violation',
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          }),
        }),
      );
    });

    it('[BREAK] subscription failure also calls captureException with billing context', async () => {
      mockCreateSubscription.mockRejectedValueOnce(
        new Error('DB constraint violation'),
      );
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

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            flow: 'findOrCreateAccount.trialSubscription',
            accountId: 'new-acc',
          }),
        }),
      );
    });

    it('account creation still succeeds when the inngest dispatch itself fails (defense-in-depth)', async () => {
      mockCreateSubscription.mockRejectedValueOnce(
        new Error('DB constraint violation'),
      );
      mockInngestSend.mockRejectedValueOnce(new Error('Inngest unavailable'));
      const newRow = mockAccountRow({
        id: 'new-acc',
        clerkUserId: 'clerk_user_789',
        email: 'new@example.com',
      });
      const db = createMockDb({
        findFirstResult: undefined,
        insertReturning: [newRow],
      });

      // Must not throw — primary lazy-provision contract is preserved even
      // when escalation can't be dispatched.
      const result = await findOrCreateAccount(
        db,
        'clerk_user_789',
        'new@example.com',
      );

      expect(result.id).toBe('new-acc');
      expect(mockCaptureException).toHaveBeenCalled(); // primary capture still ran
    });
  });

  // [BREAK — BUG-411] Email-reuse silent rewire is an account-takeover vector.
  // When email matches an existing account with a DIFFERENT clerkUserId, the
  // service must block the attempt loudly rather than silently reassigning the
  // existing account to the incoming Clerk identity.
  describe('[BUG-411] email-reuse reclaim block', () => {
    function makeReclaimDb(staleRow: ReturnType<typeof mockAccountRow>) {
      const mockFindFirst = jest
        .fn()
        // 1st call: findAccountByClerkId → not found (new clerkUserId)
        .mockResolvedValueOnce(undefined)
        // 2nd call: email lookup → found stale row
        .mockResolvedValueOnce(staleRow);

      return {
        db: {
          query: { accounts: { findFirst: mockFindFirst } },
          insert: jest.fn(),
          update: jest.fn(),
        } as unknown as Database,
        mockFindFirst,
      };
    }

    it('[BREAK][BUG-411] throws ConflictError instead of silently rewiring', async () => {
      // [BREAK] Without the fix: findOrCreateAccount silently updated the account row to the new clerkUserId, enabling account takeover.
      //   (Reverting the reclaim-block guard in services/account.ts makes this test fail.)
      const staleRow = mockAccountRow({
        id: 'acc-existing',
        clerkUserId: 'clerk_old_deleted',
        email: 'returning@example.com',
      });
      const { db } = makeReclaimDb(staleRow);

      await expect(
        findOrCreateAccount(
          db,
          'clerk_new_reregistered',
          'returning@example.com',
        ),
      ).rejects.toThrow('An account with this email already exists');

      // Must NOT update the existing row (no silent rewire)
      expect(db.update).not.toHaveBeenCalled();
      // Must NOT insert a new row
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('[BREAK][BUG-411] calls captureException with reclaim_attempt_blocked tag', async () => {
      // [BREAK] Without the fix: no captureException call occurred; the reclaim attempt was invisible to on-call.
      //   (Reverting the reclaim-block guard in services/account.ts makes this test fail.)
      const staleRow = mockAccountRow({
        id: 'acc-existing',
        clerkUserId: 'clerk_old_deleted',
        email: 'returning@example.com',
      });
      const { db } = makeReclaimDb(staleRow);

      await expect(
        findOrCreateAccount(
          db,
          'clerk_new_reregistered',
          'returning@example.com',
        ),
      ).rejects.toThrow();

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            'account.reclaim_attempt_blocked': true,
            flow: 'findOrCreateAccount.reclaimBlock',
            incomingClerkUserId: 'clerk_new_reregistered',
            existingClerkUserId: 'clerk_old_deleted',
          }),
        }),
      );
    });

    it('[BREAK][BUG-411] dispatches app/account.reclaim_attempt via safeSend', async () => {
      // [BREAK] Without the fix: no Inngest event was emitted; reclaim attempts were silently dropped.
      //   (Reverting the reclaim-block guard in services/account.ts makes this test fail.)
      const staleRow = mockAccountRow({
        id: 'acc-existing',
        clerkUserId: 'clerk_old_deleted',
        email: 'returning@example.com',
      });
      const { db } = makeReclaimDb(staleRow);

      await expect(
        findOrCreateAccount(
          db,
          'clerk_new_reregistered',
          'returning@example.com',
        ),
      ).rejects.toThrow();

      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/account.reclaim_attempt',
          data: expect.objectContaining({
            incomingClerkUserId: 'clerk_new_reregistered',
            existingClerkUserId: 'clerk_old_deleted',
            emailHash: expect.stringMatching(/^[0-9a-f]{64}$/),
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          }),
        }),
      );
    });

    it('does not block when email matches the same clerkUserId (no collision)', async () => {
      // Exercises: findAccountByClerkId miss, email lookup returns the same
      // clerkUserId → guard should NOT fire. Falls through to insert path.
      const ownRow = mockAccountRow({
        id: 'acc-own',
        clerkUserId: 'clerk_same',
        email: 'same@example.com',
      });

      const db = {
        query: {
          accounts: {
            findFirst: jest
              .fn()
              .mockResolvedValueOnce(undefined) // clerkUserId lookup → miss
              .mockResolvedValueOnce(ownRow), // email lookup → same clerkUserId, no block
          },
        },
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            onConflictDoNothing: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([ownRow]),
            }),
          }),
        }),
      } as unknown as Database;

      // Should not throw — email matches same clerkUserId, falls through to insert
      const result = await findOrCreateAccount(
        db,
        'clerk_same',
        'same@example.com',
      );
      expect(result.id).toBe('acc-own');
      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  // [BUG-417] BREAK TESTS: concurrent first-request race skips trial subscription.
  // When two concurrent requests both pass the initial findFirst check (account
  // not found), one wins the DB insert and creates the trial. If the winning
  // request fails mid-flight after inserting the account row but before the trial
  // subscription is committed, the losing request then finds `existing != null`
  // and returned early — leaving an account without a trial subscription.
  // Post-fix: when findOrCreateAccount finds an existing account but no
  // subscription, it attempts to repair by creating the trial idempotently.
  describe('[BUG-417] idempotent trial repair for accounts missing a subscription', () => {
    function makeMissingTrialDb(
      accountRow: ReturnType<typeof mockAccountRow>,
    ): Database {
      return {
        query: {
          accounts: {
            findFirst: jest.fn().mockResolvedValue(accountRow),
          },
        },
        // insert should not be called (account already exists)
        insert: jest.fn(),
      } as unknown as Database;
    }

    it('[BREAK] account seeded without subscription gets trial created on next findOrCreate call', async () => {
      // [BREAK] Without the fix: findOrCreateAccount returned early when account already existed, leaving it permanently without a trial subscription.
      //   (Reverting the missing-trial repair path in services/account.ts makes this test fail.)
      // Simulate: account exists (race winner created it), but sub is missing
      // (the winner crashed before trial insertion committed).
      mockGetSubscriptionByAccountId.mockResolvedValueOnce(null); // no sub
      mockCreateSubscription.mockResolvedValueOnce({
        id: 'sub-repaired',
        accountId: 'acc-1',
        tier: 'plus',
        status: 'trial',
      });

      const accountWithNoSub = mockAccountRow({ id: 'acc-1' });
      const db = makeMissingTrialDb(accountWithNoSub);

      const result = await findOrCreateAccount(
        db,
        'clerk_user_123',
        'user@example.com',
      );

      expect(result.id).toBe('acc-1');
      // Trial must have been created in the repair path
      expect(mockCreateSubscription).toHaveBeenCalledWith(
        db,
        'acc-1',
        'plus',
        expect.any(Number),
        expect.objectContaining({
          status: 'trial',
          trialEndsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
      );
    });

    it('[BREAK] repair path emits app/account.trial_missing_repair_attempted via safeSend for observability', async () => {
      // [BREAK] Without the fix: the repair path ran silently with no Inngest event; missing-trial races were invisible in production.
      //   (Reverting the safeSend dispatch in the repair path in services/account.ts makes this test fail.)
      mockGetSubscriptionByAccountId.mockResolvedValueOnce(null); // no sub

      const accountWithNoSub = mockAccountRow({ id: 'acc-1' });
      const db = makeMissingTrialDb(accountWithNoSub);

      await findOrCreateAccount(db, 'clerk_user_123', 'user@example.com');

      // The safeSend dispatch must include the accountId
      // so on-call can query how often this race fires in the last 24h.
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/account.trial_missing_repair_attempted',
          data: expect.objectContaining({
            accountId: 'acc-1',
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          }),
        }),
      );
    });

    it('does NOT trigger repair when account has an existing subscription', async () => {
      // Default mock already returns a subscription — no repair should fire
      mockGetSubscriptionByAccountId.mockResolvedValueOnce({
        id: 'sub-existing',
        accountId: 'acc-1',
        tier: 'plus',
        status: 'active',
      });

      const accountWithSub = mockAccountRow({ id: 'acc-1' });
      const db = makeMissingTrialDb(accountWithSub);

      await findOrCreateAccount(db, 'clerk_user_123', 'user@example.com');

      // No repair — subscription already present
      expect(mockCreateSubscription).not.toHaveBeenCalled();
      expect(mockInngestSend).not.toHaveBeenCalled();
    });
  });
});

describe('updateAccountEmailFromClerk', () => {
  it('updates the authenticated account email when it matches Clerk verified primary email', async () => {
    const updatedRow = mockAccountRow({
      clerkUserId: 'user_test',
      email: 'new@example.com',
    });
    const { db, tx } = createEmailUpdateDb({
      emailLookupResult: undefined,
      currentAccountRow: mockAccountRow({
        clerkUserId: 'user_test',
        email: 'old@example.com',
      }),
      updateReturning: [updatedRow],
    });
    const fetchImpl = clerkUserFetch('new@example.com');

    const result = await updateAccountEmailFromClerk(db, {
      clerkUserId: 'user_test',
      requestedEmail: 'new@example.com',
      clerkSecretKey: 'sk_test',
      fetchImpl,
    });

    expect(result.email).toBe('new@example.com');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    // Two lookups now: by-email collision check + by-clerkUserId current row.
    expect(tx.query.accounts.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.clerk.com/v1/users/user_test',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk_test' },
      }),
    );
  });

  it('[BREAK CRITICAL-2a] dispatches app/account.security-event to the OLD email on a real change', async () => {
    const updatedRow = mockAccountRow({
      clerkUserId: 'user_test',
      email: 'new@example.com',
    });
    const { db } = createEmailUpdateDb({
      emailLookupResult: undefined,
      currentAccountRow: mockAccountRow({
        clerkUserId: 'user_test',
        email: 'old@example.com',
      }),
      updateReturning: [updatedRow],
    });

    await updateAccountEmailFromClerk(db, {
      clerkUserId: 'user_test',
      requestedEmail: 'new@example.com',
      clerkSecretKey: 'sk_test',
      fetchImpl: clerkUserFetch('new@example.com'),
    });

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/account.security-event',
        data: expect.objectContaining({
          type: 'email_changed',
          to: 'old@example.com',
        }),
      }),
    );
  });

  it('does NOT dispatch a security notification when the email is unchanged', async () => {
    const sameRow = mockAccountRow({
      clerkUserId: 'user_test',
      email: 'same@example.com',
    });
    const { db } = createEmailUpdateDb({
      emailLookupResult: undefined,
      currentAccountRow: sameRow,
      updateReturning: [sameRow],
    });

    await updateAccountEmailFromClerk(db, {
      clerkUserId: 'user_test',
      requestedEmail: 'same@example.com',
      clerkSecretKey: 'sk_test',
      fetchImpl: clerkUserFetch('same@example.com'),
    });

    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it('[BREAK auth-2] rejects when the requested email belongs to another account', async () => {
    const { db, tx } = createEmailUpdateDb({
      emailLookupResult: mockAccountRow({
        clerkUserId: 'different_user',
        email: 'new@example.com',
      }),
      updateReturning: [],
    });
    const fetchImpl = clerkUserFetch('new@example.com');

    await expect(
      updateAccountEmailFromClerk(db, {
        clerkUserId: 'user_test',
        requestedEmail: 'new@example.com',
        clerkSecretKey: 'sk_test',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(tx.update).not.toHaveBeenCalled();
  });

  it('rejects a client email that does not match Clerk verified primary email', async () => {
    const { db } = createEmailUpdateDb();
    const fetchImpl = clerkUserFetch('old@example.com');

    await expect(
      updateAccountEmailFromClerk(db, {
        clerkUserId: 'user_test',
        requestedEmail: 'new@example.com',
        clerkSecretKey: 'sk_test',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('[BREAK auth-2] rejects when the caller clerkUserId has no local account row', async () => {
    const { db } = createEmailUpdateDb({
      emailLookupResult: undefined,
      updateReturning: [],
    });
    const fetchImpl = clerkUserFetch('new@example.com');

    await expect(
      updateAccountEmailFromClerk(db, {
        clerkUserId: 'missing_user',
        requestedEmail: 'new@example.com',
        clerkSecretKey: 'sk_test',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
