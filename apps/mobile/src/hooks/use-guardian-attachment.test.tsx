import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { guardianAttachmentResultSchema } from '@eduagent/schemas';
import { useGuardianAttachment } from './use-guardian-attachment';
import { createRoutedMockFetch } from '../test-utils/mock-api-routes';

const mockFetch = createRoutedMockFetch();

jest.mock('../lib/api-client', () => ({
  ...jest.requireActual('../lib/api-client'),
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
}));

describe('useGuardianAttachment', () => {
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

  it('submits only the learner id and opaque authority assertion', async () => {
    const response = guardianAttachmentResultSchema.parse({
      status: 'attached',
      consentSatisfied: true,
    });
    mockFetch.setRoute('/consent/guardian-attachment', response);
    const { result } = renderHook(() => useGuardianAttachment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        chargePersonId: '22222222-2222-4222-8222-222222222222',
        authorityToken: 'opaque-vpc-assertion',
      });
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      chargePersonId: '22222222-2222-4222-8222-222222222222',
      authorityToken: 'opaque-vpc-assertion',
    });
  });

  it('does not retry a fail-closed authority rejection', async () => {
    mockFetch.setRoute(
      '/consent/guardian-attachment',
      new Response(
        JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'Guardian authority is not valid.',
          },
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const { result } = renderHook(() => useGuardianAttachment(), { wrapper });

    await expect(
      act(async () =>
        result.current.mutateAsync({
          chargePersonId: '22222222-2222-4222-8222-222222222222',
          authorityToken: 'denied-or-expired',
        }),
      ),
    ).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
