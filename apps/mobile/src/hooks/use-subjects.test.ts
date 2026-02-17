import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSubjects } from './use-subjects';

const mockGet = jest.fn();

jest.mock('../lib/auth-api', () => ({
  useApi: () => ({ get: mockGet }),
  useApiGet: () => ({ get: mockGet }),
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

describe('useSubjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns subjects from API', async () => {
    mockGet.mockResolvedValue({
      subjects: [
        { id: 's1', name: 'Math', status: 'active' },
        { id: 's2', name: 'Science', status: 'active' },
      ],
    });

    const { result } = renderHook(() => useSubjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith('/subjects');
    expect(result.current.data).toEqual([
      { id: 's1', name: 'Math', status: 'active' },
      { id: 's2', name: 'Science', status: 'active' },
    ]);
  });

  it('returns empty array when API returns no subjects', async () => {
    mockGet.mockResolvedValue({ subjects: [] });

    const { result } = renderHook(() => useSubjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('handles API errors', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSubjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
