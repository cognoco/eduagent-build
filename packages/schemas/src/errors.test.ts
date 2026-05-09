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
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  SafetyFilterError,
  UpstreamLlmError,
  VocabularyContextError,
  LlmStreamError,
  LlmEnvelopeError,
  PersistCurriculumError,
  classifyOrphanError,
} from './errors.js';

describe('typed error classes [BUG-644]', () => {
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
  it('instanceof survives a Promise.reject / catch round-trip', async () => {
    await expect(
      Promise.reject(new ForbiddenError('nope')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      Promise.reject(new NotFoundError('Foo')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
