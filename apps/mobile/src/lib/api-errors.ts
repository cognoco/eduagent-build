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
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ResourceGoneError,
} from '@eduagent/schemas';

export type QuotaExceededDetails = QuotaExceeded['details'];
export type UpgradeOption = QuotaExceededDetails['upgradeOptions'][number];

export class QuotaExceededError extends Error {
  readonly code = 'QUOTA_EXCEEDED' as const;
  readonly errorCode = 'QUOTA_EXCEEDED' as const;
  readonly details: QuotaExceededDetails;

  constructor(message: string, details: QuotaExceededDetails) {
    super(message);
    this.name = 'QuotaExceededError';
    this.details = details;
  }
}

export {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ResourceGoneError,
};

/**
 * Thrown when `fetch` itself rejects (no HTTP response received).
 * Distinguishes network-layer failures from API-layer errors.
 */
export class NetworkError extends Error {
  readonly errorCode = 'NETWORK_ERROR' as const;
  override readonly cause: unknown;

  constructor(
    message = "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
    cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * [F-Q-01] Typed error for 5xx upstream responses.
 * Thrown by customFetch so callers can read `.code` and `.status` instead of
 * parsing raw JSON from Error.message.
 */
export class UpstreamError extends Error {
  readonly errorCode = 'UPSTREAM_ERROR' as const;
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status = 500) {
    super(message);
    this.name = 'UpstreamError';
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, UpstreamError.prototype);
  }
}
