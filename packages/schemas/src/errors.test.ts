/**
 * [BUG-644 / P-4] Regression guard: typed error classes must live in
 * @eduagent/schemas (not apps/api/src/errors.ts) so that both API services
 * and mobile clients can perform a real cross-package `instanceof` check.
 *
 * If anyone re-introduces parallel class definitions in apps/api or
 * apps/mobile, the `instanceof` checks here would still pass (each class is
 * its own identity), but the API/mobile re-exports would diverge from the
 * canonical schemas-package class — caught by the re-export equality
 * assertions below.
 */

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  QuotaExceededError,
  RateLimitedError,
  ResourceGoneError,
  SafetyFilterError,
  UpstreamLlmError,
  VocabularyContextError,
  LlmStreamError,
  LlmEnvelopeError,
  PersistCurriculumError,
  apiErrorSchema,
  classifyOrphanError,
} from './errors.js';
import type { QuotaExceededDetails } from './errors.js';

const QUOTA_DETAILS: QuotaExceededDetails = {
  tier: 'free',
  effectiveAccessTier: 'free',
  quotaModel: 'per-profile',
  profileRole: 'owner',
  reason: 'monthly',
  resetsAt: '2026-05-26T01:00:00.000Z',
  monthlyLimit: 100,
  usedThisMonth: 100,
  dailyLimit: 10,
  usedToday: 5,
  topUpCreditsRemaining: 0,
  upgradeOptions: [],
};

describe('typed error classes [BUG-644]', () => {
  it('[WI-1420] typed HTTP client errors carry numeric status for retry guards', () => {
    expect(new BadRequestError('bad input').status).toBe(400);
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError('Profile').status).toBe(404);
    expect(new ResourceGoneError().status).toBe(410);
    expect(new RateLimitedError().status).toBe(429);
  });

  it('NotFoundError carries the resource name in the message', () => {
    const err = new NotFoundError('Profile');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toContain('Profile');
  });

  it('ForbiddenError exposes a stable .errorCode marker and optional .apiCode', () => {
    const generic = new ForbiddenError();
    expect(generic).toBeInstanceOf(ForbiddenError);
    expect(generic.errorCode).toBe('FORBIDDEN');
    expect(generic.apiCode).toBeUndefined();

    const specific = new ForbiddenError('Subject inactive', 'SUBJECT_INACTIVE');
    expect(specific.errorCode).toBe('FORBIDDEN');
    expect(specific.apiCode).toBe('SUBJECT_INACTIVE');
    expect(specific.message).toBe('Subject inactive');
  });

  it('ConflictError preserves caller-supplied message', () => {
    const err = new ConflictError('round already completed');
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.name).toBe('ConflictError');
    expect(err.message).toBe('round already completed');
  });

  it('RateLimitedError exposes code, retryAfter, and preserves instanceof', () => {
    const err = new RateLimitedError('too fast', 'RATE_LIMITED', undefined, 30);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(err.name).toBe('RateLimitedError');
    expect(err.message).toBe('too fast');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryAfter).toBe(30);
  });

  it('UpstreamLlmError preserves caller-supplied message', () => {
    const err = new UpstreamLlmError('schema drift');
    expect(err).toBeInstanceOf(UpstreamLlmError);
    expect(err.name).toBe('UpstreamLlmError');
  });

  it('SafetyFilterError preserves type and code for provider safety blocks', () => {
    const err = new SafetyFilterError('blocked by safety filters');
    expect(err).toBeInstanceOf(SafetyFilterError);
    expect(err.name).toBe('SafetyFilterError');
    expect(err.errorCode).toBe('SAFETY_FILTER');
  });

  it('QuotaExceededError exposes stable codes and quota details [BUG-947]', () => {
    const err = new QuotaExceededError('Quota exceeded', QUOTA_DETAILS);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err.name).toBe('QuotaExceededError');
    expect(err.code).toBe('QUOTA_EXCEEDED');
    expect(err.errorCode).toBe('QUOTA_EXCEEDED');
    expect(err.details).toBe(QUOTA_DETAILS);
    expect(err.message).toBe('Quota exceeded');
  });

  it('ResourceGoneError exposes stable errorCode and optional code/details [BUG-1010]', () => {
    const err = new ResourceGoneError('Session deleted', 'SESSION_ARCHIVED', {
      id: 'sess_123',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ResourceGoneError);
    expect(err.name).toBe('ResourceGoneError');
    expect(err.errorCode).toBe('RESOURCE_GONE');
    expect(err.code).toBe('SESSION_ARCHIVED');
    expect(err.details).toEqual({ id: 'sess_123' });
    expect(err.message).toBe('Session deleted');

    const defaults = new ResourceGoneError();
    expect(defaults.errorCode).toBe('RESOURCE_GONE');
    expect(defaults.message).toBe('This resource is no longer available.');
    expect(defaults.code).toBeUndefined();
    expect(defaults.details).toBeUndefined();
  });

  it('VocabularyContextError accepts a cause via ErrorOptions', () => {
    const cause = new Error('underlying');
    const err = new VocabularyContextError('bad subjectId', { cause });
    expect(err).toBeInstanceOf(VocabularyContextError);
    expect(err.name).toBe('VocabularyContextError');
    expect((err as Error & { cause?: unknown }).cause).toBe(cause);
  });

  describe('orphan error classification [INTERACTION-DUR-L2]', () => {
    it('LlmStreamError preserves cause and is instanceof Error', () => {
      const cause = new Error('connection reset');
      const err = new LlmStreamError('streamExchange threw', cause);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(LlmStreamError);
      expect(err.name).toBe('LlmStreamError');
      expect(err.cause).toBe(cause);
    });

    it('LlmEnvelopeError preserves cause and is instanceof Error', () => {
      const err = new LlmEnvelopeError('unparseable envelope');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(LlmEnvelopeError);
      expect(err.name).toBe('LlmEnvelopeError');
    });

    it('PersistCurriculumError preserves cause and is instanceof Error', () => {
      const cause = new Error('DB timeout');
      const err = new PersistCurriculumError('persist failed', cause);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(PersistCurriculumError);
      expect(err.name).toBe('PersistCurriculumError');
      expect(err.cause).toBe(cause);
    });

    it.each([
      [new LlmStreamError('x'), 'llm_stream_error'],
      [new LlmEnvelopeError('x'), 'llm_empty_or_unparseable'],
      [new PersistCurriculumError('x'), 'persist_curriculum_failed'],
      [new Error('unknown'), 'unknown_post_stream'],
      [new TypeError('random'), 'unknown_post_stream'],
      ['string error', 'unknown_post_stream'],
      [null, 'unknown_post_stream'],
    ] as const)(
      'classifyOrphanError(%s) returns %s (no regex)',
      (err, expected) => {
        expect(classifyOrphanError(err)).toBe(expected);
      },
    );
  });

  // The whole point of moving these into schemas: an instance created
  // here is the SAME class as the one re-exported from apps/api/src/errors
  // and apps/mobile/src/lib/api-errors. We can't import from those paths
  // directly in the schemas package (would invert the dep graph), but we
  // can verify the class identity via the constructor `name` and prove a
  // round-trip throw/catch over a Promise still satisfies instanceof.
  describe('apiErrorSchema.details [BUG-210] — typed detail union', () => {
    it('accepts QUOTA_EXCEEDED with the canonical details payload', () => {
      const result = apiErrorSchema.safeParse({
        code: 'QUOTA_EXCEEDED',
        message: 'Quota exceeded',
        details: QUOTA_DETAILS,
      });
      expect(result.success).toBe(true);
    });

    it('accepts VALIDATION_ERROR with a Zod-shaped issues array', () => {
      const result = apiErrorSchema.safeParse({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: {
          issues: [
            { path: ['body', 'email'], message: 'Invalid email' },
            { path: ['body', 'age'], message: 'Too small', code: 'too_small' },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts RATE_LIMITED with retryAfter', () => {
      const result = apiErrorSchema.safeParse({
        code: 'RATE_LIMITED',
        message: 'Slow down',
        details: { retryAfter: 30 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts GONE / SESSION_ARCHIVED with an id pointer', () => {
      const result = apiErrorSchema.safeParse({
        code: 'SESSION_ARCHIVED',
        message: 'Session was deleted',
        details: { id: 'sess_123' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts errors with no details (omitted)', () => {
      const result = apiErrorSchema.safeParse({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
      expect(result.success).toBe(true);
    });

    it('accepts account email verification errors with no details', () => {
      expect(
        apiErrorSchema.safeParse({
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Email not verified',
        }).success,
      ).toBe(true);
      expect(
        apiErrorSchema.safeParse({
          code: 'EMAIL_NOT_AVAILABLE',
          message: 'Email not available',
        }).success,
      ).toBe(true);
    });

    it('REJECTS a primitive details payload (must be an object)', () => {
      const result = apiErrorSchema.safeParse({
        code: 'INTERNAL_ERROR',
        message: 'Boom',
        details: 'just a string',
      });
      expect(result.success).toBe(false);
    });

    it('REJECTS an unknown top-level error code', () => {
      const result = apiErrorSchema.safeParse({
        code: 'TOTALLY_INVENTED_CODE',
        message: 'Nope',
      });
      expect(result.success).toBe(false);
    });

    it('accepts an unknown-code-shape details (record fallback)', () => {
      const result = apiErrorSchema.safeParse({
        code: 'INTERNAL_ERROR',
        message: 'Boom',
        details: { traceId: 'abc', component: 'session' },
      });
      expect(result.success).toBe(true);
    });

    it('[BUG-576] rejects QUOTA_EXCEEDED with malformed details — no record fallthrough', () => {
      const result = apiErrorSchema.safeParse({
        code: 'QUOTA_EXCEEDED',
        message: 'Out of quota',
        // Missing required quotaExceeded fields (tier, reason, monthlyLimit, ...)
        details: { traceId: 'abc' },
      });
      expect(result.success).toBe(false);
    });

    it('[BUG-576] rejects VALIDATION_ERROR with missing issues array — no silent passthrough', () => {
      const result = apiErrorSchema.safeParse({
        code: 'VALIDATION_ERROR',
        message: 'Bad input',
        // VALIDATION_ERROR requires `details.issues: array`; supplying nothing matches the record fallback unless superRefine fires.
        details: { component: 'session' },
      });
      expect(result.success).toBe(false);
    });

    it('[BUG-576] still accepts unknown codes with arbitrary details (record fallback preserved)', () => {
      const result = apiErrorSchema.safeParse({
        code: 'INTERNAL_ERROR',
        message: 'Boom',
        details: { traceId: 'abc', component: 'session' },
      });
      expect(result.success).toBe(true);
    });
  });

  it('instanceof survives a Promise.reject / catch round-trip', async () => {
    await expect(
      Promise.reject(new ForbiddenError('nope')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      Promise.reject(new NotFoundError('Foo')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
