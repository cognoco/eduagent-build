import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProfiles } from './use-profiles';

const mockGet = jest.fn();

jest.mock('../lib/auth-api', () => ({
  useApi: () => ({ get: mockGet }),
}));

jest.mock('../lib/profile', () => ({}));

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

describe('useProfiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns profiles from API', async () => {
    const profiles = [
      {
        id: 'p1',
        accountId: 'a1',
        displayName: 'Alex',
        avatarUrl: null,
        birthDate: null,
        personaType: 'LEARNER' as const,
        isOwner: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'p2',
        accountId: 'a1',
        displayName: 'Sam',
        avatarUrl: null,
        birthDate: '2012-05-15',
        personaType: 'TEEN' as const,
        isOwner: false,
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ];

    mockGet.mockResolvedValue({ profiles });

    const { result } = renderHook(() => useProfiles(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/profiles');
    expect(result.current.data).toEqual(profiles);
  });

  it('returns empty array when no profiles exist', async () => {
    mockGet.mockResolvedValue({ profiles: [] });

    const { result } = renderHook(() => useProfiles(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('handles API errors', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useProfiles(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
