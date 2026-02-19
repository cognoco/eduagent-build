import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useDashboard,
  useChildDetail,
  useChildSubjectTopics,
} from './use-dashboard';

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

describe('useDashboard', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns dashboard data when children exist', async () => {
    const dashboardData = {
      children: [
        {
          id: 'child-1',
          displayName: 'Alice',
          subjects: [{ id: 's1', name: 'Math' }],
        },
      ],
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(dashboardData), { status: 200 })
    );

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(dashboardData);
  });

  it('fetches demo data when children array is empty', async () => {
    const emptyResponse = { children: [] };
    const demoData = {
      children: [{ id: 'demo-1', displayName: 'Demo Child', subjects: [] }],
    };

    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(emptyResponse), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(demoData), { status: 200 })
      );

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should have made two fetch calls: dashboard + demo
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(demoData);
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 })
    );

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('starts in loading state', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});

describe('useChildDetail', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns child detail data', async () => {
    const childData = {
      child: {
        profileId: 'child-1',
        displayName: 'Alice',
        summary: 'Alice is doing great',
        sessionsThisWeek: 5,
        sessionsLastWeek: 3,
        trend: 'up',
        subjects: [{ name: 'Math', retentionStatus: 'strong' }],
      },
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(childData), { status: 200 })
    );

    const { result } = renderHook(() => useChildDetail('child-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(childData.child);
  });

  it('does not fetch when childProfileId is undefined', () => {
    const { result } = renderHook(() => useChildDetail(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useChildSubjectTopics', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns topic progress data', async () => {
    const topicData = {
      topics: [
        {
          topicId: 't-1',
          title: 'Algebra',
          description: 'Basic algebra',
          completionStatus: 'in_progress',
          retentionStatus: 'strong',
          struggleStatus: 'normal',
          masteryScore: 0.7,
          summaryExcerpt: null,
          xpStatus: 'pending',
        },
      ],
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(topicData), { status: 200 })
    );

    const { result } = renderHook(
      () => useChildSubjectTopics('child-1', 'subject-1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(topicData.topics);
  });

  it('does not fetch when params are missing', () => {
    const { result } = renderHook(
      () => useChildSubjectTopics(undefined, undefined),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
