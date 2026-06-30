import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useMyReports, useMyWeeklyReports } from './use-my-reports';

const mockFetch = jest.fn();

let queryClient: QueryClient;
const originalFetch = globalThis.fetch;

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

function getMockFetchUrl(callIndex = 0): string {
  const input = mockFetch.mock.calls[callIndex]?.[0] as RequestInfo | URL;
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function createWrapper(opts?: Parameters<typeof createHookWrapper>[0]) {
  const w = createHookWrapper(
    opts ?? { activeProfile: createTestProfile({ id: 'test-profile-id' }) },
  );
  queryClient = w.queryClient;
  return w.wrapper;
}

describe('useMyReports', () => {
  it('fetches monthly reports from /progress/reports for the active profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          reports: [
            {
              id: '550e8400-e29b-41d4-a716-446655440010',
              reportMonth: '2026-06',
              viewedAt: null,
              createdAt: '2026-06-01T00:00:00.000Z',
              headlineStat: {
                label: 'Sessions',
                value: 5,
                comparison: 'steady pace',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useMyReports(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.[0]?.id).toBe(
      '550e8400-e29b-41d4-a716-446655440010',
    );
    expect(getMockFetchUrl()).toContain('/progress/reports');
  });

  it('uses a self-scope-only query key (no mode dimension)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ reports: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useMyReports(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // The key must be exactly ['my-reports', 'monthly', profileId] — no mode segment.
    const cachedQuery = queryClient.getQueryCache().findAll({
      predicate: (query) =>
        JSON.stringify(query.queryKey) ===
        JSON.stringify(['my-reports', 'monthly', 'test-profile-id']),
    });
    expect(cachedQuery.length).toBe(1);
  });

  it('surfaces an error when the API returns a non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useMyReports(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('is disabled when there is no active profile', async () => {
    const { result } = renderHook(() => useMyReports(), {
      wrapper: createWrapper({ activeProfile: null }),
    });

    // enabled: false → query stays idle (no fetch, no error)
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useMyWeeklyReports', () => {
  it('fetches weekly reports from /progress/weekly-reports for the active profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          reports: [
            {
              id: '550e8400-e29b-41d4-a716-446655440020',
              reportWeek: '2026-W26',
              viewedAt: null,
              createdAt: '2026-06-28T00:00:00.000Z',
              headlineStat: {
                label: 'Topics explored',
                value: 3,
                comparison: '+1 vs last week',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useMyWeeklyReports(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.[0]?.id).toBe(
      '550e8400-e29b-41d4-a716-446655440020',
    );
    expect(getMockFetchUrl()).toContain('/progress/weekly-reports');
  });

  it('uses a self-scope-only query key (no mode dimension)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ reports: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useMyWeeklyReports(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // The key must be exactly ['my-reports', 'weekly', profileId] — no mode segment.
    const cachedQuery = queryClient.getQueryCache().findAll({
      predicate: (query) =>
        JSON.stringify(query.queryKey) ===
        JSON.stringify(['my-reports', 'weekly', 'test-profile-id']),
    });
    expect(cachedQuery.length).toBe(1);
  });

  it('surfaces an error when the API returns a non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useMyWeeklyReports(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('is disabled when there is no active profile', async () => {
    const { result } = renderHook(() => useMyWeeklyReports(), {
      wrapper: createWrapper({ activeProfile: null }),
    });

    // enabled: false → query stays idle (no fetch, no error)
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
