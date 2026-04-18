import type { Context } from 'hono';
import type { TypedResponse } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import type { ErrorCode } from '@eduagent/schemas';

/**
 * Typed domain error for "not found" cases.
 * Route handlers can catch `instanceof NotFoundError` instead of matching
 * fragile error-message strings.
 */
export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

/**
 * Typed domain error for authorization failures.
 * Thrown by services when a caller lacks permission to read or mutate a
 * resource — notably parent → child access checks in the dashboard service.
 *
 * [EP15-I5] Introduced to replace the anti-pattern where services returned
 * `null`/`[]` on `hasParentAccess === false`, which masked IDOR denials as
 * empty-state responses (HTTP 200 with empty body) instead of 403s. Empty
 * state is semantically indistinguishable from "no children" — a real
 * security issue if automation probes endpoints by iterating IDs.
 *
 * The central `app.onError` handler converts this to a 403 response so
 * individual route handlers don't need per-endpoint try/catch blocks.
 */
export class ForbiddenError extends Error {
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Typed domain error for concurrent/out-of-order mutations.
 * Thrown when a resource is not in the expected state (e.g. attempting to
 * complete a round that is already completed, or a race lost the UPDATE).
 * The central `app.onError` handler converts this to a 409 response.
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Typed domain error for unrecoverable upstream LLM failures (invalid JSON,
 * schema drift, no valid candidates after cross-checking). The central
 * `app.onError` handler converts this to a 502 Bad Gateway response.
 * Unlike generic internal errors, these are surfaced to Sentry at the throw
 * site so we can track LLM-provider drift over time.
 */
export class UpstreamLlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamLlmError';
  }
}

/**
 * Typed domain error for invalid vocabulary round context. Thrown when the
 * caller provides a missing or invalid subjectId, or the subject is not a
 * language subject. The route layer catches this to return a 400 instead of
 * letting it bubble as a 500.
 */
export class VocabularyContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VocabularyContextError';
  }
}

export function apiError(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500 | 501 | 502 | 503,
  code: ErrorCode,
  message: string,
  details?: unknown
): Response & TypedResponse {
  return c.json(
    { code, message, ...(details !== undefined && { details }) },
    status
  );
}

export function notFound(
  c: Context,
  message = 'Resource not found'
): Response & TypedResponse {
  return apiError(c, 404, ERROR_CODES.NOT_FOUND, message);
}

export function unauthorized(
  c: Context,
  message = 'Authentication required'
): Response & TypedResponse {
  return apiError(c, 401, ERROR_CODES.UNAUTHORIZED, message);
}

export function forbidden(
  c: Context,
  message = 'Insufficient permissions'
): Response & TypedResponse {
  return apiError(c, 403, ERROR_CODES.FORBIDDEN, message);
}

export function validationError(
  c: Context,
  details: unknown
): Response & TypedResponse {
  return apiError(
    c,
    400,
    ERROR_CODES.VALIDATION_ERROR,
    'Validation failed',
    details
  );
}
