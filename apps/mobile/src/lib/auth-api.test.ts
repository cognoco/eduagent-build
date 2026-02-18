import { renderHook } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useApi, QuotaExceededError } from './auth-api';

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

  it('put() sends JSON body with PUT method and auth headers', async () => {
    mockGetToken.mockResolvedValue('test-jwt-token');

    const { result } = renderHook(() => useApi());
    await result.current.put('/settings/notifications', {
      pushEnabled: true,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8787/v1/settings/notifications',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ pushEnabled: true }),
        headers: expect.objectContaining({
          Authorization: 'Bearer test-jwt-token',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('put() throws with response body on error', async () => {
    mockGetToken.mockResolvedValue('test-jwt-token');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"code":"VALIDATION","message":"Invalid input"}', {
        status: 400,
        statusText: 'Bad Request',
      })
    );

    const { result } = renderHook(() => useApi());
    await expect(
      result.current.put('/settings/learning-mode', { mode: 'invalid' })
    ).rejects.toThrow('API error 400:');
  });

  it('post() throws QuotaExceededError on 402 with QUOTA_EXCEEDED body', async () => {
    mockGetToken.mockResolvedValue('test-jwt-token');
    const quotaBody = {
      code: 'QUOTA_EXCEEDED',
      message: 'Monthly quota exceeded. Upgrade your plan.',
      details: {
        tier: 'free',
        monthlyLimit: 50,
        usedThisMonth: 50,
        topUpCreditsRemaining: 0,
        upgradeOptions: [
          { tier: 'plus', monthlyQuota: 500, priceMonthly: 9.99 },
        ],
      },
    };
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(quotaBody), {
        status: 402,
        statusText: 'Payment Required',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { result } = renderHook(() => useApi());
    try {
      await result.current.post('/sessions/s1/messages', { message: 'hi' });
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(QuotaExceededError);
      const qErr = err as QuotaExceededError;
      expect(qErr.code).toBe('QUOTA_EXCEEDED');
      expect(qErr.details.tier).toBe('free');
      expect(qErr.details.monthlyLimit).toBe(50);
      expect(qErr.details.upgradeOptions).toHaveLength(1);
      expect(qErr.details.upgradeOptions[0].tier).toBe('plus');
    }
  });

  it('get() throws QuotaExceededError on 402 with QUOTA_EXCEEDED body', async () => {
    mockGetToken.mockResolvedValue('test-jwt-token');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'QUOTA_EXCEEDED',
          message: 'Quota exceeded',
          details: {
            tier: 'plus',
            monthlyLimit: 500,
            usedThisMonth: 500,
            topUpCreditsRemaining: 0,
            upgradeOptions: [],
          },
        }),
        { status: 402, statusText: 'Payment Required' }
      )
    );

    const { result } = renderHook(() => useApi());
    await expect(result.current.get('/some-path')).rejects.toThrow(
      QuotaExceededError
    );
  });

  it('throws generic error on 402 without QUOTA_EXCEEDED code', async () => {
    mockGetToken.mockResolvedValue('test-jwt-token');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Payment required', {
        status: 402,
        statusText: 'Payment Required',
      })
    );

    const { result } = renderHook(() => useApi());
    await expect(result.current.post('/test', {})).rejects.toThrow(
      'API error 402'
    );
  });
});
