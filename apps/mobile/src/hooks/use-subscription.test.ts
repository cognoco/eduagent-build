import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId, setProxyMode } from '../lib/api-client';
import {
  useSubscription,
  useUsage,
  useFamilySubscription,
  useJoinByokWaitlist,
  useRemoveFamilyProfile,
} from './use-subscription';
import { NotFoundError } from '../lib/api-errors';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
}));

let queryClient: QueryClient;

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

beforeEach(() => {
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId('test-profile-id');
  setProxyMode(false);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  setActiveProfileId(undefined);
  setProxyMode(false);
});

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
            effectiveAccessTier: 'plus',
            billingAccess: 'current',
            status: 'active',
            trialEndsAt: null,
            currentPeriodEnd: '2026-03-18T00:00:00Z',
            cancelAtPeriodEnd: false,
            monthlyLimit: 700,
            usedThisMonth: 42,
            remainingQuestions: 658,
            dailyLimit: 50,
            usedToday: 3,
            dailyRemainingQuestions: 47,
          },
        }),
        { status: 200 },
      ),
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
            effectiveAccessTier: 'free',
            billingAccess: 'current',
            status: 'active',
            trialEndsAt: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            monthlyLimit: 100,
            usedThisMonth: 0,
            remainingQuestions: 100,
            dailyLimit: 10,
            usedToday: 0,
            dailyRemainingQuestions: 10,
          },
        }),
        { status: 200 },
      ),
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
      new Response('Network error', { status: 500 }),
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
            dailyLimit: 10,
            usedToday: 2,
            dailyRemainingQuestions: 8,
          },
        }),
        { status: 200 },
      ),
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
            dailyLimit: 10,
            usedToday: 10,
            dailyRemainingQuestions: 0,
          },
        }),
        { status: 200 },
      ),
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
        { status: 200 },
      ),
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

  it('returns null when the family endpoint throws NotFoundError (production api-client path)', async () => {
    // [BUG-160] The real api-client (api-client.ts:275) converts a 404 HTTP
    // response into a typed NotFoundError before returning to the queryFn.
    // The hook's catch block checks `instanceof NotFoundError` — this test
    // exercises that path using the actual api-client behaviour.
    mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

    const { result } = renderHook(() => useFamilySubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  // [BREAK] [BUG-160] String-matching on formatted error message is fragile —
  // if the formatter strips the "API error 404:" prefix or changes the
  // structure (e.g. localized), the hook stops recognising 404 and surfaces
  // it as a fatal error to the UI. Classifying on the raw NotFoundError type
  // is stable across formatter changes.
  it('[BREAK] does not classify by string match — a 404-like generic Error is treated as fatal, only NotFoundError returns null', async () => {
    // A plain Error whose message looks like a formatted 404 must NOT be
    // silently swallowed — only the typed NotFoundError thrown by api-client
    // is a "no family subscription" signal.
    mockFetch.mockRejectedValueOnce(new Error('Some other 404-shaped string'));

    const { result } = renderHook(() => useFamilySubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error).not.toBeInstanceOf(NotFoundError);
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
        { status: 200 },
      ),
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
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('handles API error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Forbidden', {
        status: 403,
        statusText: 'Forbidden',
      }),
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
        { status: 200 },
      ),
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
      }),
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
