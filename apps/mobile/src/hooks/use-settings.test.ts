import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useNotificationSettings,
  useCelebrationLevel,
  useFamilyPoolBreakdownSharing,
  useUpdateNotificationSettings,
  useUpdateCelebrationLevel,
  useUpdateFamilyPoolBreakdownSharing,
  useRegisterPushToken,
} from './use-settings';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id', isOwner: true }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId('test-profile-id');
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('useNotificationSettings', () => {
  it('fetches notification settings from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          preferences: {
            reviewReminders: true,
            dailyReminders: false,
            weeklyProgressPush: true,
            weeklyProgressEmail: false,
            monthlyProgressEmail: true,
            pushEnabled: true,
            pushTokenRegistered: true,
            maxDailyPush: 5,
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useNotificationSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual({
      reviewReminders: true,
      dailyReminders: false,
      weeklyProgressPush: true,
      weeklyProgressEmail: false,
      monthlyProgressEmail: true,
      pushEnabled: true,
      pushTokenRegistered: true,
      maxDailyPush: 5,
    });
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Network error', { status: 500 }),
    );

    const { result } = renderHook(() => useNotificationSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useCelebrationLevel', () => {
  it('fetches celebration level from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ celebrationLevel: 'big_only' }), {
        status: 200,
      }),
    );

    const { result } = renderHook(() => useCelebrationLevel(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBe('big_only');
  });
});

describe('useFamilyPoolBreakdownSharing', () => {
  it('fetches family pool breakdown sharing from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ value: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useFamilyPoolBreakdownSharing(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBe(true);
  });
});

describe('useUpdateNotificationSettings', () => {
  it('calls PUT with notification preferences', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          preferences: {
            reviewReminders: true,
            dailyReminders: true,
            weeklyProgressPush: true,
            weeklyProgressEmail: false,
            monthlyProgressEmail: true,
            pushEnabled: true,
            pushTokenRegistered: false,
            maxDailyPush: 3,
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useUpdateNotificationSettings(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        reviewReminders: true,
        dailyReminders: true,
        weeklyProgressEmail: false,
        monthlyProgressEmail: true,
        pushEnabled: true,
      });
    });

    const headers = new Headers(
      (mockFetch.mock.calls[0]?.[1] as RequestInit | undefined)?.headers,
    );
    expect(headers.get('X-Profile-Id')).toBe('test-profile-id');
  });
});

describe('useRegisterPushToken', () => {
  it('calls POST with push token', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ registered: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useRegisterPushToken(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        profileId: 'test-profile-id',
        token: 'ExponentPushToken[abc123]',
      });
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('[WI-80] sends the captured profile id as an explicit request header', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ registered: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useRegisterPushToken(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        profileId: 'profile-captured',
        token: 'ExponentPushToken[abc123]',
      });
    });

    const headers = new Headers(
      (mockFetch.mock.calls[0]?.[1] as RequestInit | undefined)?.headers,
    );
    expect(headers.get('X-Profile-Id')).toBe('profile-captured');
  });
});

describe('useUpdateCelebrationLevel', () => {
  it('calls PUT with celebration level', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ celebrationLevel: 'off' }), {
        status: 200,
      }),
    );

    const { result } = renderHook(() => useUpdateCelebrationLevel(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync('off');
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useUpdateFamilyPoolBreakdownSharing', () => {
  it('calls PUT with the sharing value', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ value: true }), { status: 200 }),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateFamilyPoolBreakdownSharing(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [
        'settings',
        'family-pool-breakdown-sharing',
        'test-profile-id',
      ],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['usage', 'test-profile-id'],
    });
  });
});
