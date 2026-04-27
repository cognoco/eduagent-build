/**
 * Typed error classes for API responses.
 *
 * Extracted into a standalone file (no React / Clerk dependencies) so that
 * `format-api-error.ts` can import them without triggering the full
 * `api-client.ts` module graph in tests.
 *
 * [BUG-644 / P-4] `ForbiddenError` is now sourced from `@eduagent/schemas`
 * so the API service can throw the same class that the mobile client
 * catches via `instanceof` — previously each side defined its own copy and
 * `instanceof` checks would only succeed within a single package.
 */

import type { QuotaExceeded } from '@eduagent/schemas';
import { ForbiddenError } from '@eduagent/schemas';

export type QuotaExceededDetails = QuotaExceeded['details'];
export type UpgradeOption = QuotaExceededDetails['upgradeOptions'][number];

export class QuotaExceededError extends Error {
  readonly code = 'QUOTA_EXCEEDED' as const;
  readonly details: QuotaExceededDetails;

  constructor(message: string, details: QuotaExceededDetails) {
    super(message);
    this.name = 'QuotaExceededError';
    this.details = details;
  }
}

export { ForbiddenError };

/**
 * [F-Q-01] Typed error for 5xx upstream responses.
 * Thrown by customFetch so callers can read `.code` and `.status` instead of
 * parsing raw JSON from Error.message.
 */
export class UpstreamError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status = 500) {
    super(message);
    this.name = 'UpstreamError';
    this.code = code;
    this.status = status;
  }
}
