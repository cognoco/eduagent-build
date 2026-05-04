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
  BadRequestError,
  NetworkError,
  NotFoundError,
  QuotaExceededError,
  RateLimitedError,
  ResourceGoneError,
  UpstreamError,
} from './api-errors';
import { ForbiddenError, ConflictError } from './api-errors';

const QUOTA_DETAILS = {
  tier: 'free' as const,
  reason: 'monthly' as const,
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
  it('is instanceof ResourceGoneError and Error', () => {
    const err = new ResourceGoneError('Gone', 'GONE', { extra: true });
    expect(err).toBeInstanceOf(ResourceGoneError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Gone');
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
      30
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
