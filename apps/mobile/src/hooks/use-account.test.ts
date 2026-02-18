import { renderHook } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useDeleteAccount,
  useCancelDeletion,
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
      new Response(JSON.stringify(response), { status: 200 })
    );

    const { result } = renderHook(() => useDeleteAccount(), {
      wrapper: createWrapper(),
    });

    const data = await result.current.mutateAsync();

    expect(mockFetch).toHaveBeenCalled();
    expect(data.gracePeriodEnds).toBe('2026-02-24T00:00:00.000Z');
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
      })
    );

    const { result } = renderHook(() => useCancelDeletion(), {
      wrapper: createWrapper(),
    });

    const data = await result.current.mutateAsync();

    expect(mockFetch).toHaveBeenCalled();
    expect(data.message).toBe('Deletion cancelled');
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
      new Response(JSON.stringify(exportData), { status: 200 })
    );

    const { result } = renderHook(() => useExportData(), {
      wrapper: createWrapper(),
    });

    const data = await result.current.mutateAsync();

    expect(mockFetch).toHaveBeenCalled();
    expect(data.exportedAt).toBeDefined();
  });
});
