import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useDeleteAccount,
  useCancelDeletion,
  useDeletionStatus,
  useExportData,
} from './use-account';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
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

describe('useDeleteAccount', () => {
  it('calls POST /account/delete', async () => {
    const response = {
      message: 'Deletion scheduled',
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 }),
    );

    const { result } = renderHook(() => useDeleteAccount(), {
      wrapper: createWrapper(),
    });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync();
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(data!.gracePeriodEnds).toBe('2026-02-24T00:00:00.000Z');
  });

  it('throws when POST /account/delete returns non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'INTERNAL_ERROR',
          message: 'Unable to schedule deletion',
        }),
        { status: 500 },
      ),
    );

    const { result } = renderHook(() => useDeleteAccount(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(
        'Unable to schedule deletion',
      );
    });
  });
});

describe('useCancelDeletion', () => {
  it('calls POST /account/cancel-deletion', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Deletion cancelled' }), {
        status: 200,
      }),
    );

    const { result } = renderHook(() => useCancelDeletion(), {
      wrapper: createWrapper(),
    });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync();
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(data!.message).toBe('Deletion cancelled');
  });

  it('throws when POST /account/cancel-deletion returns non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'FORBIDDEN',
          message: 'Unable to cancel deletion',
        }),
        { status: 403 },
      ),
    );

    const { result } = renderHook(() => useCancelDeletion(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(
        'Unable to cancel deletion',
      );
    });
  });
});

describe('useDeletionStatus', () => {
  beforeEach(() => {
    // useDeletionStatus is gated on !!isSignedIn — ensure the global mock
    // exposes isSignedIn:true so the query is enabled in each test.
    const clerkMock = jest.requireMock('@clerk/expo') as {
      useAuth: jest.Mock;
    };
    clerkMock.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_A',
      getToken: jest.fn().mockResolvedValue('mock-token'),
    });
  });

  it('calls GET /account/deletion-status', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          scheduled: true,
          deletionScheduledAt: '2026-02-17T00:00:00.000Z',
          gracePeriodEnds: '2026-02-24T00:00:00.000Z',
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useDeletionStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.scheduled).toBe(true);
    expect(result.current.data?.gracePeriodEnds).toBe(
      '2026-02-24T00:00:00.000Z',
    );
  });

  // [BREAK] [BUG-126 / BUG-159] Cross-account leak: User A's deletion-status
  // cache must NOT be served to User B on the same QueryClient. Without
  // userId in the key, the second render would return User A's cached data
  // and skip the fetch entirely. With userId-scoped keys, User B gets a fresh
  // fetch and User A's "scheduled: true" status never leaks across sign-out.
  it('[BREAK] does not serve user A deletion-status to user B (cross-account leak)', async () => {
    const clerkMock = jest.requireMock('@clerk/expo') as {
      useAuth: jest.Mock;
    };
    clerkMock.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_A',
      getToken: jest.fn().mockResolvedValue('mock-token'),
    });
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          scheduled: true,
          deletionScheduledAt: '2026-02-17T00:00:00.000Z',
          gracePeriodEnds: '2026-02-24T00:00:00.000Z',
        }),
        { status: 200 },
      ),
    );

    const wrapper = createWrapper();
    const userARender = renderHook(() => useDeletionStatus(), { wrapper });

    await waitFor(() => {
      expect(userARender.result.current.isSuccess).toBe(true);
    });
    expect(userARender.result.current.data?.scheduled).toBe(true);

    // Switch identity (e.g. sign-out + new sign-in on shared device) WITHOUT
    // clearing the QueryClient — simulates the leak window.
    clerkMock.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_B',
      getToken: jest.fn().mockResolvedValue('mock-token'),
    });
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          scheduled: false,
          deletionScheduledAt: null,
          gracePeriodEnds: null,
        }),
        { status: 200 },
      ),
    );

    const userBRender = renderHook(() => useDeletionStatus(), { wrapper });

    await waitFor(() => {
      expect(userBRender.result.current.isSuccess).toBe(true);
    });

    // User B MUST get their own fetched data, not User A's cached scheduled=true.
    expect(userBRender.result.current.data?.scheduled).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('surfaces errors when GET /account/deletion-status returns non-2xx', async () => {
    mockFetch.mockImplementation(
      () =>
        new Response(
          JSON.stringify({
            code: 'INTERNAL_ERROR',
            message: 'Unable to load deletion status',
          }),
          { status: 500 },
        ),
    );

    const { result } = renderHook(() => useDeletionStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toBe(
      'Unable to load deletion status',
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('useExportData', () => {
  it('calls GET /account/export', async () => {
    const exportData = {
      account: { email: 'user@example.com', createdAt: '2026-01-01T00:00:00Z' },
      profiles: [],
      consentStates: [],
      exportedAt: '2026-02-17T00:00:00Z',
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(exportData), { status: 200 }),
    );

    const { result } = renderHook(() => useExportData(), {
      wrapper: createWrapper(),
    });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync();
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(typeof data!.exportedAt).toBe('string');
  });

  it('throws when GET /account/export returns non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'INTERNAL_ERROR',
          message: 'Unable to export data',
        }),
        { status: 500 },
      ),
    );

    const { result } = renderHook(() => useExportData(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(
        'Unable to export data',
      );
    });
  });
});
