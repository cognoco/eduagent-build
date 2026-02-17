import {
  scheduleDeletion,
  cancelDeletion,
  isDeletionCancelled,
  executeDeletion,
} from './deletion';

describe('scheduleDeletion', () => {
  it('returns a grace period end date 7 days in the future', async () => {
    const before = Date.now();
    const result = await scheduleDeletion('account-1');
    const after = Date.now();

    const gracePeriodEnd = new Date(result.gracePeriodEnds).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(gracePeriodEnd).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(gracePeriodEnd).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  it('returns a valid ISO 8601 date string', async () => {
    const result = await scheduleDeletion('account-1');
    expect(() => new Date(result.gracePeriodEnds)).not.toThrow();
    expect(new Date(result.gracePeriodEnds).toISOString()).toBe(
      result.gracePeriodEnds
    );
  });
});

describe('cancelDeletion', () => {
  it('resolves without error', async () => {
    await expect(cancelDeletion('account-1')).resolves.toBeUndefined();
  });
});

describe('isDeletionCancelled', () => {
  it('returns false (stub behavior)', async () => {
    const result = await isDeletionCancelled('account-1');
    expect(result).toBe(false);
  });
});

describe('executeDeletion', () => {
  it('resolves without error (idempotent stub)', async () => {
    await expect(executeDeletion('account-1')).resolves.toBeUndefined();
  });
});
