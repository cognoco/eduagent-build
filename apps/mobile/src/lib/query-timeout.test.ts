import {
  combinedSignal,
  createTimeoutSignal,
  isQueryCancellationAbort,
  isQueryTimeoutAbort,
} from './query-timeout';

describe('query timeout abort reasons', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks query-signal aborts as query cancellations', () => {
    const queryController = new AbortController();
    const { signal, cleanup } = combinedSignal(queryController.signal, 1000);

    queryController.abort();

    expect(isQueryCancellationAbort(signal)).toBe(true);
    expect(isQueryTimeoutAbort(signal)).toBe(false);
    cleanup();
  });

  it('marks timeout aborts as timeout failures', () => {
    jest.useFakeTimers();
    const { signal, cleanup } = combinedSignal(undefined, 50);

    jest.advanceTimersByTime(50);

    expect(isQueryTimeoutAbort(signal)).toBe(true);
    expect(isQueryCancellationAbort(signal)).toBe(false);
    cleanup();
  });

  it('handles an already-aborted query signal', () => {
    const queryController = new AbortController();
    queryController.abort();

    const { signal, cleanup } = combinedSignal(queryController.signal, 1000);

    expect(isQueryCancellationAbort(signal)).toBe(true);
    cleanup();
  });

  it('marks standalone timeout signals as timeout failures', () => {
    jest.useFakeTimers();
    const { signal, cleanup } = createTimeoutSignal(25);

    jest.advanceTimersByTime(25);

    expect(isQueryTimeoutAbort(signal)).toBe(true);
    cleanup();
  });
});
