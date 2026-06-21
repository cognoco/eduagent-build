/**
 * Typed error classes for API responses.
 *
 * Extracted into a standalone file (no React / Clerk dependencies) so that
 * `format-api-error.ts` can import them without triggering the full
 * `api-client.ts` module graph in tests.
 *
 * [BUG-644 / P-4] Shared typed error classes are sourced from
 * `@eduagent/schemas` so the API service can throw the same class that the
 * mobile client catches via `instanceof` — previously each side defined its
 * own copy and `instanceof` checks would only succeed within a single package.
 */

import {
  BadRequestError,
  ConflictError,
  ConsentRequiredError,
  ForbiddenError,
  NotFoundError,
  QuotaExceededError,
  RateLimitedError,
  ResourceGoneError,
  UnauthorizedError,
  type QuotaExceededDetails,
  type UpgradeOption,
} from '@eduagent/schemas';
import { CancelledError } from '@tanstack/react-query';
import { isQueryCancellationAbort, isQueryTimeoutAbort } from './query-timeout';

export {
  BadRequestError,
  ConflictError,
  ConsentRequiredError,
  ForbiddenError,
  NotFoundError,
  QuotaExceededError,
  RateLimitedError,
  ResourceGoneError,
  UnauthorizedError,
  type QuotaExceededDetails,
  type UpgradeOption,
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
 * [WI-901] Thrown when a request is aborted by our own timeout signal (the
 * fetch took longer than the client budget). Kept distinct from NetworkError
 * so the UI can say "took too long / try again" instead of the misleading
 * "you're offline" copy — the symptom dictation photo-review users hit when a
 * vision-LLM grading simply ran long on an online device.
 */
export class TimeoutError extends Error {
  readonly errorCode = 'TIMEOUT_ERROR' as const;
  override readonly cause: unknown;

  constructor(
    message = 'The request took too long. Please try again.',
    cause?: unknown,
  ) {
    super(message);
    this.name = 'TimeoutError';
    this.cause = cause;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

export function classifyFetchRejection(
  error: unknown,
  signal?: AbortSignal,
): Error {
  if (isAbortError(error)) {
    if (isQueryCancellationAbort(signal)) {
      return new CancelledError({ revert: true, silent: true });
    }
    // [WI-901] Our own timeout fired — not an offline/network failure.
    if (isQueryTimeoutAbort(signal)) {
      return new TimeoutError(undefined, error);
    }
  }

  return new NetworkError(undefined, error);
}

/**
 * [CR-2026-05-21-156] Wraps `globalThis.fetch` so network-layer rejections
 * (no response received — DNS failure, offline, timeout, abort, etc.) become
 * typed `NetworkError` instead of leaking raw `TypeError` strings whose
 * format depends on the React Native / Hermes version.
 *
 * Use this from any code path that calls `fetch` directly OUTSIDE of
 * `api-client.ts`'s `customFetch` wrapper (e.g. health checks, OCR upload,
 * non-RPC endpoints). `customFetch` handles its own NetworkError wrapping
 * inside its closure.
 */
export async function fetchOrThrowNetworkError(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await globalThis.fetch(input, init);
  } catch (err) {
    throw classifyFetchRejection(err, init?.signal);
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
