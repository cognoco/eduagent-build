import { z } from 'zod';

/**
 * Shared typed error class hierarchy.
 *
 * [BUG-644 / P-4] These classes were originally defined in
 * `apps/api/src/errors.ts` alongside the Hono-specific response helpers,
 * which meant the mobile app could not `import { ForbiddenError } from
 * '@eduagent/schemas'` for an `instanceof` check — it had to maintain a
 * parallel error class with the same name in `apps/mobile/src/lib/api-errors.ts`.
 * Two parallel classes mean two `instanceof` checks fail silently across
 * the package boundary.
 *
 * Hosting these here in the schemas package (which has zero framework
 * dependencies) lets API services THROW them and mobile code CATCH them
 * with a real `instanceof` match. The Hono-specific helpers (apiError,
 * notFound, etc.) stay in apps/api/src/errors.ts because they need
 * `Context` from Hono.
 */
export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  /** Generic 403 marker — stable for code-side detection regardless of message. */
  readonly code = 'FORBIDDEN' as const;
  /** Server-side application code (e.g. SUBJECT_INACTIVE) when distinct from the generic FORBIDDEN code. */
  readonly apiCode: string | undefined;

  constructor(message = 'Insufficient permissions', apiCode?: string) {
    super(message);
    this.name = 'ForbiddenError';
    this.apiCode = apiCode;
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class UpstreamLlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamLlmError';
  }
}

export class VocabularyContextError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VocabularyContextError';
  }
}

export class SubjectNotFoundError extends Error {
  constructor() {
    super('Subject not found');
    this.name = 'SubjectNotFoundError';
  }
}

export class VocabularyNotFoundError extends Error {
  constructor() {
    super('Vocabulary item not found');
    this.name = 'VocabularyNotFoundError';
  }
}

export class TopicNotSkippedError extends Error {
  constructor() {
    super('Topic is not skipped');
    this.name = 'TopicNotSkippedError';
  }
}

// Common error codes — single source of truth
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  EXCHANGE_LIMIT_EXCEEDED: 'EXCHANGE_LIMIT_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  CONSENT_PENDING: 'CONSENT_PENDING',
  CONSENT_WITHDRAWN: 'CONSENT_WITHDRAWN',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
  MISSING_SIGNATURE: 'MISSING_SIGNATURE',
  STALE_EVENT: 'STALE_EVENT',
  SUBJECT_INACTIVE: 'SUBJECT_INACTIVE',
  CONFLICT: 'CONFLICT',
  GONE: 'GONE',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  ENV_VALIDATION_ERROR: 'ENV_VALIDATION_ERROR',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  // Subset of UPSTREAM_ERROR specifically for LLM provider outages so the
  // mobile error classifier can offer "try again" copy instead of the
  // generic upstream-failure messaging. [BUG-832 / F-API-03]
  LLM_UNAVAILABLE: 'LLM_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  PROFILE_LIMIT_EXCEEDED: 'PROFILE_LIMIT_EXCEEDED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const errorCodeValues = Object.values(ERROR_CODES) as [
  ErrorCode,
  ...ErrorCode[]
];
export const errorCodeSchema = z.enum(errorCodeValues);

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
