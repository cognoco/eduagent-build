import { scheduledDeletion } from './account-deletion';

const mockGetStepDatabase = jest.fn();
const mockIsDeletionCancelled = jest.fn();
const mockExecuteDeletion = jest.fn();

jest.mock('../helpers', () => ({
  getStepDatabase: () => mockGetStepDatabase(),
}));

jest.mock('../../services/deletion', () => ({
  isDeletionCancelled: (...args: unknown[]) => mockIsDeletionCancelled(...args),
  executeDeletion: (...args: unknown[]) => mockExecuteDeletion(...args),
}));

function createMockStep() {
  return {
    sleep: jest.fn().mockResolvedValue(undefined),
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
}

describe('scheduledDeletion', () => {
  const mockDb = { query: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue(mockDb);
  });

  it('should be defined as an Inngest function', () => {
    expect(scheduledDeletion).toBeDefined();
  });

  it('should have the correct function id', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (scheduledDeletion as any).opts;
    expect(config.id).toBe('scheduled-account-deletion');
  });

  it('should trigger on app/account.deletion-scheduled event', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const triggers = (scheduledDeletion as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/account.deletion-scheduled' }),
      ])
    );
  });

  it('sleeps for 7-day grace period before checking cancellation', async () => {
    const step = createMockStep();
    mockIsDeletionCancelled.mockResolvedValue(false);
    mockExecuteDeletion.mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (scheduledDeletion as any).fn;
    await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    expect(step.sleep).toHaveBeenCalledWith('grace-period', '7d');
  });

  it('returns cancelled status when deletion was cancelled during grace period', async () => {
    const step = createMockStep();
    mockIsDeletionCancelled.mockResolvedValue(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const step = createMockStep();
    mockIsDeletionCancelled.mockResolvedValue(false);
    mockExecuteDeletion.mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (scheduledDeletion as any).fn;
    const result = await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    expect(result).toEqual({ status: 'deleted', accountId: 'acc-1' });
    expect(mockExecuteDeletion).toHaveBeenCalledWith(mockDb, 'acc-1');
  });

  it('calls getStepDatabase inside each step.run closure', async () => {
    const step = createMockStep();
    mockIsDeletionCancelled.mockResolvedValue(false);
    mockExecuteDeletion.mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (scheduledDeletion as any).fn;
    await handler({
      event: { data: { accountId: 'acc-1' } },
      step,
    });

    // getStepDatabase called once for check-cancellation, once for delete-account-data
    expect(mockGetStepDatabase).toHaveBeenCalledTimes(2);
  });
});
