/**
 * Typed error classes for API responses.
 *
 * Extracted into a standalone file (no React / Clerk dependencies) so that
 * `format-api-error.ts` can import them without triggering the full
 * `api-client.ts` module graph in tests.
 */

import type { QuotaExceeded } from '@eduagent/schemas';

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

/**
 * [EP15-I5] Typed error for 403 responses.
 * Thrown by customFetch so callers can `instanceof ForbiddenError` instead
 * of parsing status codes from generic Error message strings.
 *
 * [BUG-100] `apiCode` preserves the server's application-level error code
 * (e.g. 'SUBJECT_INACTIVE') so downstream classifiers like `errorHasCode`
 * can distinguish specific 403 reasons without string-matching the message.
 */
export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN' as const;
  readonly apiCode: string | undefined;

  constructor(
    message = 'You do not have permission to access this resource',
    apiCode?: string
  ) {
    super(message);
    this.name = 'ForbiddenError';
    this.apiCode = apiCode;
  }
}

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
