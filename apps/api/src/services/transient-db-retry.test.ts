import {
  isTransientDatabaseError,
  withTransientDatabaseRetry,
} from './transient-db-retry';

// [#887/GC6] Mock the external Sentry boundary (@sentry/cloudflare), NOT our
// internal ./sentry wrapper, so the real addBreadcrumb/captureException
// forwarding runs and is exercised by these tests.
jest.mock('@sentry/cloudflare', () => ({
  withScope: (fn: (scope: unknown) => void) =>
    fn({ setUser: jest.fn(), setTag: jest.fn(), setExtra: jest.fn() }),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

import * as CfSentry from '@sentry/cloudflare';

const addBreadcrumb = CfSentry.addBreadcrumb as jest.Mock;
const captureException = CfSentry.captureException as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isTransientDatabaseError', () => {
  it.each([
    ['Connection terminated unexpectedly', true],
    ['Connection closed', true],
    ['timeout exceeded when trying to connect', true],
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
    const result = await withTransientDatabaseRetry(
      'test',
      () => Promise.resolve('ok'),
      { idempotent: true },
    );
    expect(result).toBe('ok');
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('retries on transient error and succeeds', async () => {
    let calls = 0;
    const op = jest.fn(() => {
      calls += 1;
      if (calls === 1)
        return Promise.reject(new Error('Connection terminated'));
      return Promise.resolve('recovered');
    });

    const result = await withTransientDatabaseRetry('test_op', op, {
      idempotent: true,
    });

    expect(result).toBe('recovered');
    expect(op).toHaveBeenCalledTimes(2);
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).toHaveBeenCalledWith({
      message: 'Transient database error; retrying',
      category: 'database',
      level: 'warning',
      data: expect.objectContaining({
        retryable: true,
        operation: 'test_op',
        attempt: 1,
      }),
    });
    // Recovered before exhausting retries — no terminal capture.
    expect(captureException).not.toHaveBeenCalled();
  });

  it('throws immediately on non-transient error', async () => {
    const nonTransient = new Error('unique constraint violation');
    const op = jest.fn(() => Promise.reject(nonTransient));

    await expect(
      withTransientDatabaseRetry('test', op, { idempotent: true }),
    ).rejects.toBe(nonTransient);
    expect(op).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).not.toHaveBeenCalled();
    // Non-transient errors are the caller's to classify — not captured here.
    expect(captureException).not.toHaveBeenCalled();
  });

  it('throws after exhausting all retries', async () => {
    const transient = new Error('Connection terminated');
    const op = jest.fn(() => Promise.reject(transient));

    await expect(
      withTransientDatabaseRetry('test', op, { idempotent: true }),
    ).rejects.toBe(transient);
    expect(op).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    expect(addBreadcrumb).toHaveBeenCalledTimes(3);
  });

  // [#887] The exhausted-retries terminal failure must reach Sentry directly,
  // because the per-retry breadcrumbs only attach to a later captured event
  // and a caller may swallow this throw.
  //
  // Red-green proof: remove the `captureException(...)` block in
  // transient-db-retry.ts and this assertion fails (0 calls).
  it('[#887] captures the terminal failure once when retries are exhausted on a transient error', async () => {
    const transient = new Error('Connection terminated');
    const op = jest.fn(() => Promise.reject(transient));

    await expect(
      withTransientDatabaseRetry('exhaustion_op', op, { idempotent: true }),
    ).rejects.toBe(transient);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(transient);
  });

  // [BUG-495] Break test: idempotency contract enforcement.
  //
  // Red-green proof:
  //   RED  — before fix: withTransientDatabaseRetry had no `options` param and
  //          would silently retry any operation without verifying idempotency.
  //          This test did not exist; non-idempotent callers were never caught.
  //   GREEN — after fix: the function requires `{ idempotent: true }` and throws
  //           at runtime if it receives a value that bypasses TypeScript (e.g. a
  //           plain-JS caller or a type cast). This test proves the guard fires.
  //
  // To verify RED manually: remove the `if (options.idempotent !== true)` block
  // in transient-db-retry.ts — this test will fail immediately.
  describe('idempotency contract', () => {
    it('throws synchronously when idempotent flag is bypassed at runtime', async () => {
      // Simulate a plain-JS or cast caller that omits the required flag.
      const sneakyOptions = { idempotent: false } as unknown as {
        idempotent: true;
      };

      await expect(
        withTransientDatabaseRetry(
          'non-idempotent-op',
          () => Promise.resolve('side-effect'),
          sneakyOptions,
        ),
      ).rejects.toThrow(
        "withTransientDatabaseRetry called for 'non-idempotent-op' without idempotent:true",
      );
    });

    it('does NOT call the operation when the idempotency contract is violated', async () => {
      const op = jest.fn(() => Promise.resolve('should-not-run'));
      const sneakyOptions = { idempotent: false } as unknown as {
        idempotent: true;
      };

      await expect(
        withTransientDatabaseRetry('guarded-op', op, sneakyOptions),
      ).rejects.toThrow();

      // The operation must not have been called — the guard fires before the loop.
      expect(op).not.toHaveBeenCalled();
    });
  });
});
