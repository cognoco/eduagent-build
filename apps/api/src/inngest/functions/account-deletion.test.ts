import { scheduledDeletion } from './account-deletion';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockGetStepDatabase = jest.fn();
const mockAccountExists = jest.fn();
const mockIsDeletionCancelled = jest.fn();
const mockExecuteDeletion = jest.fn();

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../helpers' /* gc1-allow: getStepDatabase wraps Inngest step-level DB acquisition; must be intercepted to inject mockDb without a real Neon connection */,
  () => ({
    ...jest.requireActual('../helpers'),
    getStepDatabase: () => mockGetStepDatabase(),
  }),
);

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../../services/deletion' /* gc1-allow: prevents destructive account deletion in unit tests */,
  () => ({
    ...jest.requireActual('../../services/deletion'),
    accountExists: (...args: unknown[]) => mockAccountExists(...args),
    isDeletionCancelled: (...args: unknown[]) =>
      mockIsDeletionCancelled(...args),
    executeDeletion: (...args: unknown[]) => mockExecuteDeletion(...args),
  }),
);

describe('scheduledDeletion', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
    // Default: account still exists at end of grace period (happy path)
    mockAccountExists.mockResolvedValue(true);
  });

  it('should be defined as an Inngest function', () => {
    expect(scheduledDeletion).toBeTruthy();
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
    mockExecuteDeletion.mockResolvedValue(undefined);

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
    mockExecuteDeletion.mockResolvedValue(undefined);

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
    mockExecuteDeletion.mockResolvedValue(undefined);

    const handler = (scheduledDeletion as any).fn;
    await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    // getStepDatabase called once each for check-account-exists,
    // check-cancellation, delete-account-data ([BUG-844] adds the new step).
    expect(mockGetStepDatabase).toHaveBeenCalledTimes(3);
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
