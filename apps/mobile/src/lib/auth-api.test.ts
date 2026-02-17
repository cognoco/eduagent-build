import { renderHook } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useApi } from './auth-api';

jest.mock('./api', () => ({
  getApiUrl: () => 'http://localhost:8787',
}));

jest.mock('./profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'test-profile-id' },
  }),
}));

describe('useApi', () => {
  const mockGetToken = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      getToken: mockGetToken,
    });
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('get() injects Authorization and X-Profile-Id headers', async () => {
    mockGetToken.mockResolvedValue('test-jwt-token');

    const { result } = renderHook(() => useApi());
    await result.current.get('/health');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8787/v1/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-jwt-token',
          'X-Profile-Id': 'test-profile-id',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('get() omits Authorization when token is null', async () => {
    mockGetToken.mockResolvedValue(null);

    const { result } = renderHook(() => useApi());
    await result.current.get('/health');

    const callArgs = (globalThis.fetch as jest.Mock).mock.calls[0];
    const headers = callArgs[1].headers as Record<string, string>;
    expect(headers).not.toHaveProperty('Authorization');
  });

  it('get() throws with response body on error', async () => {
    mockGetToken.mockResolvedValue('test-jwt-token');
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('Not Found', { status: 404, statusText: 'Not Found' })
      );

    const { result } = renderHook(() => useApi());
    await expect(result.current.get('/missing')).rejects.toThrow(
      'API error 404: Not Found'
    );
  });

  it('post() sends JSON body with auth headers', async () => {
    mockGetToken.mockResolvedValue('test-jwt-token');

    const { result } = renderHook(() => useApi());
    await result.current.post('/profiles', { displayName: 'Test' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8787/v1/profiles',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ displayName: 'Test' }),
        headers: expect.objectContaining({
          Authorization: 'Bearer test-jwt-token',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('post() throws with response body on error', async () => {
    mockGetToken.mockResolvedValue('test-jwt-token');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"code":"VALIDATION","message":"Invalid input"}', {
        status: 400,
        statusText: 'Bad Request',
      })
    );

    const { result } = renderHook(() => useApi());
    await expect(
      result.current.post('/profiles', { displayName: '' })
    ).rejects.toThrow('API error 400:');
  });
});
