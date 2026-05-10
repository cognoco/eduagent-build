/**
 * Utility for adding timeout behaviour to TanStack Query fetch functions.
 *
 * Bug #7 / #8 fix: prevents queries from hanging forever when the API is
 * unreachable (device has internet but server doesn't respond).
 */

/** Default timeout for data-fetching queries (10 seconds). */
export const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

/**
 * Creates an AbortSignal that fires after `ms` milliseconds.
 * Combine with TanStack Query's `signal` parameter for proper cancellation.
 */
export function createTimeoutSignal(ms: number = DEFAULT_QUERY_TIMEOUT_MS): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
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

  const onAbort = (): void => combined.abort();
  querySignal?.addEventListener('abort', onAbort);
  timeout.addEventListener('abort', onAbort);

  return {
    signal: combined.signal,
    cleanup: () => {
      querySignal?.removeEventListener('abort', onAbort);
      timeout.removeEventListener('abort', onAbort);
      cleanupTimeout();
    },
  };
}
