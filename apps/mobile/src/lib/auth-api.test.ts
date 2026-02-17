import { renderHook } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useAuthenticatedApi } from './auth-api';

jest.mock('./api', () => ({
  getApiUrl: () => 'http://localhost:8787',
}));

jest.mock('hono/client', () => ({
  hc: (_url: string, opts: { fetch: typeof globalThis.fetch }) => {
    // Expose the custom fetch so tests can call it directly
    return { _customFetch: opts.fetch };
  },
}));

describe('useAuthenticatedApi', () => {
  const mockGetToken = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      getToken: mockGetToken,
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('injects Authorization header with Bearer token', async () => {
    mockGetToken.mockResolvedValue('test-jwt-token');

    const { result } = renderHook(() => useAuthenticatedApi());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customFetch = (result.current as any)
      ._customFetch as typeof globalThis.fetch;

    await customFetch('http://localhost:8787/v1/health', {});

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8787/v1/health',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );

    const callArgs = (globalThis.fetch as jest.Mock).mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-jwt-token');
  });

  it('omits Authorization header when token is null', async () => {
    mockGetToken.mockResolvedValue(null);

    const { result } = renderHook(() => useAuthenticatedApi());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customFetch = (result.current as any)
      ._customFetch as typeof globalThis.fetch;

    await customFetch('http://localhost:8787/v1/health', {});

    const callArgs = (globalThis.fetch as jest.Mock).mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.has('Authorization')).toBe(false);
  });
});
