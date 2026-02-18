import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSubscription,
  useUsage,
  useCreateCheckout,
  useCancelSubscription,
  useCreatePortalSession,
  usePurchaseTopUp,
  useJoinByokWaitlist,
} from './use-subscription';

const mockFetch = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
}));

jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
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
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
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
            monthlyLimit: 500,
            usedThisMonth: 42,
            remainingQuestions: 458,
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
    expect(result.current.data?.remainingQuestions).toBe(458);
  });

  it('returns free-tier defaults when no subscription', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subscription: {
            tier: 'free',
            status: 'trial',
            trialEndsAt: null,
            currentPeriodEnd: null,
            monthlyLimit: 50,
            usedThisMonth: 0,
            remainingQuestions: 50,
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
    expect(result.current.data?.monthlyLimit).toBe(50);
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
            monthlyLimit: 50,
            usedThisMonth: 55,
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

  it('calls POST /byok-waitlist with email', async () => {
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
      result.current.mutate({ email: 'user@example.com' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.email).toBe('user@example.com');
  });

  it('handles validation error', async () => {
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
      result.current.mutate({ email: 'not-an-email' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
