import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useGuardianAuthorityInitiation } from './use-guardian-authority-initiation';
import { createRoutedMockFetch } from '../test-utils/mock-api-routes';

const mockFetch = createRoutedMockFetch();

jest.mock('../lib/api-client', () => ({
  ...jest.requireActual('../lib/api-client'),
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
}));

describe('useGuardianAuthorityInitiation', () => {
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('redeems only the learner id and opaque provider handle', async () => {
    mockFetch.setRoute('/consent/guardian-attachment/initiate', {
      authorityToken: 'server-minted-authority-token',
    });
    const { result } = renderHook(() => useGuardianAuthorityInitiation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        chargePersonId: '22222222-2222-4222-8222-222222222222',
        verificationHandle: 'single-use-provider-handle',
      });
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/consent/guardian-attachment/initiate');
    expect(JSON.parse(String(init.body))).toEqual({
      chargePersonId: '22222222-2222-4222-8222-222222222222',
      verificationHandle: 'single-use-provider-handle',
    });
  });
});
