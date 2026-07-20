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

  // [WI-2339 Gate-2 rework note] Still untouched under the generalized
  // redaction: this TypeError message uses SINGLE quotes ('foo'), and
  // QUOTED_SNIPPET_PATTERN only matches DOUBLE-quoted substrings — single
  // quotes are near-universally property/variable names in this shape, not
  // free text, so they are deliberately left intact for debuggability.
  it('leaves a single-quoted (non-PII-shaped) exception value untouched', () => {
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

  // [WI-2339 Gate-2 rework — AC-1] Red-green regression: the original fix
  // scoped quoted-snippet redaction to ONLY the JSON.parse SyntaxError
  // message shape (gated on isJsonParseSyntaxErrorMessage) — Gate-2 review
  // correctly flagged that AC-1 requires general event.exception coverage,
  // not just that one shape. Before this fix, a non-JSON-parse exception
  // whose message embeds a double-quoted free-text substring (e.g. a
  // validation error echoing a learner-entered field value) passed through
  // UNREDACTED and this assertion FAILED; after removing the JSON-parse-only
  // gate it PASSES.
  it('redacts a double-quoted substring from a general (non-JSON-parse) exception value', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'ValidationError',
            value:
              'Invalid value "my mom said we live at 123 Main St" for field homeworkAnswer',
          },
        ],
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    const redactedValue = scrubbed.exception?.values?.[0]?.value;
    expect(redactedValue).not.toContain('123 Main St');
    expect(redactedValue).toBe(
      'Invalid value "[redacted]" for field homeworkAnswer',
    );
  });

  // [WI-2339 Gate-2 rework — AC-1] Red-green regression: event.message (the
  // raw string passed to captureMessage()) was not scrubbed at all before
  // this fix — a call site passing free text there would have leaked it
  // unredacted, and this assertion FAILED; after applying the same
  // redactQuotedSnippets pass to event.message it PASSES.
  it('redacts a double-quoted substring from event.message', () => {
    const event = {
      message:
        'unexpected value "learner said their dad picks them up at 5pm" received',
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.message).not.toContain('dad picks them up');
    expect(scrubbed.message).toBe('unexpected value "[redacted]" received');
  });

  it('leaves an event.message with no quoted substring unchanged', () => {
    const event = {
      message: 'billing.trial_expiry_failed',
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.message).toBe('billing.trial_expiry_failed');
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

  // [WI-2339] Red-green regression: @sentry/cloudflare's requestDataIntegration
  // copies event.request.query_string verbatim regardless of sendDefaultPii
  // (unlike cookies/authorization) — verified empirically against the real
  // pipeline (sentry-request-pipeline.test.ts). Before this fix, nothing
  // stripped it and this assertion FAILED (the literal secret passed through
  // unchanged); after adding scrubRequestUrlFields it PASSES.
  it('strips event.request.query_string', () => {
    const event = {
      request: {
        url: 'https://api.example.com/v1/sessions?token=SECRET-abc123&foo=bar',
        query_string: 'token=SECRET-abc123&foo=bar',
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.query_string).not.toContain('SECRET-abc123');
    expect(scrubbed.request?.query_string).toBe('[stripped]');
  });

  it('strips the query segment of event.request.url, leaving the path intact', () => {
    const event = {
      request: {
        url: 'https://api.example.com/v1/sessions?token=SECRET-abc123',
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.url).not.toContain('SECRET-abc123');
    expect(scrubbed.request?.url).toBe(
      'https://api.example.com/v1/sessions?[stripped]',
    );
  });

  it('leaves event.request.url with no query string unchanged', () => {
    const event = {
      request: { url: 'https://api.example.com/v1/sessions' },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.url).toBe('https://api.example.com/v1/sessions');
  });

  it('leaves an empty event.request.query_string unchanged', () => {
    const event = {
      request: { url: 'https://api.example.com/v1/sessions', query_string: '' },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.query_string).toBe('');
  });

  // [Gate-2 SHOULD-FIX] Red-green regression: the SDK types
  // event.request.query_string as `string | Record<string, unknown> |
  // Array<[string, string]>`, not string-only. A `typeof === 'string'` guard
  // silently no-ops (passes the object/array forms through unscrubbed) for
  // exactly the future-shape this forward guard exists to pre-empt. Before
  // this fix, the object-shaped query_string below passed through with the
  // literal secret intact and this assertion FAILED; after switching to a
  // truthy check (strip wholesale regardless of type) it PASSES.
  it('strips a non-string (object-shaped) event.request.query_string', () => {
    const event = {
      request: {
        url: 'https://api.example.com/v1/sessions',
        query_string: { token: 'SECRET-abc123' },
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.query_string).toBe('[stripped]');
  });

  it('strips a non-string (array-shaped) event.request.query_string', () => {
    const event = {
      request: {
        url: 'https://api.example.com/v1/sessions',
        query_string: [['token', 'SECRET-abc123']],
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.query_string).toBe('[stripped]');
  });

  // [WI-2339 Gate-2 rework #2] Red-green regression for the reviewer's
  // repro: the FIRST rework denylist-scrubbed a plain-object request.data,
  // so a non-denylisted field (homeworkAnswer) survived unredacted — a
  // denylist is a curated list of KNOWN-bad keys, not a guarantee every
  // field of an arbitrary request body is safe, and SKILL.md's checklist
  // requires bodies to be stripped, not selectively filtered. Before this
  // fix, homeworkAnswer passed through unchanged and this assertion FAILED;
  // after wholesale-stripping request.data for every shape (object
  // included) it PASSES. Not populated by this app's SDK/runtime today (see
  // the WI's Risk/Impact: no free-text POST body reaches Sentry at
  // @sentry/cloudflare@10.39.0), so this is a unit test against
  // scrubSentryEvent directly rather than a real-pipeline test — the
  // pipeline cannot be made to populate this field to exercise it. Forward
  // guard for a future capture site or SDK upgrade that starts attaching it.
  it('strips event.request.data wholesale even when it is a plain object with no denylisted keys', () => {
    const event = {
      request: {
        url: 'https://api.example.com/v1/sessions',
        data: {
          homeworkAnswer: 'my mom said we live at 123 Main St',
          requestId: 'req-1',
        },
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.data).not.toHaveProperty('homeworkAnswer');
    expect(scrubbed.request?.data).not.toHaveProperty('requestId');
    expect(scrubbed.request?.data).toBe('[stripped]');
  });

  // [WI-2339 Gate-2 rework] Red-green regression: .agents/skills/tech/
  // sentry-scrubbing/SKILL.md's checklist requires beforeSend to strip
  // request bodies unconditionally. Before the first rework, a non-object
  // request.data (a raw string body) was left UNCHANGED and this assertion
  // FAILED (the literal secret passed through); after wholesale-stripping
  // any truthy body it PASSES.
  it('strips a string event.request.data wholesale', () => {
    const event = {
      request: {
        url: 'https://api.example.com/v1/sessions',
        data: 'raw text body containing SECRET-abc123',
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.data).not.toContain('SECRET-abc123');
    expect(scrubbed.request?.data).toBe('[stripped]');
  });

  it('leaves an absent event.request.data unchanged', () => {
    const event = {
      request: { url: 'https://api.example.com/v1/sessions' },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.data).toBeUndefined();
  });

  // [WI-2339] Red-green regression: the Fetch integration (active by default
  // on @sentry/cloudflare) records outbound fetch() calls as breadcrumbs
  // whose data.url carries the full URL, query string included. The `url`
  // key itself isn't PII-bearing, so PII_DENYLIST_KEYS never caught this —
  // only the query segment is the leak. Before this fix, nothing stripped
  // breadcrumb data.url and this assertion FAILED; after adding
  // scrubBreadcrumbUrl it PASSES.
  it('strips the query segment of a breadcrumb data.url, alongside existing key-based scrubbing', () => {
    const event = {
      breadcrumbs: [
        {
          category: 'fetch',
          data: {
            url: 'https://api.example.com/v1/billing?token=SECRET-abc123',
            jsonStrSample: 'raw llm text',
            method: 'GET',
          },
        },
      ],
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    const crumb = scrubbed.breadcrumbs?.[0];
    expect(crumb?.data?.url).not.toContain('SECRET-abc123');
    expect(crumb?.data?.url).toBe(
      'https://api.example.com/v1/billing?[stripped]',
    );
    expect(crumb?.data).not.toHaveProperty('jsonStrSample');
    expect(crumb?.data?.method).toBe('GET');
  });

  it('leaves a breadcrumb data.url with no query string unchanged', () => {
    const event = {
      breadcrumbs: [
        {
          category: 'fetch',
          data: { url: 'https://api.example.com/v1/billing', method: 'GET' },
        },
      ],
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.breadcrumbs?.[0]?.data?.url).toBe(
      'https://api.example.com/v1/billing',
    );
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
