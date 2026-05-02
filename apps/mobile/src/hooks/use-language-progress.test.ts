import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLanguageProgress } from './use-language-progress';

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
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

describe('useLanguageProgress', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('fetches language progress for a subject', async () => {
    const progressData = {
      subjectId: 'sub-1',
      languageCode: 'es',
      pedagogyMode: 'four_strands',
      currentLevel: 'A1',
      currentSublevel: '2',
      currentMilestone: {
        milestoneId: 'milestone-1',
        milestoneTitle: 'Basic Greetings',
        currentLevel: 'A1',
        currentSublevel: '2',
        wordsMastered: 15,
        wordsTarget: 30,
        chunksMastered: 5,
        chunksTarget: 10,
        milestoneProgress: 0.5,
      },
      nextMilestone: {
        milestoneId: 'milestone-2',
        milestoneTitle: 'Daily Routines',
        level: 'A1',
        sublevel: '3',
      },
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(progressData), { status: 200 })
    );

    const { result } = renderHook(() => useLanguageProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.subjectId).toBe('sub-1');
    expect(result.current.data?.languageCode).toBe('es');
    expect(result.current.data?.currentLevel).toBe('A1');
    expect(result.current.data?.currentMilestone?.milestoneTitle).toBe(
      'Basic Greetings'
    );
    expect(result.current.data?.currentMilestone?.milestoneProgress).toBe(0.5);
    expect(result.current.data?.nextMilestone?.milestoneTitle).toBe(
      'Daily Routines'
    );
  });

  it('handles null milestones', async () => {
    const progressData = {
      subjectId: 'sub-1',
      languageCode: 'es',
      pedagogyMode: 'four_strands',
      currentLevel: null,
      currentSublevel: null,
      currentMilestone: null,
      nextMilestone: null,
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(progressData), { status: 200 })
    );

    const { result } = renderHook(() => useLanguageProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.currentLevel).toBeNull();
    expect(result.current.data?.currentMilestone).toBeNull();
    expect(result.current.data?.nextMilestone).toBeNull();
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal server error', { status: 500 })
    );

    const { result } = renderHook(() => useLanguageProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('uses correct query key with profile and subject', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subjectId: 'sub-1',
          languageCode: 'es',
          pedagogyMode: 'four_strands',
          currentLevel: 'A1',
          currentSublevel: '1',
          currentMilestone: null,
          nextMilestone: null,
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useLanguageProgress('sub-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify the query was stored under the expected key
    const cachedData = queryClient.getQueryData([
      'language-progress',
      'test-profile-id',
      'sub-1',
    ]);
    expect(cachedData).not.toBeNull();
  });
});
