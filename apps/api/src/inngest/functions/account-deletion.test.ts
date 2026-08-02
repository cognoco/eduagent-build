import { scheduledDeletion } from './account-deletion';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import * as sentry from '../../services/sentry';
import { NonRetriableError } from 'inngest';

const mockGetStepDatabase = jest.fn();
const mockGetStepClerkSecretKey = jest.fn();
const mockDeleteClerkUser = jest.fn();
// Controls the live-flag fallback inside the handler. Pinned to false in the
// v1 suites (so their assertions on the legacy service functions hold) and to
// true in the [CUT-B2] v2 suite. NOTE: with the schedule-time mode pinning, an
// event that carries `identityVersion` ignores this entirely — it is only the
// fallback for legacy/unstamped events.
const mockIsIdentityV2EnabledInStep = jest.fn().mockReturnValue(false);

// v2 deletion-service twins — assertable doubles for the [CUT-B2] suite.
const mockOrganizationExistsV2 = jest.fn();
const mockIsDeletionCancelledV2 = jest.fn();
const mockExecuteDeletionV2 = jest.fn();
const mockGetOrganizationOwnerClerkUserIdV2 = jest.fn();
const mockGetOrganizationOwnerEmailV2 = jest.fn();
const mockGetSubscriptionStoreTeardownTargetsV2 = jest.fn();
const mockEnsurePendingClerkErasures = jest.fn().mockResolvedValue(true);
const mockMarkPendingClerkErasuresComplete = jest
  .fn()
  .mockResolvedValue(undefined);
const mockGetOrganizationErasureSnapshotV2 = jest.fn(
  async (db: unknown, organizationId: unknown) => {
    const clerkUserId = await mockGetOrganizationOwnerClerkUserIdV2(
      db,
      organizationId,
    );
    const ownerEmail = await mockGetOrganizationOwnerEmailV2(
      db,
      organizationId,
    );
    return {
      organizationExists: true,
      organizationId,
      personIds: ['person-owner'],
      clerkUserIds: clerkUserId ? [clerkUserId] : [],
      loginEmails: ownerEmail ? [ownerEmail] : [],
      subscriptionStoreTeardownTargets:
        await mockGetSubscriptionStoreTeardownTargetsV2(db, organizationId),
    };
  },
);

jest.mock(
  '../helpers' /* gc1-allow: getStepDatabase/getStepClerkSecretKey wrap Inngest step-level binding acquisition; must be intercepted to inject test doubles without a real Neon connection or CF env */,
  () => {
    const actual = jest.requireActual(
      '../helpers',
    ) as typeof import('../helpers');
    return {
      ...actual,
      getStepDatabase: () => mockGetStepDatabase(),
      getStepClerkSecretKey: () => mockGetStepClerkSecretKey(),
      // Controllable so v1 suites pin false and the [CUT-B2] suite pins true;
      // defaults to false so assertions on the legacy service functions hold
      // regardless of process.env.IDENTITY_V2_ENABLED in the local dev env.
      isIdentityV2EnabledInStep: () => mockIsIdentityV2EnabledInStep(),
    };
  },
);

jest.mock(
  '../../services/identity-v2/deletion-v2' /* gc1-allow: v2 deletion twins read the organization graph via the real DB; the unit suite asserts step wiring with doubles, real-DB behavior lives in deletion-v2 integration tests */,
  () => {
    const actual = jest.requireActual(
      '../../services/identity-v2/deletion-v2',
    ) as typeof import('../../services/identity-v2/deletion-v2');
    return {
      ...actual,
      organizationExistsV2: (...args: unknown[]) =>
        mockOrganizationExistsV2(...args),
      isDeletionCancelledV2: (...args: unknown[]) =>
        mockIsDeletionCancelledV2(...args),
      executeDeletionV2: (...args: unknown[]) => mockExecuteDeletionV2(...args),
      getOrganizationErasureSnapshotV2: (db: unknown, organizationId: string) =>
        mockGetOrganizationErasureSnapshotV2(db, organizationId),
      getOrganizationOwnerClerkUserIdV2: (...args: unknown[]) =>
        mockGetOrganizationOwnerClerkUserIdV2(...args),
      getOrganizationOwnerEmailV2: (...args: unknown[]) =>
        mockGetOrganizationOwnerEmailV2(...args),
      getSubscriptionStoreTeardownTargetsV2: (...args: unknown[]) =>
        mockGetSubscriptionStoreTeardownTargetsV2(...args),
      ensurePendingClerkErasures: (...args: unknown[]) =>
        mockEnsurePendingClerkErasures(...args),
      markPendingClerkErasuresComplete: (...args: unknown[]) =>
        mockMarkPendingClerkErasuresComplete(...args),
    };
  },
);

jest.mock(
  '../../services/clerk-user' /* gc1-allow: deleteClerkUser performs a live DELETE against the Clerk Backend API (a true external boundary) — it cannot run in the unit test environment */,
  () => {
    const actual = jest.requireActual(
      '../../services/clerk-user',
    ) as typeof import('../../services/clerk-user');
    return {
      ...actual,
      deleteClerkUser: (...args: unknown[]) => mockDeleteClerkUser(...args),
    };
  },
);

describe('scheduledDeletion', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    // [WI-867] v2-only: flag collapsed; absent-identityVersion events route to v2.
    // mockIsIdentityV2EnabledInStep is no longer called by the source — routing
    // is determined by event.data.identityVersion (absent → v2 default).
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockGetStepClerkSecretKey.mockReturnValue('sk_test_step');
    // v2 defaults (replaces v1 mockAccountExists / mockGetAccountClerkUserId)
    mockOrganizationExistsV2.mockResolvedValue(true);
    mockIsDeletionCancelledV2.mockResolvedValue(false);
    mockExecuteDeletionV2.mockResolvedValue('deleted');
    // [WI-867] real getSubscriptionStoreTeardownTargetsV2 returns
    // SubscriptionStoreTeardownTarget[] (deletion-v2.ts:944, rows.map → always an
    // array); default to the empty (no-subscriptions) case.
    mockGetSubscriptionStoreTeardownTargetsV2.mockResolvedValue([]);
    mockGetOrganizationOwnerClerkUserIdV2.mockResolvedValue('clerk_v2-1');
    mockGetOrganizationOwnerEmailV2.mockResolvedValue('owner@example.com');
    mockDeleteClerkUser.mockResolvedValue({ deleted: true });
  });

  it('should be defined as an Inngest function with the expected id', () => {
    // Bug 203: previously a truthy check that passed for any value. Assert
    // the actual Inngest-function id so a renamed/misexported function fails.
    expect((scheduledDeletion as { opts?: { id?: string } }).opts?.id).toBe(
      'scheduled-account-deletion',
    );
  });

  it('should have the correct function id', () => {
    const config = (scheduledDeletion as any).opts;
    expect(config.id).toBe('scheduled-account-deletion');
  });

  it('should trigger on app/account.deletion-scheduled event', () => {
    const triggers = (scheduledDeletion as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/account.deletion-scheduled' }),
      ]),
    );
  });

  it('sleeps for 7-day grace period before checking cancellation', async () => {
    const { step, sleepCalls } = createInngestStepRunner();
    // [WI-867] v2 mocks set in beforeEach — no per-test overrides needed.

    const handler = (scheduledDeletion as any).fn;
    await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    expect(sleepCalls).toContainEqual({ name: 'grace-period', duration: '7d' });
  });

  it('returns cancelled status when deletion was cancelled during grace period', async () => {
    const { step } = createInngestStepRunner();
    // [WI-867] v2: isDeletionCancelledV2 replaces isDeletionCancelled; v2 still
    // returns { status: 'cancelled' } (no accountId) from the check-cancellation
    // early-exit (source line 166) — same shape as the pre-collapse v1 path.
    mockIsDeletionCancelledV2.mockResolvedValue(true);

    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    expect(result).toEqual({ status: 'cancelled' });
    expect(mockIsDeletionCancelledV2).toHaveBeenCalledWith(mockDb, 'acc-1');
    expect(mockExecuteDeletionV2).not.toHaveBeenCalled();
  });

  it('executes deletion when not cancelled', async () => {
    const { step } = createInngestStepRunner();
    // [WI-867] v2: executeDeletionV2 replaces executeDeletion.

    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'acc-1' });
    expect(mockExecuteDeletionV2).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        organizationId: 'acc-1',
        ownerEmail: 'owner@example.com',
        reason: 'user_initiated',
        deletedBy: null,
      }),
    );
  });

  it('[WI-2788] uses the explicit owner email consistently across a snapshot retry', async () => {
    mockGetOrganizationErasureSnapshotV2
      .mockResolvedValueOnce({
        organizationExists: true,
        organizationId: 'acc-1',
        personIds: ['person-owner', 'person-member'],
        clerkUserIds: ['clerk-member', 'clerk-owner'],
        loginEmails: ['member@example.com', 'owner@example.com'],
        subscriptionStoreTeardownTargets: [],
      })
      .mockResolvedValueOnce({
        organizationExists: true,
        organizationId: 'acc-1',
        personIds: ['person-owner', 'person-member'],
        clerkUserIds: ['clerk-member', 'clerk-owner'],
        loginEmails: ['another-member@example.com', 'owner@example.com'],
        subscriptionStoreTeardownTargets: [],
      });
    mockExecuteDeletionV2
      .mockResolvedValueOnce('snapshot_changed')
      .mockResolvedValueOnce('deleted');

    const { step } = createInngestStepRunner();
    await (scheduledDeletion as any).fn({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    expect(mockExecuteDeletionV2).toHaveBeenCalledTimes(2);
    expect(mockExecuteDeletionV2.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ ownerEmail: 'owner@example.com' }),
    );
    expect(mockExecuteDeletionV2.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ ownerEmail: 'owner@example.com' }),
    );
  });

  it('calls getStepDatabase inside each step.run closure', async () => {
    const { step } = createInngestStepRunner();
    // [WI-867] v2 mocks set in beforeEach.

    const handler = (scheduledDeletion as any).fn;
    await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    // Existing durable scalar steps remain DB-backed for rollback/resume ABI
    // compatibility. The complete snapshot, reserve, destructive-boundary
    // revalidation, and release add four more DB reads to the six historical
    // reads. Clerk deletion also uses the secret binding.
    expect(mockGetStepDatabase).toHaveBeenCalledTimes(10);
  });

  // [BREAK / BUG-844] If the account was removed during the 7-day sleep
  // (admin manual deletion, GC, restore-from-backup gone wrong), the
  // function must NOT proceed to executeDeletion — it should return
  // 'already_deleted' so on-call telemetry distinguishes it from happy-path
  // completions, and so we don't issue a no-op DELETE that misleadingly
  // reports 'deleted'.
  it('[BREAK / BUG-844] returns already_deleted without running cancellation/deletion when account is gone', async () => {
    const { step } = createInngestStepRunner();
    // [WI-867] v2: organizationExistsV2 replaces accountExists.
    mockOrganizationExistsV2.mockResolvedValue(false);

    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-gone' } },
      step,
    });

    expect(result).toEqual({
      status: 'already_deleted',
      accountId: 'acc-gone',
    });
    expect(mockIsDeletionCancelledV2).not.toHaveBeenCalled();
    expect(mockExecuteDeletionV2).not.toHaveBeenCalled();
  });

  it('[BUG-844] still sleeps 7d before checking accountExists (no instant fast-path)', async () => {
    // Use a shared call-order log to verify sleep precedes all step.run calls.
    const callOrder: Array<{ kind: 'sleep' | 'run'; name: string }> = [];
    const { step, sleepCalls } = createInngestStepRunner();

    // Wrap the step to record interleaved call order.
    const trackedStep = {
      run: async (name: string, fn: () => Promise<unknown>) => {
        callOrder.push({ kind: 'run', name });
        return step.run(name, fn);
      },
      sleep: async (name: string, duration: string) => {
        callOrder.push({ kind: 'sleep', name });
        return step.sleep(name, duration);
      },
    };

    // [WI-867] v2: organizationExistsV2 replaces accountExists.
    mockOrganizationExistsV2.mockResolvedValue(false);

    const handler = (scheduledDeletion as any).fn;
    await handler({
      event: { data: { accountId: 'acc-1' } },
      step: trackedStep,
    });

    expect(sleepCalls).toContainEqual({ name: 'grace-period', duration: '7d' });
    // Order check: sleep must appear before any step.run in the interleaved log.
    const sleepIdx = callOrder.findIndex(
      (c) => c.kind === 'sleep' && c.name === 'grace-period',
    );
    const firstRunIdx = callOrder.findIndex((c) => c.kind === 'run');
    expect(sleepIdx).toBeGreaterThanOrEqual(0);
    expect(firstRunIdx).toBeGreaterThan(sleepIdx);
  });
});

// ---------------------------------------------------------------------------
// [FIX-INNGEST-2] Idempotency and concurrency config break tests
// ---------------------------------------------------------------------------

describe('[FIX-INNGEST-2] idempotency and concurrency config', () => {
  it('declares idempotency keyed on event.data.accountId', () => {
    const opts = (scheduledDeletion as any).opts;
    // Inngest reads idempotency from opts at runtime — the expression string
    // is the source of truth; the actual dedup is Inngest-server-side.
    expect(opts.idempotency).toBe('event.data.accountId');
  });

  it('declares concurrency limit of 1 keyed on event.data.accountId', () => {
    const opts = (scheduledDeletion as any).opts;
    expect(opts.concurrency).toMatchObject({
      key: 'event.data.accountId',
      limit: 1,
    });
  });

  it('declares retries: 5 for transient DB failures during deletion', () => {
    const opts = (scheduledDeletion as any).opts;
    expect(opts.retries).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// [Fix Bug #494] TOCTOU cancellation-race break tests (unit layer)
//
// executeDeletion now returns 'deleted' | 'cancelled' | 'already_deleted'.
// The account-deletion function must propagate the 'cancelled' result as
// { status: 'cancelled' } so on-call has accurate telemetry when the atomic
// guard fires.
//
// Red→green: before the fix executeDeletion returned void and the caller
// always returned { status: 'deleted' }. With the fix, when executeDeletion
// returns 'cancelled' the function must return { status: 'cancelled' }.
// ---------------------------------------------------------------------------
describe('[Fix Bug #494] TOCTOU cancellation detected by executeDeletion atomic guard', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    // [WI-867] v2-only: absent-identityVersion events default to v2.
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockGetStepClerkSecretKey.mockReturnValue('sk_test_step');
    mockOrganizationExistsV2.mockResolvedValue(true);
    mockIsDeletionCancelledV2.mockResolvedValue(false);
    // Default happy path; individual tests override for TOCTOU/already_deleted scenarios.
    mockExecuteDeletionV2.mockResolvedValue('deleted');
    // [WI-867] real getSubscriptionStoreTeardownTargetsV2 returns an array
    // (deletion-v2.ts:944); default to the empty (no-subscriptions) case.
    mockGetSubscriptionStoreTeardownTargetsV2.mockResolvedValue([]);
    mockGetOrganizationOwnerClerkUserIdV2.mockResolvedValue('clerk_v2-1');
    mockGetOrganizationOwnerEmailV2.mockResolvedValue('owner@example.com');
    mockDeleteClerkUser.mockResolvedValue({ deleted: true });
  });

  it('returns { status: "cancelled" } when executeDeletion atomic guard fires', async () => {
    // Simulates: user cancelled between check-cancellation and delete-account-data.
    // [WI-867] v2: the atomic WHERE in executeDeletionV2 catches it and returns
    // 'cancelled'; same TOCTOU semantic, different store.
    mockExecuteDeletionV2.mockResolvedValue('cancelled');

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-toctou' } },
      step,
    });

    expect(result).toEqual({ status: 'cancelled', accountId: 'acc-toctou' });
  });

  it('returns { status: "deleted" } on the happy path', async () => {
    // [WI-867] v2: executeDeletionV2 set in beforeEach.

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-happy' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'acc-happy' });
  });

  it('returns { status: "already_deleted" } when executeDeletion finds row missing', async () => {
    // [WI-867] v2: executeDeletionV2 returning 'already_deleted' maps to same
    // terminal status as before.
    mockExecuteDeletionV2.mockResolvedValue('already_deleted');

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-gone' } },
      step,
    });

    expect(result).toEqual({
      status: 'already_deleted',
      accountId: 'acc-gone',
    });
  });

  it('[WI-2788] refreshes the complete snapshot once after atomic snapshot drift', async () => {
    mockExecuteDeletionV2
      .mockResolvedValueOnce('snapshot_changed')
      .mockResolvedValueOnce('deleted');

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-drift' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'acc-drift' });
    expect(mockGetOrganizationErasureSnapshotV2).toHaveBeenCalledTimes(2);
    expect(mockExecuteDeletionV2).toHaveBeenCalledTimes(2);
  });

  it('[WI-2788] stops for operator reconciliation after a second snapshot drift', async () => {
    mockExecuteDeletionV2.mockResolvedValue('snapshot_changed');

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;

    await expect(
      handler({ event: { data: { accountId: 'acc-drift' } }, step }),
    ).rejects.toBeInstanceOf(NonRetriableError);
    expect(mockExecuteDeletionV2).toHaveBeenCalledTimes(2);
    expect(mockDeleteClerkUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [R1][BREAK] Right-to-erasure: after the DB cascade deletes the account, the
// external Clerk login identity (email/credentials/OAuth) must also be erased.
// Before this fix executeDeletion removed every in-app row but left the Clerk
// user alive — a GDPR Art 17 erasure gap. Red→green: remove the
// `delete-clerk-user` step from account-deletion.ts and the first test fails.
//
// Clerk is a true external boundary, so deleteClerkUser is mocked (gc1-allow
// above) — the assertion is on the wiring (was it called, with what), not on
// the network call itself, which clerk-user.test.ts covers directly.
// ---------------------------------------------------------------------------
describe('[R1] Clerk identity erasure on account deletion', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    // [WI-867] v2-only: absent-identityVersion events default to v2.
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockGetStepClerkSecretKey.mockReturnValue('sk_test_step');
    mockOrganizationExistsV2.mockResolvedValue(true);
    mockIsDeletionCancelledV2.mockResolvedValue(false);
    mockExecuteDeletionV2.mockResolvedValue('deleted');
    // [WI-867] real getSubscriptionStoreTeardownTargetsV2 returns an array
    // (deletion-v2.ts:944); default to the empty (no-subscriptions) case.
    mockGetSubscriptionStoreTeardownTargetsV2.mockResolvedValue([]);
    // [WI-867] v2 captures org-owner Clerk id instead of account Clerk id.
    mockGetOrganizationOwnerClerkUserIdV2.mockResolvedValue('clerk_user_abc');
    mockGetOrganizationOwnerEmailV2.mockResolvedValue('owner@example.com');
    mockDeleteClerkUser.mockResolvedValue({ deleted: true });
  });

  it('[BREAK] erases the Clerk user with the captured id after a "deleted" result', async () => {
    // [WI-867] v2: executeDeletionV2 + getOrganizationOwnerClerkUserIdV2 set in beforeEach.

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'acc-1' });
    expect(mockDeleteClerkUser).toHaveBeenCalledWith({
      userId: 'clerk_user_abc',
      clerkSecretKey: 'sk_test_step',
    });
  });

  it('[WI-2788] erases every Clerk identity captured for the organization', async () => {
    mockGetOrganizationErasureSnapshotV2.mockResolvedValueOnce({
      organizationExists: true,
      organizationId: 'acc-1',
      personIds: ['person-a', 'person-b'],
      clerkUserIds: ['clerk_user_a', 'clerk_user_b'],
      loginEmails: ['a@example.com', 'b@example.com'],
      subscriptionStoreTeardownTargets: [],
    });

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    await handler({ event: { data: { accountId: 'acc-1' } }, step });

    expect(mockDeleteClerkUser).toHaveBeenCalledTimes(2);
    expect(mockDeleteClerkUser).toHaveBeenCalledWith({
      userId: 'clerk_user_a',
      clerkSecretKey: 'sk_test_step',
    });
    expect(mockDeleteClerkUser).toHaveBeenCalledWith({
      userId: 'clerk_user_b',
      clerkSecretKey: 'sk_test_step',
    });
    expect(mockEnsurePendingClerkErasures).toHaveBeenCalledWith(mockDb, [
      'clerk_user_a',
      'clerk_user_b',
    ]);
    expect(mockMarkPendingClerkErasuresComplete).toHaveBeenCalledWith(mockDb, [
      'clerk_user_a',
      'clerk_user_b',
    ]);
  });

  it('[WI-2788] keeps every erasure fence pending when one Clerk deletion fails', async () => {
    mockGetOrganizationErasureSnapshotV2.mockResolvedValueOnce({
      organizationExists: true,
      organizationId: 'acc-1',
      personIds: ['person-a', 'person-b'],
      clerkUserIds: ['clerk_user_a', 'clerk_user_b'],
      loginEmails: ['a@example.com', 'b@example.com'],
      subscriptionStoreTeardownTargets: [],
    });
    mockDeleteClerkUser
      .mockResolvedValueOnce({ deleted: true })
      .mockRejectedValueOnce(new Error('synthetic Clerk outage'));

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;

    await expect(
      handler({ event: { data: { accountId: 'acc-1' } }, step }),
    ).rejects.toThrow('synthetic Clerk outage');
    expect(mockMarkPendingClerkErasuresComplete).not.toHaveBeenCalled();
  });

  it('[WI-2788] revalidates a memoized reservation before deleting a rebound Clerk identity', async () => {
    mockEnsurePendingClerkErasures.mockResolvedValueOnce(false);

    const { step } = createInngestStepRunner({
      // Models a sleeping run whose original reservation step completed before
      // its finite fence expired and the Clerk identity rebound.
      runResults: { 'reserve-clerk-users': true },
    });
    const handler = (scheduledDeletion as any).fn;

    await expect(
      handler({ event: { data: { accountId: 'acc-1' } }, step }),
    ).rejects.toBeInstanceOf(NonRetriableError);
    expect(mockEnsurePendingClerkErasures).toHaveBeenCalledTimes(1);
    expect(mockEnsurePendingClerkErasures).toHaveBeenCalledWith(mockDb, [
      'clerk_user_abc',
    ]);
    expect(mockDeleteClerkUser).not.toHaveBeenCalled();
    expect(mockMarkPendingClerkErasuresComplete).not.toHaveBeenCalled();
  });

  it('[WI-2788] resumes origin/main-shaped durable step receipts without losing Clerk cleanup', async () => {
    const { step, runNames } = createInngestStepRunner({
      runResults: {
        'capture-clerk-user-id': 'clerk_legacy_sleeping_run',
        'capture-owner-email': 'legacy@example.com',
        'capture-subscription-store-teardown-targets': [],
        'capture-organization-erasure-v2': {
          organizationExists: false,
          organizationId: 'acc-legacy',
          personIds: [],
          clerkUserIds: [],
          loginEmails: [],
          subscriptionStoreTeardownTargets: [],
        },
        'delete-account-data': 'already_deleted',
        // This is the OLD memoized result shape. The versioned executor must
        // never consume it as the new multi-user array result.
        'delete-clerk-user': { deleted: true },
      },
    });

    const handler = (scheduledDeletion as any).fn;
    await expect(
      handler({ event: { data: { accountId: 'acc-legacy' } }, step }),
    ).resolves.toEqual({
      status: 'already_deleted',
      accountId: 'acc-legacy',
    });

    expect(mockDeleteClerkUser).toHaveBeenCalledWith({
      userId: 'clerk_legacy_sleeping_run',
      clerkSecretKey: 'sk_test_step',
    });
    expect(runNames()).toContain('delete-clerk-users-v2');
    expect(runNames()).not.toContain('delete-clerk-user');
  });

  it('captures the Clerk id BEFORE executeDeletion removes the row', async () => {
    const callOrder: string[] = [];
    // [WI-867] v2: getOrganizationOwnerClerkUserIdV2 replaces getAccountClerkUserId.
    mockGetOrganizationOwnerClerkUserIdV2.mockImplementation(async () => {
      callOrder.push('capture');
      return 'clerk_user_abc';
    });
    mockExecuteDeletionV2.mockImplementation(async () => {
      callOrder.push('delete-db');
      return 'deleted';
    });

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    await handler({ event: { data: { accountId: 'acc-1' } }, step });

    expect(callOrder.indexOf('capture')).toBeLessThan(
      callOrder.indexOf('delete-db'),
    );
  });

  it('does NOT erase the Clerk user when the deletion was cancelled', async () => {
    // [WI-867] v2: executeDeletionV2 returning 'cancelled' — same gate.
    mockExecuteDeletionV2.mockResolvedValue('cancelled');

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    await handler({ event: { data: { accountId: 'acc-1' } }, step });

    expect(mockDeleteClerkUser).not.toHaveBeenCalled();
  });

  it('finishes Clerk erasure when the DB commit landed but its step receipt was lost', async () => {
    // The initial existence check and memoized snapshot succeeded. A later
    // `already_deleted` therefore means the irreversible DB step may have
    // committed before Inngest persisted its receipt; external cleanup must
    // resume from the snapshot instead of being skipped.
    mockExecuteDeletionV2.mockResolvedValue('already_deleted');

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    await handler({ event: { data: { accountId: 'acc-1' } }, step });

    expect(mockDeleteClerkUser).toHaveBeenCalledWith({
      userId: 'clerk_user_abc',
      clerkSecretKey: 'sk_test_step',
    });
  });

  it('skips Clerk erasure when the account has no Clerk credential', async () => {
    // [WI-867] v2: getOrganizationOwnerClerkUserIdV2 returning null — same skip.
    mockGetOrganizationOwnerClerkUserIdV2.mockResolvedValue(null);

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'acc-1' });
    expect(mockDeleteClerkUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [WI-2390] Postgres PITR can restore rows deleted by this workflow, including
// the in-DB deletion_audit row. Completion therefore needs an out-of-band proof
// after the DB and Clerk legs have both succeeded. The structured log and
// Sentry message are independent of the application database and carry only
// opaque IDs plus non-PII outcomes.
// ---------------------------------------------------------------------------
describe('[WI-2390] restore-independent completion audit proof', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockGetStepClerkSecretKey.mockReturnValue('sk_test_step');
    mockOrganizationExistsV2.mockResolvedValue(true);
    mockIsDeletionCancelledV2.mockResolvedValue(false);
    mockExecuteDeletionV2.mockResolvedValue('deleted');
    mockGetSubscriptionStoreTeardownTargetsV2.mockResolvedValue([]);
    mockGetOrganizationOwnerClerkUserIdV2.mockResolvedValue('clerk_user_abc');
    mockGetOrganizationOwnerEmailV2.mockResolvedValue('owner@example.com');
    mockDeleteClerkUser.mockResolvedValue({ deleted: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[BREAK] records completed DB + Clerk erasure outside Postgres with the Inngest run id', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureMessage')
      .mockImplementation(() => undefined);
    const consoleSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const { step, runNames } = createInngestStepRunner();

    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-audit-proof' } },
      runId: 'run-audit-proof',
      step,
    });

    expect(result).toEqual({
      status: 'deleted',
      accountId: 'acc-audit-proof',
    });
    expect(runNames()).toContain('record-deletion-completion');
    expect(captureSpy).toHaveBeenCalledWith(
      'account.deletion.completed',
      expect.objectContaining({
        level: 'info',
        tags: {
          surface: 'account.deletion.completed',
          databaseDeletion: 'deleted',
          clerkErasure: 'deleted',
          subscriptionStoreTeardown: 'not_applicable',
        },
        extra: {
          accountId: 'acc-audit-proof',
          runId: 'run-audit-proof',
        },
      }),
    );

    const completionLog = consoleSpy.mock.calls
      .map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
      .find((entry) => entry.message === 'account_deletion.completed');
    expect(completionLog).toEqual(
      expect.objectContaining({
        level: 'info',
        context: expect.objectContaining({
          event: 'account_deletion.completed',
          accountId: 'acc-audit-proof',
          runId: 'run-audit-proof',
          databaseDeletion: 'deleted',
          clerkErasure: 'deleted',
          subscriptionStoreTeardown: 'not_applicable',
        }),
      }),
    );
  });

  it('does not emit a completion proof when deletion is cancelled during grace', async () => {
    mockIsDeletionCancelledV2.mockResolvedValue(true);
    const captureSpy = jest
      .spyOn(sentry, 'captureMessage')
      .mockImplementation(() => undefined);
    const consoleSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const { step, runNames } = createInngestStepRunner();

    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-cancelled' } },
      runId: 'run-cancelled',
      step,
    });

    expect(result).toEqual({ status: 'cancelled' });
    expect(runNames()).not.toContain('record-deletion-completion');
    expect(captureSpy).not.toHaveBeenCalledWith(
      'account.deletion.completed',
      expect.anything(),
    );
    expect(
      consoleSpy.mock.calls.some(([line]) =>
        String(line).includes('account_deletion.completed'),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [INNGEST-DELETION-ONFAILURE][BREAK] GDPR Art 17 erasure-completeness guard.
//
// When all `retries` of scheduledDeletion are exhausted (e.g. a sustained
// Clerk outage so delete-clerk-user keeps throwing), the DB cascade may have
// already run while the external Clerk login identity survives. Inngest calls
// onFailure once at that point. Without an onFailure handler the only signal is
// a generic dashboard failure — the half-completed erasure is not queryable.
//
// Red→green: remove the `onFailure` handler from account-deletion.ts and the
// first test fails (opts.onFailure is undefined); the escalation assertion in
// the second test also fails because captureException is never invoked with the
// account-deletion.terminal_failure surface tag.
// ---------------------------------------------------------------------------
describe('[INNGEST-DELETION-ONFAILURE] terminal-failure escalation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('[BREAK] declares an onFailure handler', () => {
    const opts = (scheduledDeletion as any).opts;
    expect(typeof opts.onFailure).toBe('function');
  });

  it('[BREAK] escalates to Sentry with the account-deletion.terminal_failure surface and accountId', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureException')
      .mockImplementation(() => undefined);

    const onFailure = (scheduledDeletion as any).opts.onFailure as (args: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
      step: { sendEvent: (name: string, payload: unknown) => Promise<unknown> };
    }) => Promise<unknown>;
    const { step } = createInngestStepRunner();

    const clerkOutage = new Error('Clerk delete failed with status 503');
    const result = await onFailure({
      event: {
        data: {
          event: { data: { accountId: 'acc-terminal' } },
          run_id: 'run-xyz',
        },
      },
      error: clerkOutage,
      step,
    });

    expect(result).toEqual({
      status: 'terminal_failure',
      accountId: 'acc-terminal',
    });
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenCalledWith(
      clerkOutage,
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'account-deletion.terminal_failure',
          accountId: 'acc-terminal',
          runId: 'run-xyz',
        }),
      }),
    );
  });

  it('[BREAK WI-2994] durably sends a PII-minimized account deletion teardown dead-letter event', async () => {
    jest.spyOn(sentry, 'captureException').mockImplementation(() => undefined);
    const { step, sendEventCalls } = createInngestStepRunner();

    const onFailure = (scheduledDeletion as any).opts.onFailure as (args: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
      step: { sendEvent: (name: string, payload: unknown) => Promise<unknown> };
    }) => Promise<unknown>;
    const maliciousError = new Error(
      'Clerk response contained private context',
    );
    maliciousError.name = `payer alice@example.test ${'x'.repeat(160)}`;

    await onFailure({
      event: {
        data: {
          event: { data: { accountId: 'acc-terminal' } },
          run_id: 'run-xyz',
        },
      },
      error: maliciousError,
      step,
    });

    expect(sendEventCalls).toEqual([
      {
        name: 'dispatch-account-deletion-terminal-failure',
        payload: {
          id: 'deletion-terminal-failure:scheduled-account-deletion:run-xyz',
          name: 'app/account.deletion_teardown.failed',
          data: {
            accountId: 'acc-terminal',
            runId: 'run-xyz',
            errorName: 'Error',
            timestamp: expect.any(String),
          },
        },
      },
    ]);
    expect(JSON.stringify(sendEventCalls)).not.toContain('private context');
    expect(JSON.stringify(sendEventCalls)).not.toContain('alice@example.test');
  });

  it('[BREAK WI-2994] propagates durable-step rejection so Inngest can retry', async () => {
    jest.spyOn(sentry, 'captureException').mockImplementation(() => undefined);
    const transportError = new Error('event transport unavailable');
    const { step, sendEventCalls } = createInngestStepRunner({
      sendEventErrors: {
        'dispatch-account-deletion-terminal-failure': transportError,
      },
    });
    const onFailure = (scheduledDeletion as any).opts.onFailure as (args: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
      step: { sendEvent: (name: string, payload: unknown) => Promise<unknown> };
    }) => Promise<unknown>;

    await expect(
      onFailure({
        event: {
          data: {
            event: { data: { accountId: 'acc-terminal' } },
            run_id: 'run-xyz',
          },
        },
        error: new Error('terminal deletion failure'),
        step,
      }),
    ).rejects.toBe(transportError);
    expect(sendEventCalls).toHaveLength(1);
  });

  it.each([
    ['late resolution', false],
    ['late rejection', true],
  ] as const)(
    '[BREAK WI-2994] awaits %s without starting a duplicate dispatch',
    async (_label, rejects) => {
      jest
        .spyOn(sentry, 'captureException')
        .mockImplementation(() => undefined);
      let settle!: () => void;
      const pending = new Promise<void>((resolve, reject) => {
        settle = () => (rejects ? reject(new Error('late reject')) : resolve());
      });
      const sendEvent = jest.fn().mockReturnValue(pending);
      const onFailure = (scheduledDeletion as any).opts.onFailure as (args: {
        event: { data: { event?: { data?: unknown }; run_id?: string } };
        error: unknown;
        step: { sendEvent: typeof sendEvent };
      }) => Promise<unknown>;

      const result = onFailure({
        event: {
          data: {
            event: { data: { accountId: 'acc-terminal' } },
            run_id: 'run-xyz',
          },
        },
        error: new Error('terminal deletion failure'),
        step: { sendEvent },
      });
      await Promise.resolve();
      expect(sendEvent).toHaveBeenCalledTimes(1);
      settle();
      if (rejects) {
        await expect(result).rejects.toThrow('late reject');
      } else {
        await expect(result).resolves.toEqual({
          status: 'terminal_failure',
          accountId: 'acc-terminal',
        });
      }
      expect(sendEvent).toHaveBeenCalledTimes(1);
    },
  );

  it('[BREAK WI-2994] uses a stable memoization key across replay', async () => {
    jest.spyOn(sentry, 'captureException').mockImplementation(() => undefined);
    const transport = jest.fn().mockResolvedValue({ ids: ['event-1'] });
    const memoized = new Map<string, Promise<unknown>>();
    const sendEvent = jest.fn((name: string, payload: unknown) => {
      const prior = memoized.get(name);
      if (prior) return prior;
      const dispatched = transport(payload);
      memoized.set(name, dispatched);
      return dispatched;
    });
    const onFailure = (scheduledDeletion as any).opts.onFailure as (args: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
      step: { sendEvent: typeof sendEvent };
    }) => Promise<unknown>;
    const args = {
      event: {
        data: {
          event: { data: { accountId: 'acc-terminal' } },
          run_id: 'run-xyz',
        },
      },
      error: new Error('terminal deletion failure'),
      step: { sendEvent },
    };

    await onFailure(args);
    await onFailure(args);

    expect(sendEvent).toHaveBeenCalledTimes(2);
    expect(sendEvent.mock.calls[0]?.[0]).toBe(
      'dispatch-account-deletion-terminal-failure',
    );
    expect(sendEvent.mock.calls[1]?.[0]).toBe(
      'dispatch-account-deletion-terminal-failure',
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('tolerates a missing original event payload (accountId null)', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureException')
      .mockImplementation(() => undefined);

    const onFailure = (scheduledDeletion as any).opts.onFailure as (args: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
      step: { sendEvent: (name: string, payload: unknown) => Promise<unknown> };
    }) => Promise<unknown>;
    const { step } = createInngestStepRunner();

    const result = await onFailure({
      event: { data: {} },
      error: 'non-error-rejection',
      step,
    });

    expect(result).toEqual({ status: 'terminal_failure', accountId: null });
    expect(captureSpy).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'account-deletion.terminal_failure',
          accountId: null,
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// [CUT-B2] v2 dispatch + schedule-time mode pinning.
//
// Two concerns covered here:
//  1. Every step routes onto its v2 twin when v2 is active — including the
//     v2-only capture-owner-email pre-read and organizationExistsV2 existence
//     check that the legacy suites never exercise.
//  2. [CODEX P1] The identity mode is PINNED at schedule time via
//     event.data.identityVersion, NOT re-read from the live flag at execution
//     time. A flag flip during the 7-day grace period (cutover or rollback)
//     must NOT redirect the resume at the wrong store — doing so would miss the
//     active-deletion stamp and silently skip a GDPR/COPPA erasure. The
//     pinning tests flip the live flag to the OPPOSITE of the pinned version
//     and assert the run still erases against the originally-scheduled store.
//  3. [WI-1255] The legacy (v1) store no longer exists in prod — the T1
//     identity migration (0106_identity_t1_org_membership.sql) reused
//     account.id AS organization.id, and the follow-up M-DROP migration
//     dropped accounts/profiles/family_links/consent_states outright. An
//     event carrying a stale identityVersion: 'v1' pin (dispatched before the
//     legacy tables were dropped) can no longer honor that pin — the CODEX-P1
//     "pinned v1 survives via legacy executeDeletion" behavior is retired.
//     Every run now erases via v2, using the same accountId as the
//     organizationId (no identifier translation needed).
// ---------------------------------------------------------------------------
describe('[CUT-B2] v2 dispatch + schedule-time mode pinning', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    // Live flag ON: an unstamped event would fall through to v2.
    mockIsIdentityV2EnabledInStep.mockReturnValue(true);
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockGetStepClerkSecretKey.mockReturnValue('sk_test_step');
    // v2 doubles — happy path.
    mockOrganizationExistsV2.mockResolvedValue(true);
    mockIsDeletionCancelledV2.mockResolvedValue(false);
    mockExecuteDeletionV2.mockResolvedValue('deleted');
    mockGetOrganizationOwnerClerkUserIdV2.mockResolvedValue('clerk_org_owner');
    mockGetOrganizationOwnerEmailV2.mockResolvedValue('owner@example.com');
    mockGetSubscriptionStoreTeardownTargetsV2.mockResolvedValue([
      {
        subscriptionId: 'subrow-1',
        planTier: 'plus',
        status: 'active',
        stripe: {
          customerId: 'cus_123',
          subscriptionId: 'sub_123',
        },
        revenueCat: {
          originalAppUserId: 'rc_original_123',
          storeProductId: 'com.mentomate.plus.monthly',
          storePlatform: 'APP_STORE',
        },
      },
    ]);
    mockDeleteClerkUser.mockResolvedValue({ deleted: true });
  });

  it('routes every step onto its v2 twin and erases via executeDeletionV2 (flag on, no pin)', async () => {
    const { step, sendEventCalls } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'org-1' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'org-1' });
    // Every v2 step ran against the org store.
    expect(mockOrganizationExistsV2).toHaveBeenCalledWith(mockDb, 'org-1');
    expect(mockGetOrganizationOwnerClerkUserIdV2).toHaveBeenCalledWith(
      mockDb,
      'org-1',
    );
    expect(mockGetOrganizationOwnerEmailV2).toHaveBeenCalledWith(
      mockDb,
      'org-1',
    );
    expect(mockIsDeletionCancelledV2).toHaveBeenCalledWith(mockDb, 'org-1');
    expect(mockGetSubscriptionStoreTeardownTargetsV2).toHaveBeenCalledWith(
      mockDb,
      'org-1',
    );
    expect(mockExecuteDeletionV2).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        organizationId: 'org-1',
        ownerEmail: 'owner@example.com',
        reason: 'user_initiated',
        deletedBy: null,
      }),
    );
    expect(sendEventCalls).toContainEqual({
      name: 'request-subscription-store-teardown',
      payload: {
        name: 'app/billing.subscription_store_teardown_requested',
        data: {
          accountId: 'org-1',
          identityVersion: 'v2',
          reason: 'whole_org_erasure',
          requestedAt: expect.any(String),
          subscriptions: [
            {
              subscriptionId: 'subrow-1',
              planTier: 'plus',
              status: 'active',
              stripe: {
                customerId: 'cus_123',
                subscriptionId: 'sub_123',
              },
              revenueCat: {
                originalAppUserId: 'rc_original_123',
                storeProductId: 'com.mentomate.plus.monthly',
                storePlatform: 'APP_STORE',
              },
            },
          ],
        },
      },
    });
    // Clerk erasure used the v2-captured owner id.
    expect(mockDeleteClerkUser).toHaveBeenCalledWith({
      userId: 'clerk_org_owner',
      clerkSecretKey: 'sk_test_step',
    });
  });

  it('calls getStepDatabase once per v2 DB access (10 total)', async () => {
    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    await handler({ event: { data: { accountId: 'org-1' } }, step });

    expect(mockGetStepDatabase).toHaveBeenCalledTimes(10);
  });

  it('[BREAK CODEX-P1] pinned v2 survives a mid-grace-period flip to legacy — erases via executeDeletionV2', async () => {
    // Scheduled in v2 (identityVersion: 'v2'), then the flag flipped OFF
    // (rollback) before resume — live flag now returns false.
    mockIsIdentityV2EnabledInStep.mockReturnValue(false);

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'org-1', identityVersion: 'v2' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'org-1' });
    // The erasure ran against the originally-scheduled v2 store, NOT the
    // now-active legacy store. This is the GDPR/COPPA-skip guard.
    expect(mockExecuteDeletionV2).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        organizationId: 'org-1',
        ownerEmail: 'owner@example.com',
        reason: 'user_initiated',
        deletedBy: null,
      }),
    );
  });

  // [BREAK WI-1255] Prod dropped the legacy tables (accounts/profiles/
  // family_links/consent_states — see comment block above). A durably
  // pinned identityVersion: 'v1', left over from an event dispatched before
  // the drop, must no longer route to executeDeletion/accountExists — that
  // store is gone and the resume would 500. Retired the CODEX-P1
  // "pinned v1 survives via legacy" behavior in favor of always erasing via
  // v2. Red→green: before the fix, useV2 was false for identityVersion:
  // 'v1' and this asserted mockExecuteDeletionV2 was never called; the fix
  // makes it always be called.
  it('[BREAK WI-1255] pinned v1 with legacy tables dropped erases via v2, not legacy', async () => {
    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-1', identityVersion: 'v1' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'acc-1' });
    // organization.id was REUSED from account.id at the T1 migration, so the
    // same accountId already resolves the v2 entity — no translation step.
    expect(mockExecuteDeletionV2).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        organizationId: 'acc-1',
        ownerEmail: 'owner@example.com',
        reason: 'user_initiated',
        deletedBy: null,
      }),
    );
  });

  it('[BREAK WI-1255] pinned v1 whose v2 org is already gone completes as already_deleted, no error', async () => {
    // Genuine can't-resolve case: the v2 entity truly no longer exists (e.g.
    // already erased by an earlier run). Must be a clean no-op, never a 500.
    mockOrganizationExistsV2.mockResolvedValue(false);

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-gone', identityVersion: 'v1' } },
      step,
    });

    expect(result).toEqual({
      status: 'already_deleted',
      accountId: 'acc-gone',
    });
    expect(mockExecuteDeletionV2).not.toHaveBeenCalled();
  });
});
