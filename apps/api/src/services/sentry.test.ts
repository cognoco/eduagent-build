import { captureException, addBreadcrumb, scrubSentryEvent } from './sentry';

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
});
