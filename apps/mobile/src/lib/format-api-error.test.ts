import { classifyApiError, formatApiError } from './format-api-error';

/*
 * Screens updated with formatApiError (Story 10.4):
 *   - (app)/session/index.tsx — session start + streaming errors
 *   - (app)/homework/camera.tsx — OCR error fallback
 *   - (app)/dashboard.tsx — dashboard load error
 *   - session-summary/[sessionId].tsx — summary submission error
 *   - consent.tsx — consent request fallback
 *   - create-profile.tsx — profile creation fallback
 *   - delete-account.tsx — account deletion / cancel fallback
 *   - create-subject.tsx — subject creation fallback
 *   - (app)/onboarding/curriculum-review.tsx — curriculum challenge error
 *   - (app)/topic/recall-test.tsx — recall test error
 *   - (app)/subscription.tsx — generic purchase error fallback
 *   - hooks/use-homework-ocr.ts — OCR catch fallback
 *
 * E2E note: Error messages are hard to trigger deterministically in E2E.
 * These are validated via unit tests only.
 */

describe('classifyApiError', () => {
  // --- Network errors ---

  it('classifies TypeError fetch failure as network / retry', () => {
    const err = new TypeError('Failed to fetch');
    const result = classifyApiError(err);
    expect(result.category).toBe('network');
    expect(result.recovery).toBe('retry');
    expect(result.message).toContain('offline');
  });

  it('classifies TypeError network failure as network / retry', () => {
    const err = new TypeError('A network error occurred');
    const result = classifyApiError(err);
    expect(result.category).toBe('network');
    expect(result.recovery).toBe('retry');
  });

  it('classifies Error with "timeout" in message as network / retry', () => {
    const err = new Error('Request timeout after 30000ms');
    const result = classifyApiError(err);
    expect(result.category).toBe('network');
    expect(result.recovery).toBe('retry');
  });

  // --- HTTP status codes ---

  it('classifies API error 404 as not-found / go-back', () => {
    const err = new Error('API error 404: {"message":"Session not found"}');
    const result = classifyApiError(err);
    expect(result.category).toBe('not-found');
    expect(result.recovery).toBe('go-back');
    // Applies FRIENDLY_MESSAGE_MAP translation
    expect(result.message).toContain('session');
  });

  it('classifies API error 401 as auth / sign-out', () => {
    const err = new Error('API error 401: Unauthorized');
    const result = classifyApiError(err);
    expect(result.category).toBe('auth');
    expect(result.recovery).toBe('sign-out');
  });

  it('classifies API error 403 as auth / sign-out', () => {
    const err = new Error('API error 403: Forbidden');
    const result = classifyApiError(err);
    expect(result.category).toBe('auth');
    expect(result.recovery).toBe('sign-out');
  });

  it('classifies API error 429 as quota / retry', () => {
    const err = new Error('API error 429: {"message":"Rate limit exceeded"}');
    const result = classifyApiError(err);
    expect(result.category).toBe('quota');
    expect(result.recovery).toBe('retry');
  });

  it('classifies API error 500 as server / retry', () => {
    const err = new Error('API error 500: Internal Server Error');
    const result = classifyApiError(err);
    expect(result.category).toBe('server');
    expect(result.recovery).toBe('retry');
  });

  it('classifies API error 502 as server / retry', () => {
    const err = new Error('API error 502: Bad Gateway');
    const result = classifyApiError(err);
    expect(result.category).toBe('server');
    expect(result.recovery).toBe('retry');
  });

  // --- Named error types ---

  it('classifies QuotaExceededError as quota / none', () => {
    const err = new Error('You have exceeded your monthly question limit');
    err.name = 'QuotaExceededError';
    const result = classifyApiError(err);
    expect(result.category).toBe('quota');
    expect(result.recovery).toBe('none');
    expect(result.message).toContain('exceeded');
  });

  it('classifies ForbiddenError as auth / sign-out', () => {
    const err = Object.assign(
      new Error('You do not have permission to access this resource'),
      { name: 'ForbiddenError', code: 'FORBIDDEN', apiCode: undefined }
    );
    const result = classifyApiError(err);
    expect(result.category).toBe('auth');
    expect(result.recovery).toBe('sign-out');
  });

  it('classifies ForbiddenError with SUBJECT_INACTIVE as not-found / go-back', () => {
    const err = Object.assign(
      new Error('Subject is paused — resume it before starting a session'),
      { name: 'ForbiddenError', code: 'FORBIDDEN', apiCode: 'SUBJECT_INACTIVE' }
    );
    const result = classifyApiError(err);
    expect(result.category).toBe('not-found');
    expect(result.recovery).toBe('go-back');
  });

  // --- Error codes on the error object ---

  it('classifies EXCHANGE_LIMIT_EXCEEDED code as quota / go-back', () => {
    const err = Object.assign(new Error('Limit exceeded'), {
      code: 'EXCHANGE_LIMIT_EXCEEDED',
    });
    const result = classifyApiError(err);
    expect(result.category).toBe('quota');
    expect(result.recovery).toBe('go-back');
  });

  it('classifies UPSTREAM_ERROR code as server / retry', () => {
    const err = Object.assign(new Error('upstream issue'), {
      code: 'UPSTREAM_ERROR',
    });
    const result = classifyApiError(err);
    expect(result.category).toBe('server');
    expect(result.recovery).toBe('retry');
  });

  // --- Unknown / fallback ---

  it('classifies null as unknown / retry', () => {
    const result = classifyApiError(null);
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('retry');
  });

  it('classifies undefined as unknown / retry', () => {
    const result = classifyApiError(undefined);
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('retry');
  });

  it('classifies plain string as unknown / retry', () => {
    const result = classifyApiError('something failed');
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('retry');
  });

  it('classifies short user-facing Error messages as unknown / retry with passthrough', () => {
    const err = new Error('Profile name must be at least 2 characters');
    const result = classifyApiError(err);
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('retry');
    expect(result.message).toBe('Profile name must be at least 2 characters');
  });
});

describe('formatApiError', () => {
  // --- Network errors ---

  it('returns network message for TypeError containing "fetch"', () => {
    const err = new TypeError('Failed to fetch');
    expect(formatApiError(err)).toBe(
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again."
    );
  });

  it('returns network message for TypeError containing "network"', () => {
    const err = new TypeError('A network error occurred');
    expect(formatApiError(err)).toBe(
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again."
    );
  });

  it('returns network message for Error with "timeout" in message', () => {
    const err = new Error('Request timeout after 30000ms');
    expect(formatApiError(err)).toBe(
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again."
    );
  });

  it('returns network message for Error with "network" in message', () => {
    const err = new Error('Network request failed');
    expect(formatApiError(err)).toBe(
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again."
    );
  });

  it('returns network message for Error with "abort" in message', () => {
    const err = new Error('The operation was aborted');
    expect(formatApiError(err)).toBe(
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again."
    );
  });

  // --- Hono RPC API errors (from customFetch in api-client.ts) ---

  it('returns server message for API error 500', () => {
    const err = new Error('API error 500: Internal Server Error');
    expect(formatApiError(err)).toBe(
      'Something went wrong on our end. Please try again in a moment.'
    );
  });

  it('returns server message for API error 502 with plain text body', () => {
    const err = new Error('API error 502: Bad Gateway');
    expect(formatApiError(err)).toBe(
      'Something went wrong on our end. Please try again in a moment.'
    );
  });

  it('extracts JSON message from API error 502 body', () => {
    const err = new Error(
      'API error 502: {"code":"INTERNAL_ERROR","message":"Consent email could not be delivered. Please check the email address and try again."}'
    );
    expect(formatApiError(err)).toBe(
      'Consent email could not be delivered. Please check the email address and try again.'
    );
  });

  it('extracts JSON message from API error 400 body', () => {
    const err = new Error(
      'API error 400: {"message":"Email is already registered"}'
    );
    expect(formatApiError(err)).toBe('Email is already registered');
  });

  it('uses plain text body from API error 422', () => {
    const err = new Error('API error 422: Invalid email format');
    expect(formatApiError(err)).toBe('Invalid email format');
  });

  it('returns input message for API error 400 with empty body', () => {
    const err = new Error('API error 400: ');
    expect(formatApiError(err)).toBe(
      "That didn't work. Please check your input and try again."
    );
  });

  it('returns input message for API error 404 with unreadable body', () => {
    const err = new Error('API error 404: {"complex":{"nested":"object"}}');
    expect(formatApiError(err)).toBe(
      "That didn't work. Please check your input and try again."
    );
  });

  // --- ForbiddenError with apiCode [BUG-100] ---

  it('returns subject-inactive message when ForbiddenError carries SUBJECT_INACTIVE apiCode', () => {
    const err = Object.assign(
      new Error('Subject is paused — resume it before starting a session'),
      { name: 'ForbiddenError', code: 'FORBIDDEN', apiCode: 'SUBJECT_INACTIVE' }
    );
    expect(formatApiError(err)).toBe(
      'Subject is paused — resume it before starting a session'
    );
  });

  it('passes through ForbiddenError message when apiCode is not a special code', () => {
    const err = Object.assign(
      new Error('You do not have permission to access this resource'),
      { name: 'ForbiddenError', code: 'FORBIDDEN', apiCode: undefined }
    );
    expect(formatApiError(err)).toBe(
      'You do not have permission to access this resource'
    );
  });

  // --- QuotaExceededError ---

  it('passes through QuotaExceededError message', () => {
    const err = new Error('You have exceeded your monthly question limit');
    err.name = 'QuotaExceededError';
    expect(formatApiError(err)).toBe(
      'You have exceeded your monthly question limit'
    );
  });

  // --- User-facing error messages (pass-through) ---

  it('passes through short, user-facing error messages', () => {
    const err = new Error('Profile name must be at least 2 characters');
    expect(formatApiError(err)).toBe(
      'Profile name must be at least 2 characters'
    );
  });

  it('returns default for long technical messages', () => {
    const err = new Error('a'.repeat(250));
    expect(formatApiError(err)).toBe(
      'Something unexpected happened. Please try again.'
    );
  });

  it('returns default for error messages with stack-like content', () => {
    const err = new Error('Cannot read property at Object.something');
    expect(formatApiError(err)).toBe(
      'Something unexpected happened. Please try again.'
    );
  });

  // --- Non-Error values ---

  it('returns default for null', () => {
    expect(formatApiError(null)).toBe(
      'Something unexpected happened. Please try again.'
    );
  });

  it('returns default for undefined', () => {
    expect(formatApiError(undefined)).toBe(
      'Something unexpected happened. Please try again.'
    );
  });

  it('returns default for string error', () => {
    expect(formatApiError('something failed')).toBe(
      'Something unexpected happened. Please try again.'
    );
  });

  it('returns default for number error', () => {
    expect(formatApiError(42)).toBe(
      'Something unexpected happened. Please try again.'
    );
  });

  it('returns default for empty object', () => {
    expect(formatApiError({})).toBe(
      'Something unexpected happened. Please try again.'
    );
  });
});
