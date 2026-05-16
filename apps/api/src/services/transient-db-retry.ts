import { addBreadcrumb } from './sentry';

const TRANSIENT_DB_RETRY_ATTEMPTS = 3;
const TRANSIENT_DB_RETRY_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientDatabaseError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    /connection terminated/i.test(message) ||
    /connection closed/i.test(message) ||
    /timeout exceeded when trying to connect/i.test(message) ||
    /socket hang up/i.test(message)
  );
}

export async function withTransientDatabaseRetry<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= TRANSIENT_DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (
        attempt === TRANSIENT_DB_RETRY_ATTEMPTS ||
        !isTransientDatabaseError(error)
      ) {
        throw error;
      }

      addBreadcrumb(
        'Transient database error; retrying',
        'database',
        'warning',
        {
          error: error instanceof Error ? error.message : String(error),
          retryable: true,
          operation: label,
          attempt: attempt + 1,
          maxAttempts: TRANSIENT_DB_RETRY_ATTEMPTS + 1,
        },
      );
      await delay(TRANSIENT_DB_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}
