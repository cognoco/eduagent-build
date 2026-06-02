/**
 * Tests for the typed error class hierarchy in api-errors.ts.
 *
 * Verifies that:
 * - New error classes (NotFoundError, ResourceGoneError, RateLimitedError,
 *   NetworkError, BadRequestError) are properly instantiated and carry the
 *   expected properties.
 * - `instanceof` checks work correctly (including across the prototype chain).
 * - Spoofed `.name` strings do NOT pass `instanceof` checks.
 */
import {
  QuotaExceededError as SchemasQuotaExceededError,
  ResourceGoneError as SchemasResourceGoneError,
  quotaExceededSchema,
} from '@eduagent/schemas';
import {
  BadRequestError,
  buildFallbackQuotaDetails,
  NetworkError,
  NotFoundError,
  QuotaExceededError,
  quotaErrorFromBody,
  RateLimitedError,
  ResourceGoneError,
  UpstreamError,
} from './api-errors';
import { ForbiddenError, ConflictError } from './api-errors';

const QUOTA_DETAILS = {
  tier: 'free' as const,
  effectiveAccessTier: 'free' as const,
  quotaModel: 'per-profile' as const,
  profileRole: 'owner' as const,
  reason: 'monthly' as const,
  resetsAt: '2026-05-27T01:00:00.000Z',
  monthlyLimit: 100,
  usedThisMonth: 100,
  dailyLimit: 10,
  usedToday: 5,
  topUpCreditsRemaining: 0,
  upgradeOptions: [],
};

describe('NotFoundError', () => {
  it('is instanceof NotFoundError and Error', () => {
    const err = new NotFoundError('Session');
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Session not found');
    expect(err.name).toBe('NotFoundError');
  });

  it('spoofed name does not pass instanceof', () => {
    const fake = new Error('Session not found');
    fake.name = 'NotFoundError';
    expect(fake).not.toBeInstanceOf(NotFoundError);
  });
});

describe('ResourceGoneError', () => {
  it('re-exports ResourceGoneError from @eduagent/schemas', () => {
    expect(ResourceGoneError).toBe(SchemasResourceGoneError);
  });

  it('is instanceof ResourceGoneError and Error', () => {
    const err = new ResourceGoneError('Gone', 'GONE', { extra: true });
    expect(err).toBeInstanceOf(ResourceGoneError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Gone');
    expect(err.errorCode).toBe('RESOURCE_GONE');
    expect(err.code).toBe('GONE');
    expect(err.details).toEqual({ extra: true });
    expect(err.name).toBe('ResourceGoneError');
  });

  it('uses default message when no args', () => {
    const err = new ResourceGoneError();
    expect(err.message).toBe('This resource is no longer available.');
    expect(err.code).toBeUndefined();
    expect(err.details).toBeUndefined();
  });

  it('spoofed name does not pass instanceof', () => {
    const fake = new Error('gone');
    fake.name = 'ResourceGoneError';
    expect(fake).not.toBeInstanceOf(ResourceGoneError);
  });
});

describe('NetworkError', () => {
  it('is instanceof NetworkError and Error', () => {
    const cause = new TypeError('Failed to fetch');
    const err = new NetworkError(undefined, cause);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err).toBeInstanceOf(Error);
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('NetworkError');
  });

  it('uses default message when none provided', () => {
    const err = new NetworkError();
    expect(err.message).toContain('offline');
  });

  it('spoofed name does not pass instanceof', () => {
    const fake = new Error('network');
    fake.name = 'NetworkError';
    expect(fake).not.toBeInstanceOf(NetworkError);
  });
});

describe('RateLimitedError', () => {
  it('carries retryAfter', () => {
    const err = new RateLimitedError(
      'slow down',
      'RATE_LIMITED',
      undefined,
      30,
    );
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(err.retryAfter).toBe(30);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.message).toBe('slow down');
  });

  it('uses default message when none provided', () => {
    const err = new RateLimitedError();
    expect(err.message).toContain('limit');
  });
});

describe('BadRequestError', () => {
  it('is instanceof BadRequestError and Error', () => {
    const err = new BadRequestError('Email already exists');
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Email already exists');
    expect(err.name).toBe('BadRequestError');
  });
});

describe('QuotaExceededError', () => {
  it('re-exports QuotaExceededError from @eduagent/schemas', () => {
    expect(QuotaExceededError).toBe(SchemasQuotaExceededError);
  });

  it('carries code and details', () => {
    const err = new QuotaExceededError('Quota exceeded', QUOTA_DETAILS);
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err.code).toBe('QUOTA_EXCEEDED');
    expect(err.details).toEqual(QUOTA_DETAILS);
  });
});

describe('UpstreamError', () => {
  it('carries code and status', () => {
    const err = new UpstreamError('Server exploded', 'INTERNAL_ERROR', 503);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.status).toBe(503);
  });

  it('defaults status to 500', () => {
    const err = new UpstreamError('boom', 'UPSTREAM_ERROR');
    expect(err.status).toBe(500);
  });
});

describe('ForbiddenError re-export', () => {
  it('is instanceof ForbiddenError from @eduagent/schemas', () => {
    const err = new ForbiddenError('Access denied', 'SUBJECT_INACTIVE');
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.errorCode).toBe('FORBIDDEN');
    expect(err.apiCode).toBe('SUBJECT_INACTIVE');
  });
});

describe('ConflictError re-export', () => {
  it('is instanceof ConflictError', () => {
    const err = new ConflictError('Already exists');
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe('Already exists');
  });
});

describe('quotaErrorFromBody — 402 quota classification', () => {
  const WELL_FORMED = {
    code: 'QUOTA_EXCEEDED',
    message:
      "You've reached your daily question limit. Come back tomorrow for more!",
    details: {
      tier: 'free',
      effectiveAccessTier: 'free',
      quotaModel: 'per-profile',
      profileRole: 'owner',
      reason: 'daily',
      resetsAt: '2026-06-01T01:00:00.000Z',
      monthlyLimit: 100,
      usedThisMonth: 10,
      dailyLimit: 10,
      usedToday: 10,
      topUpCreditsRemaining: 0,
      upgradeOptions: [
        { tier: 'plus', monthlyQuota: 700, priceMonthly: 18.99 },
      ],
    },
  };

  it('returns a QuotaExceededError with exact details for a well-formed body', () => {
    const err = quotaErrorFromBody(WELL_FORMED);
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err?.details).toEqual(WELL_FORMED.details);
    expect(err?.message).toBe(WELL_FORMED.message);
  });

  it('still returns a QuotaExceededError when details DRIFT from the schema', () => {
    // A plausible future server-side drift: details is tagged QUOTA_EXCEEDED but
    // is missing several schema-required fields. The OLD strict-only classifiers
    // would reject this and downgrade to UpstreamError (silent dead-end + false
    // LLM telemetry). This is the bug this hardening prevents.
    const drifted = {
      code: 'QUOTA_EXCEEDED',
      message:
        "You've reached your daily question limit. Come back tomorrow for more!",
      details: { reason: 'daily', usedToday: 10, dailyLimit: 10 },
    };

    // RED condition: the strict schema (what the old code gated on) rejects it.
    expect(quotaExceededSchema.safeParse(drifted).success).toBe(false);

    // GREEN: the hardened classifier still surfaces a quota error.
    const err = quotaErrorFromBody(drifted);
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err?.message).toBe(drifted.message);
    // Render-safe details: real values preserved, missing fields defaulted.
    expect(err?.details.reason).toBe('daily');
    expect(err?.details.usedToday).toBe(10);
    expect(err?.details.dailyLimit).toBe(10);
    expect(err?.details.tier).toBe('free');
    expect(err?.details.upgradeOptions).toEqual([]);
    expect(err?.details.topUpCreditsRemaining).toBe(0);
  });

  it('reads QUOTA_EXCEEDED from a nested error.code envelope', () => {
    const err = quotaErrorFromBody({
      error: { code: 'QUOTA_EXCEEDED', message: 'Out of questions' },
      details: { reason: 'monthly' },
    });
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err?.message).toBe('Out of questions');
    expect(err?.details.reason).toBe('monthly');
  });

  it('returns null for a non-quota 402 body (caller falls back to UpstreamError)', () => {
    expect(
      quotaErrorFromBody({ code: 'PAYMENT_REQUIRED', message: 'pay up' }),
    ).toBeNull();
    expect(quotaErrorFromBody('not json at all')).toBeNull();
    expect(quotaErrorFromBody(null)).toBeNull();
  });

  it('uses the fallback message only when the body carries none', () => {
    const err = quotaErrorFromBody({ code: 'QUOTA_EXCEEDED' }, 'fallback msg');
    expect(err?.message).toBe('fallback msg');
  });
});

describe('buildFallbackQuotaDetails', () => {
  it('defaults every field to a render-safe value for empty input', () => {
    const d = buildFallbackQuotaDetails(undefined);
    expect(d).toEqual({
      tier: 'free',
      effectiveAccessTier: 'free',
      quotaModel: 'per-profile',
      profileRole: null,
      reason: 'daily',
      resetsAt: expect.any(String),
      monthlyLimit: 0,
      usedThisMonth: 0,
      dailyLimit: null,
      usedToday: 0,
      topUpCreditsRemaining: 0,
      upgradeOptions: [],
    });
  });

  it('drops malformed upgrade options and non-numeric counters', () => {
    const d = buildFallbackQuotaDetails({
      monthlyLimit: '700', // wrong type → defaulted
      usedToday: 3,
      upgradeOptions: [
        { tier: 'plus', monthlyQuota: 700, priceMonthly: 18.99 }, // kept
        { tier: 'enterprise', monthlyQuota: 1, priceMonthly: 1 }, // bad tier → dropped
        { tier: 'pro', monthlyQuota: 'x', priceMonthly: 1 }, // bad quota → dropped
      ],
    });
    expect(d.monthlyLimit).toBe(0);
    expect(d.usedToday).toBe(3);
    expect(d.upgradeOptions).toEqual([
      { tier: 'plus', monthlyQuota: 700, priceMonthly: 18.99 },
    ]);
  });
});
