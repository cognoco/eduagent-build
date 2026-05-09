import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import {
  useNotificationSettings,
  useLearningMode,
  useCelebrationLevel,
  useFamilyPoolBreakdownSharing,
  useUpdateNotificationSettings,
  useUpdateLearningMode,
  useUpdateCelebrationLevel,
  useUpdateFamilyPoolBreakdownSharing,
  useRegisterPushToken,
} from './use-settings';

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', {
      fetch: async (...args: unknown[]) => {
        const res = await mockFetch(...(args as Parameters<typeof fetch>));
        if (!res.ok) {
          const text = await res
            .clone()
            .text()
            .catch(() => res.statusText);
          throw new Error(`API error ${res.status}: ${text}`);
        }
        return res;
      },
    });
  },
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'test-profile-id', isOwner: true },
  }),
}));

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

// For optimistic-update tests: gcTime:0 evicts data before onMutate resolves
// (no active observers keep the entry alive). Use Infinity so pre-seeded data
// persists through the async cancelQueries tick inside onMutate.
function createPersistentWrapper() {
  const w = createQueryWrapper({
    queryClientOptions: {
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    },
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

describe('useNotificationSettings', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches notification settings from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          preferences: {
            reviewReminders: true,
            dailyReminders: false,
            pushEnabled: true,
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
      pushEnabled: true,
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

describe('useLearningMode', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches learning mode from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ mode: 'casual' }), { status: 200 }),
    );

    const { result } = renderHook(() => useLearningMode(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toBe('casual');
  });
});

describe('useCelebrationLevel', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls PUT with notification preferences', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          preferences: {
            reviewReminders: true,
            dailyReminders: true,
            pushEnabled: true,
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
        pushEnabled: true,
      });
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useUpdateLearningMode', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls PUT with learning mode', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ mode: 'casual' }), { status: 200 }),
    );

    const { result } = renderHook(() => useUpdateLearningMode(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync('casual');
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('optimistically updates learning mode while save is pending', async () => {
    let resolveSave!: () => void;
    mockFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveSave = () =>
          resolve(
            new Response(JSON.stringify({ mode: 'serious' }), { status: 200 }),
          );
      }),
    );

    const wrapper = createPersistentWrapper();
    queryClient.setQueryData(
      ['settings', 'learning-mode', 'test-profile-id'],
      'casual',
    );
    const { result } = renderHook(() => useUpdateLearningMode(), { wrapper });

    act(() => {
      result.current.mutate('serious');
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData([
          'settings',
          'learning-mode',
          'test-profile-id',
        ]),
      ).toBe('serious');
    });

    await act(async () => {
      resolveSave();
    });
  });

  it('rolls back optimistic learning mode on save failure', async () => {
    mockFetch.mockResolvedValueOnce(new Response('nope', { status: 500 }));

    const wrapper = createPersistentWrapper();
    queryClient.setQueryData(
      ['settings', 'learning-mode', 'test-profile-id'],
      'casual',
    );
    const { result } = renderHook(() => useUpdateLearningMode(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('serious')).rejects.toThrow();
    });

    expect(
      queryClient.getQueryData([
        'settings',
        'learning-mode',
        'test-profile-id',
      ]),
    ).toBe('casual');
  });
});

describe('useRegisterPushToken', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls POST with push token', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ registered: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useRegisterPushToken(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync('ExponentPushToken[abc123]');
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('useUpdateCelebrationLevel', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

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
