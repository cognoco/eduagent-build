import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { createQueryWrapper } from '../test-utils/app-hook-test-utils';
import {
  useDeleteAccount,
  useCancelDeletion,
  useDeletionStatus,
  useExportData,
} from './use-account';

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
}));

let queryClient: QueryClient;

function createWrapper() {
  const w = createQueryWrapper();
  queryClient = w.queryClient;
  return w.wrapper;
}

describe('useDeleteAccount', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });
  afterEach(() => {
    queryClient?.clear();
  });

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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });
  afterEach(() => {
    queryClient?.clear();
  });

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
    mockFetch.mockReset();
    jest.clearAllMocks();
  });
  afterEach(() => {
    queryClient?.clear();
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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });
  afterEach(() => {
    queryClient?.clear();
  });

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
