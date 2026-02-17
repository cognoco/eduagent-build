import { renderHook } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useDeleteAccount,
  useCancelDeletion,
  useExportData,
} from './use-account';

const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock('../lib/auth-api', () => ({
  useApi: () => ({ post: mockPost, get: mockGet }),
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

describe('useDeleteAccount', () => {
  beforeEach(() => {
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
    mockPost.mockResolvedValue(response);

    const { result } = renderHook(() => useDeleteAccount(), {
      wrapper: createWrapper(),
    });

    const data = await result.current.mutateAsync();

    expect(mockPost).toHaveBeenCalledWith('/account/delete', {});
    expect(data.gracePeriodEnds).toBe('2026-02-24T00:00:00.000Z');
  });
});

describe('useCancelDeletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => {
    queryClient?.clear();
  });

  it('calls POST /account/cancel-deletion', async () => {
    mockPost.mockResolvedValue({ message: 'Deletion cancelled' });

    const { result } = renderHook(() => useCancelDeletion(), {
      wrapper: createWrapper(),
    });

    const data = await result.current.mutateAsync();

    expect(mockPost).toHaveBeenCalledWith('/account/cancel-deletion', {});
    expect(data.message).toBe('Deletion cancelled');
  });
});

describe('useExportData', () => {
  beforeEach(() => {
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
    mockGet.mockResolvedValue(exportData);

    const { result } = renderHook(() => useExportData(), {
      wrapper: createWrapper(),
    });

    const data = await result.current.mutateAsync();

    expect(mockGet).toHaveBeenCalledWith('/account/export');
    expect(data.exportedAt).toBeDefined();
  });
});
