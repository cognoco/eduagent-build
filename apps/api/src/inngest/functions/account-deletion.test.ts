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

jest.mock(
  '../helpers' /* gc1-allow: getStepDatabase/getStepClerkSecretKey wrap Inngest step-level binding acquisition; must be intercepted to inject test doubles without a real Neon connection or CF env */,
  () => ({
    getStepDatabase: () => mockGetStepDatabase(),
    getStepClerkSecretKey: () => mockGetStepClerkSecretKey(),
  }),
);

jest.mock(
  '../../services/deletion' /* gc1-allow: prevents destructive account deletion in unit tests */,
  () => ({
    accountExists: (...args: unknown[]) => mockAccountExists(...args),
    isDeletionCancelled: (...args: unknown[]) =>
      mockIsDeletionCancelled(...args),
    executeDeletion: (...args: unknown[]) => mockExecuteDeletion(...args),
    getAccountClerkUserId: (...args: unknown[]) =>
      mockGetAccountClerkUserId(...args),
  }),
);

jest.mock(
  '../../services/clerk-user' /* gc1-allow: deleteClerkUser performs a live DELETE against the Clerk Backend API (a true external boundary) — it cannot run in the unit test environment */,
  () => ({
    deleteClerkUser: (...args: unknown[]) => mockDeleteClerkUser(...args),
  }),
);

describe('scheduledDeletion', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockGetStepClerkSecretKey.mockReturnValue('sk_test_step');
    // Default: account still exists at end of grace period (happy path)
    mockAccountExists.mockResolvedValue(true);
    // Default: account carries a Clerk login id and Clerk delete succeeds.
    mockGetAccountClerkUserId.mockResolvedValue('clerk_acc-1');
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
    mockIsDeletionCancelled.mockResolvedValue(false);
    mockExecuteDeletion.mockResolvedValue('deleted');

    const handler = (scheduledDeletion as any).fn;
    await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    expect(sleepCalls).toContainEqual({ name: 'grace-period', duration: '7d' });
  });

  it('returns cancelled status when deletion was cancelled during grace period', async () => {
    const { step } = createInngestStepRunner();
    mockIsDeletionCancelled.mockResolvedValue(true);

    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    expect(result).toEqual({ status: 'cancelled' });
    expect(mockIsDeletionCancelled).toHaveBeenCalledWith(mockDb, 'acc-1');
    expect(mockExecuteDeletion).not.toHaveBeenCalled();
  });

  it('executes deletion when not cancelled', async () => {
    const { step } = createInngestStepRunner();
    mockIsDeletionCancelled.mockResolvedValue(false);
    mockExecuteDeletion.mockResolvedValue('deleted');

    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'acc-1' });
    expect(mockExecuteDeletion).toHaveBeenCalledWith(mockDb, 'acc-1');
  });

  it('calls getStepDatabase inside each step.run closure', async () => {
    const { step } = createInngestStepRunner();
    mockIsDeletionCancelled.mockResolvedValue(false);
    mockExecuteDeletion.mockResolvedValue('deleted');

    const handler = (scheduledDeletion as any).fn;
    await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    // getStepDatabase called once each for check-account-exists,
    // capture-clerk-user-id ([R1]), check-cancellation, delete-account-data
    // ([BUG-844] added the existence check). The delete-clerk-user step uses
    // getStepClerkSecretKey, not getStepDatabase, so it does not add here.
    expect(mockGetStepDatabase).toHaveBeenCalledTimes(4);
  });

  // [BREAK / BUG-844] If the account was removed during the 7-day sleep
  // (admin manual deletion, GC, restore-from-backup gone wrong), the
  // function must NOT proceed to executeDeletion — it should return
  // 'already_deleted' so on-call telemetry distinguishes it from happy-path
  // completions, and so we don't issue a no-op DELETE that misleadingly
  // reports 'deleted'.
  it('[BREAK / BUG-844] returns already_deleted without running cancellation/deletion when account is gone', async () => {
    const { step } = createInngestStepRunner();
    mockAccountExists.mockResolvedValue(false);

    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-gone' } },
      step,
    });

    expect(result).toEqual({
      status: 'already_deleted',
      accountId: 'acc-gone',
    });
    expect(mockIsDeletionCancelled).not.toHaveBeenCalled();
    expect(mockExecuteDeletion).not.toHaveBeenCalled();
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

    mockAccountExists.mockResolvedValue(false);

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
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockAccountExists.mockResolvedValue(true);
    mockIsDeletionCancelled.mockResolvedValue(false);
  });

  it('returns { status: "cancelled" } when executeDeletion atomic guard fires', async () => {
    // Simulates: user cancelled between check-cancellation and delete-account-data.
    // The atomic WHERE in executeDeletion catches it and returns 'cancelled'.
    mockExecuteDeletion.mockResolvedValue('cancelled');

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-toctou' } },
      step,
    });

    expect(result).toEqual({ status: 'cancelled', accountId: 'acc-toctou' });
  });

  it('returns { status: "deleted" } on the happy path', async () => {
    mockExecuteDeletion.mockResolvedValue('deleted');

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-happy' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'acc-happy' });
  });

  it('returns { status: "already_deleted" } when executeDeletion finds row missing', async () => {
    mockExecuteDeletion.mockResolvedValue('already_deleted');

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
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockGetStepClerkSecretKey.mockReturnValue('sk_test_step');
    mockAccountExists.mockResolvedValue(true);
    mockIsDeletionCancelled.mockResolvedValue(false);
    mockGetAccountClerkUserId.mockResolvedValue('clerk_user_abc');
    mockDeleteClerkUser.mockResolvedValue({ deleted: true });
  });

  it('[BREAK] erases the Clerk user with the captured id after a "deleted" result', async () => {
    mockExecuteDeletion.mockResolvedValue('deleted');

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
    mockGetAccountClerkUserId.mockImplementation(async () => {
      callOrder.push('capture');
      return 'clerk_user_abc';
    });
    mockExecuteDeletion.mockImplementation(async () => {
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
    mockExecuteDeletion.mockResolvedValue('cancelled');

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    await handler({ event: { data: { accountId: 'acc-1' } }, step });

    expect(mockDeleteClerkUser).not.toHaveBeenCalled();
  });

  it('does NOT erase the Clerk user when the row was already gone', async () => {
    mockExecuteDeletion.mockResolvedValue('already_deleted');

    const { step } = createInngestStepRunner();
    const handler = (scheduledDeletion as any).fn;
    await handler({ event: { data: { accountId: 'acc-1' } }, step });

    expect(mockDeleteClerkUser).not.toHaveBeenCalled();
  });

  it('skips Clerk erasure when the account has no Clerk credential', async () => {
    mockGetAccountClerkUserId.mockResolvedValue(null);
    mockExecuteDeletion.mockResolvedValue('deleted');

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
