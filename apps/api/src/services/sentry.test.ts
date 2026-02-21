import { captureException, addBreadcrumb } from './sentry';

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
