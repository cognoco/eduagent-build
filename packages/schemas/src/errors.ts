import { z } from 'zod';
import type { QuotaExceeded } from './billing';
// [SC-05] isoDateField — canonical date field for neon-serverless compat (BUG-205).
import { isoDateField } from './common';

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
  readonly errorCode = 'NOT_FOUND' as const;
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ForbiddenError extends Error {
  readonly errorCode = 'FORBIDDEN' as const;
  /** Server-side application code (e.g. SUBJECT_INACTIVE) when distinct from the generic FORBIDDEN code. */
  readonly apiCode: string | undefined;

  constructor(message = 'Insufficient permissions', apiCode?: string) {
    super(message);
    this.name = 'ForbiddenError';
    this.apiCode = apiCode;
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * [BUG-694] Typed error for 401 responses thrown by the API-client boundary.
 *
 * Previously the mobile client threw a bare `Error('Session expired — signing
 * out')` / `Error('Auth token not ready')` on 401, which discarded the HTTP
 * status, the server-supplied `code` (e.g. `UNAUTHORIZED`), and the raw
 * response body. Per the UX Resilience Rules ("Classify errors at the API
 * client boundary, not per-screen"), 401s should be a typed class carrying
 * the structured signal so callers (logging, format-api-error, retry logic)
 * never need to string-match the message.
 *
 * Note: 401 with `code === 'EMAIL_NOT_AVAILABLE' | 'EMAIL_NOT_VERIFIED'`
 * still throws `ForbiddenError` (existing contract / [BUG-1016]) — those
 * are account-verification states, not session-expiry, and screens already
 * branch on `ForbiddenError.apiCode`. `UnauthorizedError` covers the
 * remaining 401 surfaces: expired token, no token yet, generic UNAUTHORIZED.
 */
export class UnauthorizedError extends Error {
  readonly errorCode = 'UNAUTHORIZED' as const;
  readonly status = 401 as const;
  /** Server-supplied error code from the response body (e.g. `UNAUTHORIZED`) when present. */
  readonly apiCode: string | undefined;
  /**
   * Distinguishes the two 401 sub-cases the client cares about:
   *  - `'session-expired'`: a token WAS sent and the server rejected it →
   *    the auth-expired callback fires and the user is signed out.
   *  - `'token-not-ready'`: no token was attached (Clerk hadn't minted a JWT
   *    yet after setActive) → the caller (e.g. TanStack Query) should retry.
   */
  readonly reason: 'session-expired' | 'token-not-ready';
  /** Raw response body (text). Empty string when the server sent no body. */
  readonly responseBody: string;

  constructor(
    reason: 'session-expired' | 'token-not-ready',
    options: {
      message?: string;
      apiCode?: string;
      responseBody?: string;
    } = {},
  ) {
    const message =
      options.message ??
      (reason === 'session-expired'
        ? 'Session expired — signing out'
        : 'Auth token not ready');
    super(message);
    this.name = 'UnauthorizedError';
    this.reason = reason;
    this.apiCode = options.apiCode;
    this.responseBody = options.responseBody ?? '';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export const CONFLICT_ERROR_NAME = 'ConflictError' as const;
export class ConflictError extends Error {
  readonly errorCode = 'CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = CONFLICT_ERROR_NAME;
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export const RATE_LIMITED_ERROR_NAME = 'RateLimitedError' as const;
export class RateLimitedError extends Error {
  readonly errorCode = 'RATE_LIMITED' as const;
  readonly code: string | undefined;
  /** Seconds until the client may retry, usually from a Retry-After header. */
  readonly retryAfter: number | undefined;

  constructor(
    message = "You've hit the limit. Wait a moment and try again.",
    code?: string,
    _details?: unknown,
    retryAfter?: number,
  ) {
    super(message);
    this.name = RATE_LIMITED_ERROR_NAME;
    this.code = code;
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitedError.prototype);
  }
}

export const CONSENT_REQUIRED_ERROR_NAME = 'ConsentRequiredError' as const;
export class ConsentRequiredError extends Error {
  readonly errorCode = 'CONSENT_REQUIRED' as const;
  readonly code: string | undefined;

  constructor(
    message = 'Consent is required before this action is available.',
    code?: string,
  ) {
    super(message);
    this.name = CONSENT_REQUIRED_ERROR_NAME;
    this.code = code;
    Object.setPrototypeOf(this, ConsentRequiredError.prototype);
  }
}

export class UpstreamLlmError extends Error {
  readonly errorCode = 'UPSTREAM_LLM_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamLlmError';
    Object.setPrototypeOf(this, UpstreamLlmError.prototype);
  }
}

export class SafetyFilterError extends Error {
  readonly errorCode = 'SAFETY_FILTER' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SafetyFilterError';
    Object.setPrototypeOf(this, SafetyFilterError.prototype);
  }
}

export class VocabularyContextError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VocabularyContextError';
    Object.setPrototypeOf(this, VocabularyContextError.prototype);
  }
}

export class SubjectNotFoundError extends Error {
  constructor() {
    super('Subject not found');
    this.name = 'SubjectNotFoundError';
    Object.setPrototypeOf(this, SubjectNotFoundError.prototype);
  }
}

export class VocabularyNotFoundError extends Error {
  constructor() {
    super('Vocabulary item not found');
    this.name = 'VocabularyNotFoundError';
    Object.setPrototypeOf(this, VocabularyNotFoundError.prototype);
  }
}

export class TopicNotSkippedError extends Error {
  constructor() {
    super('Topic is not skipped');
    this.name = 'TopicNotSkippedError';
    Object.setPrototypeOf(this, TopicNotSkippedError.prototype);
  }
}

export class BadRequestError extends Error {
  readonly errorCode = 'BAD_REQUEST' as const;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

/**
 * [WI-150 / WI-206] Dictation review request exceeded a payload-size cap
 * (sentence count, per-sentence length, or total prompt char budget).
 * Maps to HTTP 413 Payload Too Large at the route boundary.
 *
 * Lives in `@eduagent/schemas` so the service layer can throw it without
 * importing apps/api (defense-in-depth check after the route guard).
 */
export class DictationPayloadTooLargeError extends Error {
  readonly errorCode = 'PAYLOAD_TOO_LARGE' as const;
  readonly limit: number;
  readonly actual: number;

  constructor(message: string, limit: number, actual: number) {
    super(message);
    this.name = 'DictationPayloadTooLargeError';
    this.limit = limit;
    this.actual = actual;
    Object.setPrototypeOf(this, DictationPayloadTooLargeError.prototype);
  }
}

/**
 * [CCR PR #215] Schema-drift fault: a DB row exists but does not validate
 * against its expected zod schema. This is a server-side fault (data shape
 * has drifted from code) — NOT a missing row. The global error handler maps
 * this to HTTP 500 and reports to Sentry, while genuine missing-row cases
 * remain `NotFoundError` → 404 (no Sentry capture).
 *
 * Callers should:
 *   1. `captureException` with the offending row's primary key + zod issues
 *   2. throw `new SchemaDriftError(resource, issues)` so the handler classifies
 */
export class SchemaDriftError extends Error {
  readonly errorCode = 'SCHEMA_DRIFT' as const;
  readonly resource: string;
  readonly issues: unknown;

  constructor(resource: string, issues?: unknown) {
    super(`${resource} schema validation failed`);
    this.name = 'SchemaDriftError';
    this.resource = resource;
    this.issues = issues;
    Object.setPrototypeOf(this, SchemaDriftError.prototype);
  }
}

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
    Object.setPrototypeOf(this, QuotaExceededError.prototype);
  }
}

export class ResourceGoneError extends Error {
  readonly errorCode = 'RESOURCE_GONE' as const;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(
    message = 'This resource is no longer available.',
    code?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ResourceGoneError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ResourceGoneError.prototype);
  }
}

export class LlmStreamError extends Error {
  readonly errorCode = 'LLM_STREAM_ERROR' as const;
  constructor(
    message: string,
    public override cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmStreamError';
    Object.setPrototypeOf(this, LlmStreamError.prototype);
  }
}

export class LlmEnvelopeError extends Error {
  readonly errorCode = 'LLM_ENVELOPE_ERROR' as const;
  constructor(
    message: string,
    public override cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmEnvelopeError';
    Object.setPrototypeOf(this, LlmEnvelopeError.prototype);
  }
}

export const persistFailureCodeSchema = z.enum([
  'extract_signals_failed',
  'empty_signals',
  'generate_curriculum_failed',
  'persist_failed',
  'draft_missing',
  'unknown',
]);
export type PersistFailureCode = z.infer<typeof persistFailureCodeSchema>;

export class PersistCurriculumError extends Error {
  public code: PersistFailureCode;
  constructor(
    codeOrMessage: PersistFailureCode | string,
    messageOrCause?: string | unknown,
  ) {
    const isCode = persistFailureCodeSchema.safeParse(codeOrMessage).success;
    const code = isCode ? (codeOrMessage as PersistFailureCode) : 'unknown';
    const message = isCode
      ? typeof messageOrCause === 'string'
        ? messageOrCause
        : codeOrMessage
      : (codeOrMessage as string);
    super(message);
    this.code = code;
    this.name = 'PersistCurriculumError';
    if (!isCode && messageOrCause) this.cause = messageOrCause;
    Object.setPrototypeOf(this, PersistCurriculumError.prototype);
  }
}

export function classifyOrphanError(
  err: unknown,
): import('./sessions').OrphanReason {
  if (err instanceof LlmStreamError) return 'llm_stream_error';
  if (err instanceof LlmEnvelopeError) return 'llm_empty_or_unparseable';
  if (err instanceof PersistCurriculumError) return 'persist_curriculum_failed';
  return 'unknown_post_stream';
}

/**
 * [SC-06 / UX Resilience Rules] Client-transport error classes.
 *
 * These represent failure modes that occur BEFORE or OUTSIDE an HTTP response:
 *   - `NetworkError`: `fetch` itself rejected (no response received) — offline,
 *     DNS failure, timeout, abort, etc.
 *   - `UpstreamError`: HTTP 5xx response received — server returned an error
 *     status so the API client could not surface a typed API error body.
 *
 * Hosting them here (alongside the HTTP-layer errors) means mobile's
 * `instanceof` checks work across the package boundary with a single class
 * definition, matching the pattern established for `ForbiddenError` et al. in
 * [BUG-644].
 *
 * Note: `fetchOrThrowNetworkError` (the thin `globalThis.fetch` wrapper) stays
 * in `apps/mobile/src/lib/api-errors.ts` because it depends on a browser/RN
 * runtime and belongs at the application boundary, not in the schema package.
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

// Common error codes — single source of truth
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  EXCHANGE_LIMIT_EXCEEDED: 'EXCHANGE_LIMIT_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  EMAIL_NOT_AVAILABLE: 'EMAIL_NOT_AVAILABLE',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  FORBIDDEN: 'FORBIDDEN',
  OWNER_ELEVATION_REQUIRED: 'OWNER_ELEVATION_REQUIRED',
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
  SESSION_ARCHIVED: 'SESSION_ARCHIVED',
  ENV_VALIDATION_ERROR: 'ENV_VALIDATION_ERROR',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  // Subset of UPSTREAM_ERROR specifically for LLM provider outages so the
  // mobile error classifier can offer "try again" copy instead of the
  // generic upstream-failure messaging. [BUG-832 / F-API-03]
  LLM_UNAVAILABLE: 'LLM_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  PROFILE_LIMIT_EXCEEDED: 'PROFILE_LIMIT_EXCEEDED',
  // [WI-855 / SUBJECT-20] Blocking hard-limit gate on total subjects per profile
  // (PRD: 25 total active+paused+archived). Routed as HTTP 409 Conflict — a flat
  // per-profile cap, NOT subscription-owned (subjects are not tier-gated, unlike
  // PROFILE_LIMIT_EXCEEDED which is 402). Mobile branches on this stable code
  // instead of regexing the English error message.
  SUBJECT_LIMIT_EXCEEDED: 'SUBJECT_LIMIT_EXCEEDED',
  INVALID_IDEMPOTENCY_KEY: 'INVALID_IDEMPOTENCY_KEY',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  // [WI-150 / WI-206] Returned when a dictation review payload (or other
  // size-capped request body) exceeds its server-side budget. HTTP 413.
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  // [SC-06] Client-transport error: fetch rejected before any HTTP response.
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const errorCodeValues = Object.values(ERROR_CODES) as [
  ErrorCode,
  ...ErrorCode[],
];
export const errorCodeSchema = z.enum(errorCodeValues);

/**
 * [BUG-210] Typed detail shapes for the `apiError.details` payload.
 *
 * `details` is shaped by the `code`. We model the known per-code shapes so
 * mobile (and tests) can discriminate without `as any`. Codes that don't
 * carry detail payload pass `undefined`. Unrecognised codes fall back to
 * `apiErrorDetailsRecordSchema` so server-only metadata (e.g. validation
 * issue arrays from Zod) remain expressible without forcing every shape
 * into this file.
 */

/** QUOTA_EXCEEDED details — mirrors `quotaExceededSchema.details` in billing.ts. */
const quotaExceededDetailsSchema = z.object({
  tier: z.enum(['free', 'plus', 'family', 'pro']),
  effectiveAccessTier: z.enum(['free', 'plus', 'family', 'pro']),
  quotaModel: z.enum(['per-profile', 'shared-pool']),
  profileRole: z.enum(['owner', 'child']).nullable(),
  reason: z.enum(['monthly', 'daily']),
  // [SC-05] isoDateField — mirrors billing.ts quotaExceededSchema which also uses isoDateField.
  // Previously z.string().datetime({ offset: true }) diverged from the billing canonical schema.
  resetsAt: isoDateField,
  monthlyLimit: z.number().int(),
  usedThisMonth: z.number().int(),
  dailyLimit: z.number().int().nullable(),
  usedToday: z.number().int(),
  topUpCreditsRemaining: z.number().int(),
  upgradeOptions: z.array(
    z.object({
      tier: z.enum(['plus', 'family', 'pro']),
      monthlyQuota: z.number().int(),
      priceMonthly: z.number(),
    }),
  ),
});

/** VALIDATION_ERROR details — Zod's `.issues` array shape (subset). */
const validationErrorDetailsSchema = z.object({
  issues: z.array(
    z.object({
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
      code: z.string().optional(),
    }),
  ),
});

/** RATE_LIMITED details — surfaces retryAfter so the client can back off. */
const rateLimitedDetailsSchema = z.object({
  retryAfter: z.number().optional(),
  code: z.string().optional(),
});

/** RESOURCE_GONE / SESSION_ARCHIVED details — pointer to the gone entity. */
const resourceGoneDetailsSchema = z.object({
  id: z.string().optional(),
  code: z.string().optional(),
});

/**
 * Permissive fallback for codes whose detail payload is server-defined or
 * still in flux. Always an object — never a primitive — so consumers can
 * safely property-access without runtime guards.
 */
const apiErrorDetailsRecordSchema = z.record(z.string(), z.unknown());

export const apiErrorDetailsSchema = z.union([
  quotaExceededDetailsSchema,
  validationErrorDetailsSchema,
  rateLimitedDetailsSchema,
  resourceGoneDetailsSchema,
  apiErrorDetailsRecordSchema,
]);

export type ApiErrorDetails = z.infer<typeof apiErrorDetailsSchema>;

// [BUG-576] Per-code detail-shape contract. The base union (above) lets a
// permissive `z.record` swallow malformed payloads — the discriminator below
// pins each known code's details to its strict shape. Unknown codes still fall
// through to the permissive record so the envelope stays parseable.
const codeToDetailsSchema: Partial<Record<ErrorCode, z.ZodType>> = {
  QUOTA_EXCEEDED: quotaExceededDetailsSchema,
  VALIDATION_ERROR: validationErrorDetailsSchema,
  RATE_LIMITED: rateLimitedDetailsSchema,
  GONE: resourceGoneDetailsSchema,
  SESSION_ARCHIVED: resourceGoneDetailsSchema,
};

export const apiErrorSchema = z
  .object({
    code: errorCodeSchema,
    message: z.string(),
    details: apiErrorDetailsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const strictSchema = codeToDetailsSchema[value.code];
    if (!strictSchema || value.details === undefined) return;
    const result = strictSchema.safeParse(value.details);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ['details', ...issue.path],
        });
      }
    }
  });

export type ApiError = z.infer<typeof apiErrorSchema>;
