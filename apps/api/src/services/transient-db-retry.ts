import { addBreadcrumb, captureException } from './sentry';

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

/**
 * Options for withTransientDatabaseRetry.
 *
 * `idempotent` MUST be `true`. This is a required opt-in that forces callers
 * to explicitly confirm the operation is safe to run more than once. Operations
 * that are NOT idempotent (e.g. pure INSERT, fetch-then-decrement composites)
 * must NOT be passed here — a retried transient error would replay the side
 * effect. Use idempotent patterns (INSERT … ON CONFLICT DO UPDATE, read-only
 * SELECTs, or SELECT-then-conditional-upsert inside a transaction) at the call
 * site, then pass `{ idempotent: true }`.
 */
export interface TransientRetryOptions {
  /**
   * Must be explicitly set to `true`. Callers that cannot guarantee
   * idempotency must NOT use this wrapper.
   */
  idempotent: true;
}

export async function withTransientDatabaseRetry<T>(
  label: string,
  operation: () => Promise<T>,
  options: TransientRetryOptions,
): Promise<T> {
  // The options parameter is intentionally used as a compile-time and
  // runtime contract. The `idempotent: true` constraint is enforced by the
  // TypeScript type — only `{ idempotent: true }` satisfies it. At runtime we
  // assert the value to catch callers that bypass TypeScript (e.g. plain JS or
  // a type cast).
  if (options.idempotent !== true) {
    throw new Error(
      `withTransientDatabaseRetry called for '${label}' without idempotent:true. ` +
        'Only idempotent operations (upserts, read-only queries) may be retried. ' +
        'See TransientRetryOptions for the contract.',
    );
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= TRANSIENT_DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retriesExhausted = attempt === TRANSIENT_DB_RETRY_ATTEMPTS;
      if (retriesExhausted || !isTransientDatabaseError(error)) {
        if (retriesExhausted && isTransientDatabaseError(error)) {
          // [#887] Retries exhausted on a still-transient error. The per-retry
          // breadcrumbs only attach to a later captured event; if the caller
          // swallows this throw the terminal DB failure is invisible. Capture
          // it here so the exhausted-retry case always reaches Sentry.
          captureException(error, {
            tags: { surface: 'transient-db-retry', operation: label },
            extra: { attempts: TRANSIENT_DB_RETRY_ATTEMPTS + 1 },
          });
        }
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
