/**
 * Utility for adding timeout behaviour to TanStack Query fetch functions.
 *
 * Bug #7 / #8 fix: prevents queries from hanging forever when the API is
 * unreachable (device has internet but server doesn't respond).
 */

/** Default timeout for data-fetching queries (12 seconds). */
export const DEFAULT_QUERY_TIMEOUT_MS = 12_000;

/**
 * Learning-entry screens can hit cold Worker/DB paths plus browser CORS
 * preflight. Keep their request budget above the default so a slow shelf/book
 * read does not masquerade as offline before the learner reaches the session.
 */
export const LEARNING_ENTRY_QUERY_TIMEOUT_MS = 30_000;

export const QUERY_CANCELLED_ABORT_REASON = 'eduagent.query-cancelled';
export const QUERY_TIMEOUT_ABORT_REASON = 'eduagent.query-timeout';

const queryCancellationSignals = new WeakSet<AbortSignal>();
const queryTimeoutSignals = new WeakSet<AbortSignal>();

export function isQueryCancellationAbort(
  signal: AbortSignal | undefined,
): boolean {
  return signal !== undefined && queryCancellationSignals.has(signal);
}

export function isQueryTimeoutAbort(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && queryTimeoutSignals.has(signal);
}

/**
 * Creates an AbortSignal that fires after `ms` milliseconds.
 * Combine with TanStack Query's `signal` parameter for proper cancellation.
 */
export function createTimeoutSignal(ms: number = DEFAULT_QUERY_TIMEOUT_MS): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    queryTimeoutSignals.add(controller.signal);
    controller.abort();
  }, ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

/**
 * Combines TanStack Query's cancellation signal with a timeout signal.
 * Returns a single AbortSignal that fires if either source aborts.
 */
export function combinedSignal(
  querySignal: AbortSignal | undefined,
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS,
): { signal: AbortSignal; cleanup: () => void } {
  const combined = new AbortController();
  const { signal: timeout, cleanup: cleanupTimeout } =
    createTimeoutSignal(timeoutMs);

  const abortCombined = (source: 'query' | 'timeout'): void => {
    if (!combined.signal.aborted) {
      if (source === 'query') {
        queryCancellationSignals.add(combined.signal);
      } else {
        queryTimeoutSignals.add(combined.signal);
      }
      combined.abort();
    }
  };

  const onQueryAbort = (): void => abortCombined('query');
  const onTimeoutAbort = (): void => abortCombined('timeout');

  if (querySignal?.aborted) {
    onQueryAbort();
  } else {
    querySignal?.addEventListener('abort', onQueryAbort);
  }
  timeout.addEventListener('abort', onTimeoutAbort);

  return {
    signal: combined.signal,
    cleanup: () => {
      querySignal?.removeEventListener('abort', onQueryAbort);
      timeout.removeEventListener('abort', onTimeoutAbort);
      cleanupTimeout();
    },
  };
}
