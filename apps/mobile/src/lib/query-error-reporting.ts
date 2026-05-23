import { NetworkError, RateLimitedError } from './api-errors';

function isTransientServiceUnavailableLike(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    code?: unknown;
    name?: unknown;
    status?: unknown;
  };
  return (
    candidate.name === 'UpstreamError' &&
    typeof candidate.status === 'number' &&
    candidate.status === 503 &&
    candidate.code === 'SERVICE_UNAVAILABLE'
  );
}

export function shouldReportQueryErrorToSentry(error: unknown): boolean {
  // Network errors are expected when the device is offline — not actionable on
  // the client, and will spike Sentry with noise on connectivity events.
  if (error instanceof NetworkError) return false;

  // 429s are expected rate-limit responses; the server already tracks them.
  if (error instanceof RateLimitedError) return false;

  // Suppress the known transient 503 class that the server captures and users
  // recover from by retrying. Keep reporting other 5xx responses from the
  // client so Sentry preserves screen/device context.
  if (isTransientServiceUnavailableLike(error)) return false;

  return true;
}
