import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import {
  useSubscription,
  useUsage,
  useFamilySubscription,
  useJoinByokWaitlist,
  useRemoveFamilyProfile,
} from './use-subscription';
import {
  useCreateCheckout,
  useCancelSubscription,
  useCreatePortalSession,
  usePurchaseTopUp,
} from './use-subscription-stripe';

const mockFetch = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
}));

jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    // Pass raw Response through — matches production hc() behavior.
    // Each hook uses assertOk() to throw on non-OK responses.
    return hc('http://localhost', {
      fetch: async (...args: unknown[]) =>
        mockFetch(...(args as Parameters<typeof fetch>)),
    });
  },
}));

jest.mock('../lib/api', () => ({
  getApiUrl: () => 'http://localhost:8787',
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'test-profile-id' },
  }),
}));

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

// ---------------------------------------------------------------------------
// useSubscription
// ---------------------------------------------------------------------------

describe('useSubscription', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches subscription from GET /subscription', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subscription: {
            tier: 'plus',
            status: 'active',
            trialEndsAt: null,
            currentPeriodEnd: '2026-03-18T00:00:00Z',
            monthlyLimit: 700,
            usedThisMonth: 42,
            remainingQuestions: 658,
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.tier).toBe('plus');
    expect(result.current.data?.remainingQuestions).toBe(658);
  });

  it('returns free-tier defaults when no subscription', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subscription: {
            tier: 'free',
            status: 'active',
            trialEndsAt: null,
            currentPeriodEnd: null,
            monthlyLimit: 100,
            usedThisMonth: 0,
            remainingQuestions: 100,
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.tier).toBe('free');
    expect(result.current.data?.monthlyLimit).toBe(100);
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Network error', { status: 500 })
    );

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// useUsage
// ---------------------------------------------------------------------------

describe('useUsage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches usage from GET /usage', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          usage: {
            monthlyLimit: 500,
            usedThisMonth: 120,
            remainingQuestions: 380,
            topUpCreditsRemaining: 0,
            warningLevel: 'none',
            cycleResetAt: '2026-03-01T00:00:00Z',
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useUsage(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.warningLevel).toBe('none');
    expect(result.current.data?.remainingQuestions).toBe(380);
  });

  it('returns exceeded warning level', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          usage: {
            monthlyLimit: 100,
            usedThisMonth: 105,
            remainingQuestions: 0,
            topUpCreditsRemaining: 0,
            warningLevel: 'exceeded',
            cycleResetAt: '2026-03-01T00:00:00Z',
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useUsage(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.warningLevel).toBe('exceeded');
    expect(result.current.data?.remainingQuestions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// useFamilySubscription
// ---------------------------------------------------------------------------

describe('useFamilySubscription', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches family pool status from GET /subscription/family', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          family: {
            tier: 'family',
            monthlyLimit: 1500,
            usedThisMonth: 300,
            remainingQuestions: 1200,
            profileCount: 3,
            maxProfiles: 4,
            members: [
              {
                profileId: '550e8400-e29b-41d4-a716-446655440000',
                displayName: 'Parent',
                isOwner: true,
              },
            ],
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useFamilySubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.profileCount).toBe(3);
    expect(result.current.data?.maxProfiles).toBe(4);
  });

  it('returns null when the family endpoint responds 404 (non-throwing mock)', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

    const { result } = renderHook(() => useFamilySubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it('returns null when the family endpoint throws API error 404 (production api-client path)', async () => {
    // Simulate the production api-client throwing instead of returning a Response
    mockFetch.mockRejectedValueOnce(new Error('API error 404: Not Found'));

    const { result } = renderHook(() => useFamilySubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useRemoveFamilyProfile
// ---------------------------------------------------------------------------

describe('useRemoveFamilyProfile', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /subscription/family/remove with profileId', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Profile removed from family subscription',
          removedProfileId: '550e8400-e29b-41d4-a716-446655440000',
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useRemoveFamilyProfile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('550e8400-e29b-41d4-a716-446655440000');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/subscription/family/remove');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      profileId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.current.data?.removedProfileId).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('handles API error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Forbidden', {
        status: 403,
        statusText: 'Forbidden',
      })
    );

    const { result } = renderHook(() => useRemoveFamilyProfile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('550e8400-e29b-41d4-a716-446655440000');
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// useCreateCheckout
// ---------------------------------------------------------------------------

describe('useCreateCheckout', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /subscription/checkout with tier and interval', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          checkoutUrl: 'https://checkout.stripe.com/cs_test_123',
          sessionId: 'cs_test_123',
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useCreateCheckout(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ tier: 'plus', interval: 'monthly' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.checkoutUrl).toBe(
      'https://checkout.stripe.com/cs_test_123'
    );
  });
});

// ---------------------------------------------------------------------------
// useCancelSubscription
// ---------------------------------------------------------------------------

describe('useCancelSubscription', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /subscription/cancel', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message:
            'Subscription cancelled. Access continues until end of billing period.',
          currentPeriodEnd: '2026-03-18T00:00:00Z',
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useCancelSubscription(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.currentPeriodEnd).toBe('2026-03-18T00:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// useCreatePortalSession
// ---------------------------------------------------------------------------

describe('useCreatePortalSession', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /subscription/portal', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          portalUrl: 'https://billing.stripe.com/p/session_123',
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useCreatePortalSession(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.portalUrl).toBe(
      'https://billing.stripe.com/p/session_123'
    );
  });
});

// ---------------------------------------------------------------------------
// usePurchaseTopUp
// ---------------------------------------------------------------------------

describe('usePurchaseTopUp', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /subscription/top-up with amount 500', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          topUp: {
            amount: 500,
            clientSecret: 'pi_test_secret',
            paymentIntentId: 'pi_test_123',
          },
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => usePurchaseTopUp(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.topUp.amount).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// useJoinByokWaitlist
// ---------------------------------------------------------------------------

describe('useJoinByokWaitlist', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /byok-waitlist without email body (account email used server-side)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Added to BYOK waitlist',
          email: 'user@example.com',
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useJoinByokWaitlist(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.email).toBe('user@example.com');
  });

  it('handles API error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('API error 422', {
        status: 422,
        statusText: 'Unprocessable Entity',
      })
    );

    const { result } = renderHook(() => useJoinByokWaitlist(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
