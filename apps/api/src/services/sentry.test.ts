import type * as Sentry from '@sentry/cloudflare';
import {
  captureException,
  addBreadcrumb,
  scrubSentryEvent,
  dropConsoleBreadcrumb,
} from './sentry';

// ---------------------------------------------------------------------------
// Mock @sentry/cloudflare
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
const mockAddBreadcrumb = jest.fn();
const mockSetUser = jest.fn();
const mockSetTag = jest.fn();

const mockScope = {
  setUser: mockSetUser,
  setTag: mockSetTag,
};

jest.mock('@sentry/cloudflare', () => ({
  withScope: (cb: (scope: typeof mockScope) => void) => cb(mockScope),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// captureException
// ---------------------------------------------------------------------------

describe('captureException', () => {
  it('captures an exception without context', () => {
    const error = new Error('test error');

    captureException(error);

    expect(mockCaptureException).toHaveBeenCalledWith(error);
    expect(mockSetUser).not.toHaveBeenCalled();
    expect(mockSetTag).not.toHaveBeenCalled();
  });

  it('sets user when userId is provided', () => {
    const error = new Error('auth error');

    captureException(error, { userId: 'user-123' });

    expect(mockSetUser).toHaveBeenCalledWith({ id: 'user-123' });
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it('sets profileId and requestPath tags when provided', () => {
    const error = new Error('profile error');

    captureException(error, {
      userId: 'user-123',
      profileId: 'profile-456',
      requestPath: '/v1/sessions',
    });

    expect(mockSetUser).toHaveBeenCalledWith({ id: 'user-123' });
    expect(mockSetTag).toHaveBeenCalledWith('profileId', 'profile-456');
    expect(mockSetTag).toHaveBeenCalledWith('requestPath', '/v1/sessions');
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it('handles partial context without crashing', () => {
    captureException(new Error('partial'), { requestPath: '/v1/test' });

    expect(mockSetUser).not.toHaveBeenCalled();
    expect(mockSetTag).toHaveBeenCalledWith('requestPath', '/v1/test');
  });
});

// ---------------------------------------------------------------------------
// addBreadcrumb
// ---------------------------------------------------------------------------

describe('addBreadcrumb', () => {
  it('adds a breadcrumb with default level', () => {
    addBreadcrumb('user clicked button', 'ui');

    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      message: 'user clicked button',
      category: 'ui',
      level: 'info',
    });
  });

  it('adds a breadcrumb with custom level', () => {
    addBreadcrumb('db query failed', 'db', 'error');

    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      message: 'db query failed',
      category: 'db',
      level: 'error',
    });
  });
});

// ---------------------------------------------------------------------------
// scrubSentryEvent [WI-1990] — beforeSend PII backstop
// ---------------------------------------------------------------------------

describe('scrubSentryEvent', () => {
  it('strips denylisted keys from event.extra', () => {
    const event = {
      extra: {
        rawInput: "child's homework: my name is Alice and I live at...",
        messages: [{ role: 'user', content: 'chat transcript here' }],
        responseLength: 42,
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.extra).not.toHaveProperty('rawInput');
    expect(scrubbed.extra).not.toHaveProperty('messages');
    expect(scrubbed.extra?.responseLength).toBe(42);
  });

  it('strips denylisted keys from every event.contexts entry', () => {
    const event = {
      contexts: {
        state: { transcript: 'raw learner chat', sessionId: 'sess-1' },
        app: { app_name: 'mentomate' },
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.contexts?.state).not.toHaveProperty('transcript');
    expect(scrubbed.contexts?.state?.sessionId).toBe('sess-1');
    expect(scrubbed.contexts?.app).toEqual({ app_name: 'mentomate' });
  });

  it('leaves an event with no extra/contexts unchanged', () => {
    const event = {
      message: 'unhandled error',
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed).toEqual(event);
  });

  it('leaves non-denylisted extra/context keys untouched', () => {
    const event = {
      extra: { context: 'language-detect.fallback', profileId: 'p-1' },
      contexts: { profile: { profile_id: 'p-1' } },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.extra).toEqual({
      context: 'language-detect.fallback',
      profileId: 'p-1',
    });
    expect(scrubbed.contexts).toEqual({ profile: { profile_id: 'p-1' } });
  });

  // [WI-1990 rework] Red-green regression for the reviewer-bounced finding:
  // 7 sibling `captureException` call sites (summaries.ts, assessments.ts,
  // filing.ts, topic-probe-extraction.ts, post-session-suggestions.ts) sent
  // `jsonStrSample: jsonStr.slice(0, 200)` — a raw slice of the LLM's JSON
  // response, which can echo the learner's free-text input — straight into
  // `event.extra`. Before this fix, `jsonStrSample` was not in the denylist
  // and this assertion FAILED (the scrubber passed it through unchanged);
  // after adding `jsonStrSample` to `PII_DENYLIST_KEYS` it PASSES.
  it('strips jsonStrSample-style raw LLM-response-sample content from event.extra', () => {
    const event = {
      extra: {
        surface: 'summary-evaluation',
        reason: 'invalid_json',
        jsonStrSample:
          '{"feedback":"You wrote that your mom is picking you up at 5pm from..."}',
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.extra).not.toHaveProperty('jsonStrSample');
    expect(scrubbed.extra?.surface).toBe('summary-evaluation');
    expect(scrubbed.extra?.reason).toBe('invalid_json');
  });

  it('strips every LLM-response-sample sibling key (forward guard for new call sites)', () => {
    const event = {
      extra: {
        rawSnippet: 'raw response text',
        responsePreview: 'preview text',
        jsonStr: '{"raw":"json"}',
        rawResponse: 'full raw response',
        chunk: 'malformed sse chunk text',
        safeField: 'kept',
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.extra).toEqual({ safeField: 'kept' });
  });

  it('strips denylisted keys nested inside a non-denylisted object (recursive scrub)', () => {
    const event = {
      extra: {
        surface: 'assessments-evaluation',
        // A future call site could nest the sample under a wrapper object
        // instead of passing it top-level — the scrubber must still catch it.
        debug: { jsonStrSample: 'raw llm text', reason: 'invalid_json' },
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.extra?.debug).not.toHaveProperty('jsonStrSample');
    expect((scrubbed.extra?.debug as Record<string, unknown>).reason).toBe(
      'invalid_json',
    );
  });

  it('strips denylisted keys from breadcrumb data', () => {
    const event = {
      breadcrumbs: [
        {
          message: 'llm parse failed',
          category: 'llm',
          data: { jsonStrSample: 'raw llm text', sessionId: 'sess-1' },
        },
      ],
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    const crumb = scrubbed.breadcrumbs?.[0];
    expect(crumb?.data).not.toHaveProperty('jsonStrSample');
    expect(crumb?.data?.sessionId).toBe('sess-1');
  });

  // [WI-1990 rework] Third-vector red-green regression (independent re-audit
  // finding): `JSON.parse(malformedText)` throws a SyntaxError whose
  // `.message` embeds a literal snippet of the malformed text — the ONE
  // Sentry event surface neither the key-based extra/contexts/breadcrumb
  // scrubbing above nor `dropConsoleBreadcrumb` touches, because it lives in
  // `exception.value`, not a keyed field or a breadcrumb. This is the ACTUAL
  // message shape V8 throws (verified via `JSON.parse("Sure! Here")` in this
  // repo's Node runtime): `Unexpected token 'S', "Sure! Here" is not valid
  // JSON` — the quoted portion is a literal slice of the LLM response, which
  // can echo learner homework/quiz-answer content (the exact shape the 5
  // sibling `dictation`/`quiz` sites leaked before this rework). Before this
  // fix, nothing redacted `event.exception.values[].value` and this
  // assertion FAILED (the quoted snippet passed through unchanged); after
  // adding the redaction it PASSES.
  it('redacts the quoted snippet from a JSON.parse SyntaxError exception value', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'SyntaxError',
            value:
              "Unexpected token 'S', \"Sure! Here'sthe answer to your question, I think my mom said...\" is not valid JSON",
          },
        ],
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    const redactedValue = scrubbed.exception?.values?.[0]?.value;
    expect(redactedValue).not.toContain('Sure! Here');
    expect(redactedValue).not.toContain('my mom said');
    expect(redactedValue).toBe(
      'Unexpected token \'S\', "[redacted]" is not valid JSON',
    );
  });

  it('leaves a JSON.parse SyntaxError value with no quoted snippet unchanged', () => {
    const event = {
      exception: {
        values: [
          { type: 'SyntaxError', value: 'Unexpected end of JSON input' },
        ],
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      'Unexpected end of JSON input',
    );
  });

  it('leaves an unrelated exception value untouched', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'foo')",
          },
        ],
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      "Cannot read properties of undefined (reading 'foo')",
    );
  });

  // [WI-2353] Red-green regression: @sentry/cloudflare's default
  // requestDataIntegration copies event.request.headers verbatim, and the
  // SDK only withholds the cookie header by default (sendDefaultPii: false)
  // — authorization is not treated specially, so `Authorization: Bearer
  // <jwt>` reaches Sentry on every authed request that captures an event.
  // Before this fix, nothing redacted event.request.headers.authorization
  // and this assertion FAILED (the literal token passed through unchanged);
  // after adding the redaction it PASSES.
  it('redacts the authorization header from event.request.headers', () => {
    const event = {
      request: {
        url: 'https://api.example.com/v1/sessions',
        headers: {
          authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.sig',
          'user-agent': 'MentoMate/1.0',
        },
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.headers?.authorization).toBeUndefined();
    expect(scrubbed.request?.headers?.['user-agent']).toBe('MentoMate/1.0');
  });

  // Case-insensitive: the SDK/runtime may not always lowercase header keys.
  it('redacts a differently-cased Authorization header key', () => {
    const event = {
      request: {
        headers: { Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.sig' },
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.headers?.Authorization).toBeUndefined();
  });

  // [WI-2353] AC#4 regression guard: the SDK already withholds the cookie
  // header by default (sendDefaultPii: false) — confirm the authorization
  // redaction above does not disturb that existing behavior.
  it('leaves an already-absent cookie header absent (no regression)', () => {
    const event = {
      request: {
        headers: {
          authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.sig',
          'user-agent': 'MentoMate/1.0',
        },
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.headers?.cookie).toBeUndefined();
    expect(scrubbed.request?.headers?.['user-agent']).toBe('MentoMate/1.0');
  });

  it('leaves an event with no request.headers unchanged', () => {
    const event = {
      request: { url: 'https://api.example.com/v1/sessions' },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request).toEqual({
      url: 'https://api.example.com/v1/sessions',
    });
  });
});

// ---------------------------------------------------------------------------
// dropConsoleBreadcrumb [WI-1990 rework] — beforeBreadcrumb console-vector guard
// ---------------------------------------------------------------------------

describe('dropConsoleBreadcrumb', () => {
  // [WI-1990 rework] Red-green regression for the independent-re-audit finding
  // the first sweep missed: @sentry/cloudflare's default `consoleIntegration()`
  // turns every `console.*` call into a breadcrumb, and this app's
  // `services/logger.ts` does `console.warn(JSON.stringify(entry))` — so a
  // structured log entry carrying a raw-LLM-output field (e.g. `chunk` from
  // `services/llm/providers/openai.ts`'s "malformed SSE chunk discarded"
  // warning) lands as an opaque STRING inside `breadcrumb.message` and
  // `breadcrumb.data.arguments[0]`, bypassing the key-based `scrubSentryEvent`
  // denylist entirely (a denylist can strip a keyed field, not grep inside a
  // string). This reproduces the ACTUAL shape `consoleIntegration()` produces
  // (see @sentry/core's `addConsoleBreadcrumb`): `category: 'console'`,
  // string `message`, and `data.arguments: [<raw args>]`. Before
  // `dropConsoleBreadcrumb` existed, nothing dropped this breadcrumb and it
  // reached Sentry unchanged (this assertion FAILS if the function is a
  // passthrough); after wiring it as `beforeBreadcrumb`, every `category:
  // 'console'` breadcrumb is dropped regardless of what content it carries
  // (this assertion PASSES).
  it('drops the exact breadcrumb shape produced by consoleIntegration() for a console.warn(JSON.stringify(logEntry)) call', () => {
    const rawLogEntryJson = JSON.stringify({
      timestamp: '2026-07-17T12:00:00.000Z',
      level: 'warn',
      message: '[llm:openai] malformed SSE chunk discarded',
      context: {
        event: 'openai.sse.malformed',
        // The exact leak shape: a raw-LLM-output field embedded inside the
        // JSON-stringified log entry, which is itself embedded inside the
        // breadcrumb's message/arguments strings.
        chunk: 'data: {"delta":"...the learner said their dad is in the...',
      },
    });

    // Real @sentry/core consoleIntegration() breadcrumb shape — see
    // node_modules/.../@sentry/core/build/esm/integrations/console.js
    // addConsoleBreadcrumb().
    const consoleBreadcrumb: Sentry.Breadcrumb = {
      category: 'console',
      level: 'warning',
      message: rawLogEntryJson,
      data: {
        arguments: [rawLogEntryJson],
        logger: 'console',
      },
    };

    const result = dropConsoleBreadcrumb(consoleBreadcrumb);

    expect(result).toBeNull();
  });

  it('leaves non-console breadcrumbs (e.g. addBreadcrumb() call sites) untouched', () => {
    const breadcrumb: Sentry.Breadcrumb = {
      category: 'idempotency',
      level: 'info',
      message: 'idempotency preflight skipped: profile missing',
    };

    const result = dropConsoleBreadcrumb(breadcrumb);

    expect(result).toBe(breadcrumb);
  });

  it('leaves a breadcrumb with no category untouched', () => {
    const breadcrumb: Sentry.Breadcrumb = { message: 'no category set' };

    const result = dropConsoleBreadcrumb(breadcrumb);

    expect(result).toBe(breadcrumb);
  });
});
