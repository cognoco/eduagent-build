import {
  isTransientDatabaseError,
  withTransientDatabaseRetry,
} from './transient-db-retry';

jest.mock('./sentry', () => ({
  captureException: jest.fn(),
}));

const { captureException } = jest.requireMock('./sentry') as {
  captureException: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isTransientDatabaseError', () => {
  it.each([
    ['Connection terminated unexpectedly', true],
    ['Connection closed', true],
    ['socket hang up', true],
    [Object.assign(new Error('fail'), { code: 'ECONNRESET' }), true],
    [Object.assign(new Error('fail'), { code: 'ECONNREFUSED' }), true],
    [Object.assign(new Error('fail'), { code: 'ETIMEDOUT' }), true],
    [new Error('unique constraint violation'), false],
    [new Error('syntax error'), false],
    ['some random string', false],
    [null, false],
    [42, false],
  ])('classifies %p as transient=%p', (error, expected) => {
    expect(isTransientDatabaseError(error)).toBe(expected);
  });
});

describe('withTransientDatabaseRetry', () => {
  it('returns the result on first success', async () => {
    const result = await withTransientDatabaseRetry('test', () =>
      Promise.resolve('ok'),
    );
    expect(result).toBe('ok');
    expect(captureException).not.toHaveBeenCalled();
  });

  it('retries on transient error and succeeds', async () => {
    let calls = 0;
    const op = jest.fn(() => {
      calls += 1;
      if (calls === 1)
        return Promise.reject(new Error('Connection terminated'));
      return Promise.resolve('recovered');
    });

    const result = await withTransientDatabaseRetry('test_op', op);

    expect(result).toBe('recovered');
    expect(op).toHaveBeenCalledTimes(2);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          retryable: true,
          operation: 'test_op',
          attempt: 1,
        }),
      }),
    );
  });

  it('throws immediately on non-transient error', async () => {
    const nonTransient = new Error('unique constraint violation');
    const op = jest.fn(() => Promise.reject(nonTransient));

    await expect(withTransientDatabaseRetry('test', op)).rejects.toBe(
      nonTransient,
    );
    expect(op).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('throws after exhausting all retries', async () => {
    const transient = new Error('Connection terminated');
    const op = jest.fn(() => Promise.reject(transient));

    await expect(withTransientDatabaseRetry('test', op)).rejects.toBe(
      transient,
    );
    expect(op).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    expect(captureException).toHaveBeenCalledTimes(3);
  });
});
