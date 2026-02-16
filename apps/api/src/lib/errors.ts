import type { Context } from 'hono';
import type { TypedResponse } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';

export function apiError(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: unknown
): Response & TypedResponse {
  return c.json(
    { code, message, ...(details !== undefined && { details }) },
    status as never
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
