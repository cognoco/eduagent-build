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

const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
}));

jest.mock('../lib/auth-api', () => ({
  useApi: () => ({ post: mockPost, get: mockGet }),
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
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches subscription from GET /subscription', async () => {
    mockGet.mockResolvedValue({
      subscription: {
        tier: 'plus',
        status: 'active',
        trialEndsAt: null,
        currentPeriodEnd: '2026-03-18T00:00:00Z',
        monthlyLimit: 500,
        usedThisMonth: 42,
        remainingQuestions: 458,
      },
    });

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/subscription');
    expect(result.current.data?.tier).toBe('plus');
    expect(result.current.data?.remainingQuestions).toBe(458);
  });

  it('returns free-tier defaults when no subscription', async () => {
    mockGet.mockResolvedValue({
      subscription: {
        tier: 'free',
        status: 'trial',
        trialEndsAt: null,
        currentPeriodEnd: null,
        monthlyLimit: 50,
        usedThisMonth: 0,
        remainingQuestions: 50,
      },
    });

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
    mockGet.mockRejectedValue(new Error('Network error'));

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
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches usage from GET /usage', async () => {
    mockGet.mockResolvedValue({
      usage: {
        monthlyLimit: 500,
        usedThisMonth: 120,
        remainingQuestions: 380,
        topUpCreditsRemaining: 0,
        warningLevel: 'none',
        cycleResetAt: '2026-03-01T00:00:00Z',
      },
    });

    const { result } = renderHook(() => useUsage(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/usage');
    expect(result.current.data?.warningLevel).toBe('none');
    expect(result.current.data?.remainingQuestions).toBe(380);
  });

  it('returns exceeded warning level', async () => {
    mockGet.mockResolvedValue({
      usage: {
        monthlyLimit: 50,
        usedThisMonth: 55,
        remainingQuestions: 0,
        topUpCreditsRemaining: 0,
        warningLevel: 'exceeded',
        cycleResetAt: '2026-03-01T00:00:00Z',
      },
    });

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
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /subscription/checkout with tier and interval', async () => {
    mockPost.mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.com/cs_test_123',
      sessionId: 'cs_test_123',
    });

    const { result } = renderHook(() => useCreateCheckout(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ tier: 'plus', interval: 'monthly' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith('/subscription/checkout', {
      tier: 'plus',
      interval: 'monthly',
    });
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
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /subscription/cancel', async () => {
    mockPost.mockResolvedValue({
      message:
        'Subscription cancelled. Access continues until end of billing period.',
      currentPeriodEnd: '2026-03-18T00:00:00Z',
    });

    const { result } = renderHook(() => useCancelSubscription(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith('/subscription/cancel', {});
    expect(result.current.data?.currentPeriodEnd).toBe('2026-03-18T00:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// useCreatePortalSession
// ---------------------------------------------------------------------------

describe('useCreatePortalSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /subscription/portal', async () => {
    mockPost.mockResolvedValue({
      portalUrl: 'https://billing.stripe.com/p/session_123',
    });

    const { result } = renderHook(() => useCreatePortalSession(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith('/subscription/portal', {});
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
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /subscription/top-up with amount 500', async () => {
    mockPost.mockResolvedValue({
      topUp: {
        amount: 500,
        clientSecret: 'pi_test_secret',
        paymentIntentId: 'pi_test_123',
      },
    });

    const { result } = renderHook(() => usePurchaseTopUp(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith('/subscription/top-up', {
      amount: 500,
    });
    expect(result.current.data?.topUp.amount).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// useJoinByokWaitlist
// ---------------------------------------------------------------------------

describe('useJoinByokWaitlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST /byok-waitlist with email', async () => {
    mockPost.mockResolvedValue({
      message: 'Added to BYOK waitlist',
      email: 'user@example.com',
    });

    const { result } = renderHook(() => useJoinByokWaitlist(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ email: 'user@example.com' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockPost).toHaveBeenCalledWith('/byok-waitlist', {
      email: 'user@example.com',
    });
    expect(result.current.data?.email).toBe('user@example.com');
  });

  it('handles validation error', async () => {
    mockPost.mockRejectedValue(new Error('API error 422'));

    const { result } = renderHook(() => useJoinByokWaitlist(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ email: 'not-an-email' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('API error 422');
  });
});
