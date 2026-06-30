import type { Database } from '@eduagent/database';

const mockExpirePendingDeepeningRows = jest.fn();
const mockGetStepDatabase = jest.fn();

jest.mock('../../services/needs-deepening/promotion', () => {
  const actual = jest.requireActual(
    '../../services/needs-deepening/promotion',
  ) as typeof import('../../services/needs-deepening/promotion');
  return {
    ...actual,
    expirePendingDeepeningRows: (...args: unknown[]) =>
      mockExpirePendingDeepeningRows(...args),
  };
});

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return { ...actual, getStepDatabase: () => mockGetStepDatabase() };
});

const { createInngestTransportCapture } =
  require('../../test-utils/inngest-transport-capture') as typeof import('../../test-utils/inngest-transport-capture');

const mockInngestTransport = createInngestTransportCapture();

jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return { ...actual, ...mockInngestTransport.module };
});

import { functions } from '../index';
import { needsDeepeningExpirePending } from './needs-deepening-expire-pending';

async function executeHandler() {
  const step = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
  const handler = (needsDeepeningExpirePending as any).fn;
  const result = await handler({ step });
  return { result, step };
}

describe('needsDeepeningExpirePending', () => {
  const db = {} as Database;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    mockGetStepDatabase.mockReturnValue(db);
    mockExpirePendingDeepeningRows.mockResolvedValue({
      expiredCount: 2,
      expiredIds: ['expired-1', 'expired-2'],
    });
  });

  it('is configured as the daily pending-review expiry cron', () => {
    expect((needsDeepeningExpirePending as any).opts.id).toBe(
      'needs-deepening-expire-pending',
    );
    expect((needsDeepeningExpirePending as any).trigger.cron).toBe('0 3 * * *');
  });

  it('is included in the exported Inngest functions array', () => {
    expect(functions).toContain(needsDeepeningExpirePending);
  });

  it('expires pending_review rows using the step database and current step time', async () => {
    jest.useFakeTimers({ now: new Date('2026-05-25T03:00:00.000Z') });
    try {
      const { result, step } = await executeHandler();

      expect(step.run).toHaveBeenCalledWith(
        'expire-pending-needs-deepening',
        expect.any(Function),
      );
      expect(mockExpirePendingDeepeningRows).toHaveBeenCalledWith(
        db,
        new Date('2026-05-25T03:00:00.000Z'),
      );
      expect(result).toEqual({
        status: 'completed',
        expiredCount: 2,
        expiredIds: ['expired-1', 'expired-2'],
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not call bare inngest.send', async () => {
    await executeHandler();

    expect(mockInngestTransport.sentEvents).toHaveLength(0);
  });

  it('returns a completed result when nothing expired', async () => {
    mockExpirePendingDeepeningRows.mockResolvedValueOnce({
      expiredCount: 0,
      expiredIds: [],
    });

    const { result } = await executeHandler();

    expect(result).toEqual({
      status: 'completed',
      expiredCount: 0,
      expiredIds: [],
    });
  });

  it('propagates errors from expirePendingDeepeningRows so Inngest can retry', async () => {
    const boom = new Error('db unavailable');
    mockExpirePendingDeepeningRows.mockRejectedValueOnce(boom);

    await expect(executeHandler()).rejects.toBe(boom);
  });
});
