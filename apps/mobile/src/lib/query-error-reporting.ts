import { NetworkError, RateLimitedError, UpstreamError } from './api-errors';

function isServiceUnavailableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    'code' in error &&
    'status' in error &&
    (error as { name?: unknown }).name === 'UpstreamError' &&
    (error as { code?: unknown }).code === 'SERVICE_UNAVAILABLE' &&
    (error as { status?: unknown }).status === 503
  );
}

export function shouldReportQueryErrorToSentry(error: unknown): boolean {
  // Network errors are expected when the device is offline — not actionable on
  // the client, and will spike Sentry with noise on connectivity events.
  if (error instanceof NetworkError) return false;

  // 429s are expected rate-limit responses; the server already tracks them.
  if (error instanceof RateLimitedError) return false;

  // 5xx upstream errors are already captured server-side (CR-091). Suppress
  // duplicate client-side capture to avoid double-counting.
  if (error instanceof UpstreamError && error.status >= 500) return false;

  // Shape-match fallback for cases where class identity is lost across module
  // boundaries (e.g. serialisation round-trips).
  if (isServiceUnavailableError(error)) return false;

  return true;
}
