import { scheduledDeletion } from './account-deletion';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import * as sentry from '../../services/sentry';

const mockGetStepDatabase = jest.fn();
const mockGetStepClerkSecretKey = jest.fn();
const mockAccountExists = jest.fn();
const mockIsDeletionCancelled = jest.fn();
const mockExecuteDeletion = jest.fn();
const mockGetAccountClerkUserId = jest.fn();
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
      getOrganizationOwnerClerkUserIdV2: (...args: unknown[]) =>
        mockGetOrganizationOwnerClerkUserIdV2(...args),
      getOrganizationOwnerEmailV2: (...args: unknown[]) =>
        mockGetOrganizationOwnerEmailV2(...args),
      getSubscriptionStoreTeardownTargetsV2: (...args: unknown[]) =>
        mockGetSubscriptionStoreTeardownTargetsV2(...args),
    };
  },
);

jest.mock(
  '../../services/deletion' /* gc1-allow: prevents destructive account deletion in unit tests */,
  () => {
    const actual = jest.requireActual(
      '../../services/deletion',
    ) as typeof import('../../services/deletion');
    return {
      ...actual,
      accountExists: (...args: unknown[]) => mockAccountExists(...args),
      isDeletionCancelled: (...args: unknown[]) =>
        mockIsDeletionCancelled(...args),
      executeDeletion: (...args: unknown[]) => mockExecuteDeletion(...args),
      getAccountClerkUserId: (...args: unknown[]) =>
        mockGetAccountClerkUserId(...args),
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
    expect(mockExecuteDeletionV2).toHaveBeenCalledWith(mockDb, {
      organizationId: 'acc-1',
      ownerEmail: 'owner@example.com',
      reason: 'user_initiated',
      deletedBy: null,
    });
  });

  it('calls getStepDatabase inside each step.run closure', async () => {
    const { step } = createInngestStepRunner();
    // [WI-867] v2 mocks set in beforeEach.

    const handler = (scheduledDeletion as any).fn;
    await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    // [WI-867] v2 adds capture-owner-email step (pre-reads owner email for
    // executeDeletionV2). v1 short-circuited that step before acquiring a DB
    // connection, so count was 4. v2 path: check-account-exists,
    // capture-clerk-user-id, capture-owner-email, check-cancellation,
    // capture-subscription-store-teardown-targets, delete-account-data = 6.
    // delete-clerk-user uses getStepClerkSecretKey.
    expect(mockGetStepDatabase).toHaveBeenCalledTimes(6);
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

  it('does NOT erase the Clerk user when the row was already gone', async () => {
    // [WI-867] v2: executeDeletionV2 returning 'already_deleted' — same gate.
    mockExecuteDeletionV2.mockResolvedValue('already_deleted');

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    await handler({ event: { data: { accountId: 'acc-1' } }, step });

    expect(mockDeleteClerkUser).not.toHaveBeenCalled();
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
    }) => Promise<unknown>;

    const clerkOutage = new Error('Clerk delete failed with status 503');
    const result = await onFailure({
      event: {
        data: {
          event: { data: { accountId: 'acc-terminal' } },
          run_id: 'run-xyz',
        },
      },
      error: clerkOutage,
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

  it('tolerates a missing original event payload (accountId null)', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureException')
      .mockImplementation(() => undefined);

    const onFailure = (scheduledDeletion as any).opts.onFailure as (args: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
    }) => Promise<unknown>;

    const result = await onFailure({
      event: { data: {} },
      error: 'non-error-rejection',
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
// ---------------------------------------------------------------------------
describe('[CUT-B2] v2 dispatch + schedule-time mode pinning', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    // Live flag ON: an unstamped event would fall through to v2.
    mockIsIdentityV2EnabledInStep.mockReturnValue(true);
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockGetStepClerkSecretKey.mockReturnValue('sk_test_step');
    // v1 doubles must never be reached on the v2 path; give them values that
    // would pass so an accidental v1 call is caught by the explicit
    // not-toHaveBeenCalled assertions rather than by an incidental throw.
    mockAccountExists.mockResolvedValue(true);
    mockIsDeletionCancelled.mockResolvedValue(false);
    mockExecuteDeletion.mockResolvedValue('deleted');
    mockGetAccountClerkUserId.mockResolvedValue('clerk_v1_should_not_be_used');
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
    expect(mockExecuteDeletionV2).toHaveBeenCalledWith(mockDb, {
      organizationId: 'org-1',
      ownerEmail: 'owner@example.com',
      reason: 'user_initiated',
      deletedBy: null,
    });
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
    // No legacy step touched.
    expect(mockAccountExists).not.toHaveBeenCalled();
    expect(mockExecuteDeletion).not.toHaveBeenCalled();
    expect(mockGetAccountClerkUserId).not.toHaveBeenCalled();
  });

  it('calls getStepDatabase once per v2 DB step (6 total)', async () => {
    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    await handler({ event: { data: { accountId: 'org-1' } }, step });

    // check-account-exists, capture-clerk-user-id, capture-owner-email,
    // check-cancellation, capture-subscription-store-teardown-targets,
    // delete-account-data — delete-clerk-user uses getStepClerkSecretKey,
    // not getStepDatabase.
    expect(mockGetStepDatabase).toHaveBeenCalledTimes(6);
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
    expect(mockExecuteDeletionV2).toHaveBeenCalledWith(mockDb, {
      organizationId: 'org-1',
      ownerEmail: 'owner@example.com',
      reason: 'user_initiated',
      deletedBy: null,
    });
    expect(mockExecuteDeletion).not.toHaveBeenCalled();
    expect(mockAccountExists).not.toHaveBeenCalled();
  });

  it('[BREAK CODEX-P1] pinned v1 survives a mid-grace-period flip to v2 — erases via executeDeletion', async () => {
    // Scheduled in legacy (identityVersion: 'v1'), then the flag flipped ON
    // (cutover) before resume — live flag now returns true.
    mockIsIdentityV2EnabledInStep.mockReturnValue(true);

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-1', identityVersion: 'v1' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'acc-1' });
    // The erasure ran against the originally-scheduled legacy store, NOT the
    // now-active v2 store.
    expect(mockExecuteDeletion).toHaveBeenCalledWith(mockDb, 'acc-1');
    expect(mockExecuteDeletionV2).not.toHaveBeenCalled();
    expect(mockOrganizationExistsV2).not.toHaveBeenCalled();
  });
});
