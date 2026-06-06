import {
  createProviderApiError,
  createProviderHttpError,
  redactProviderErrorDetail,
} from './errors';

// Canary standing in for learner content a vendor error body might echo back
// (e.g. a content-filter rejection that quotes the flagged prompt). The whole
// point of these errors being content-safe is that this string must never
// reach `logger.warn(err.message)` or Sentry (`err` + `err.cause`).
const LEARNER_CONTENT = 'i feel like i want to hurt myself tonight';

/** Everything a logger / Sentry could capture from the error. */
function capturedSurface(err: Error): string {
  return JSON.stringify({ message: err.message, cause: err.cause });
}

describe('createProviderHttpError — vendor body never reaches the error', () => {
  const body = JSON.stringify({
    error: {
      type: 'content_policy_violation',
      code: 'content_filter',
      message: `Your input was flagged: "${LEARNER_CONTENT}"`,
    },
  });

  it('omits the response body from message and cause', () => {
    const err = createProviderHttpError('OpenAI API request', 400, body);
    const dump = capturedSurface(err);
    expect(dump).not.toContain(LEARNER_CONTENT);
    expect(dump).not.toContain('flagged');
    expect(err.message).toBe('OpenAI API request failed (status 400)');
  });

  it('preserves status/statusCode for router classification', () => {
    const err = createProviderHttpError('OpenAI API request', 429, body);
    expect(err.status).toBe(429);
    expect(err.statusCode).toBe(429);
    expect((err.cause as { status: number }).status).toBe(429);
    expect((err.cause as { statusCode: number }).statusCode).toBe(429);
  });

  it('records only the body length, not its content', () => {
    const err = createProviderHttpError('Anthropic API stream', 500, body);
    expect((err.cause as { bodyLength: number }).bodyLength).toBe(body.length);
    expect((err.cause as Record<string, unknown>).responseBody).toBeUndefined();
  });
});

describe('createProviderApiError — only type/code category tokens survive', () => {
  const detail = {
    type: 'authentication_error',
    code: 'invalid_api_key',
    message: `Bad key while processing: "${LEARNER_CONTENT}"`,
    param: 'messages[0].content',
  };

  it('omits the vendor message from message and cause', () => {
    const err = createProviderApiError('OpenAI API', detail);
    const dump = capturedSurface(err);
    expect(dump).not.toContain(LEARNER_CONTENT);
    expect(dump).not.toContain('Bad key');
  });

  it('preserves type/code for safety + validation classification', () => {
    const err = createProviderApiError('OpenAI API', detail);
    const cause = err.cause as { type?: string; code?: string };
    expect(cause.type).toBe('authentication_error');
    expect(cause.code).toBe('invalid_api_key');
    expect(err.message).toContain('authentication_error');
    expect(err.message).not.toContain('Bad key');
  });

  it('degrades to a bare label when no type/code is present', () => {
    const err = createProviderApiError('Gemini API', {
      message: LEARNER_CONTENT,
    });
    expect(capturedSurface(err)).not.toContain(LEARNER_CONTENT);
    expect(err.message).toBe('Gemini API error');
    expect(err.cause).toEqual({});
  });
});

describe('redactProviderErrorDetail', () => {
  it('extracts type/code from a nested {error} wrapper', () => {
    expect(
      redactProviderErrorDetail({
        error: {
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
          message: 'x',
        },
      }),
    ).toEqual({ type: 'rate_limit_error', code: 'rate_limit_exceeded' });
  });

  it('extracts type/code from a flat error object', () => {
    expect(
      redactProviderErrorDetail({ type: 'invalid_request', code: 'bad' }),
    ).toEqual({ type: 'invalid_request', code: 'bad' });
  });

  it('returns {} for non-objects and drops non-string tokens', () => {
    expect(redactProviderErrorDetail('nonsense')).toEqual({});
    expect(redactProviderErrorDetail(null)).toEqual({});
    expect(redactProviderErrorDetail({ type: 123, code: {} })).toEqual({});
  });
});
