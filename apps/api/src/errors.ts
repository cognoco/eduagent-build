import type { Context } from 'hono';
import type { TypedResponse } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import type { ErrorCode } from '@eduagent/schemas';

/**
 * [BUG-644 / P-4] Typed domain error classes are defined in
 * `@eduagent/schemas` so both API services and mobile clients can perform a
 * real `instanceof` check across the package boundary. Re-exported here so
 * the existing `import { ForbiddenError } from '../errors'` call sites in
 * `apps/api/src` continue to work without churn.
 */
export {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  UpstreamLlmError,
  VocabularyContextError,
} from '@eduagent/schemas';

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
