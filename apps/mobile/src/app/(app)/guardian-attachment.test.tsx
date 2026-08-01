import { render, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GuardianAttachmentScreen from './guardian-attachment';
import { createRoutedMockFetch } from '../../test-utils/mock-api-routes';

const mockReplace = jest.fn();
const mockFetch = createRoutedMockFetch();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    chargePersonId: '22222222-2222-4222-8222-222222222222',
    verificationHandle: 'single-use-provider-handle',
  }),
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../../lib/api-client', () => ({
  ...jest.requireActual('../../lib/api-client'),
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
}));

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('GuardianAttachmentScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    mockFetch.setRoute('/consent/guardian-attachment/initiate', {
      authorityToken: 'server-minted-authority-token',
    });
    mockFetch.setRoute('/consent/guardian-attachment', {
      status: 'attached',
      consentSatisfied: true,
    });
  });

  it('runs verifier initiation before authority-token redemption', async () => {
    const screen = render(
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
        <GuardianAttachmentScreen />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('guardian-attachment-complete')).toBeTruthy();
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [initiateUrl, initiateInit] = mockFetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const [attachUrl, attachInit] = mockFetch.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(initiateUrl).toContain('/consent/guardian-attachment/initiate');
    expect(JSON.parse(String(initiateInit.body))).toEqual({
      chargePersonId: '22222222-2222-4222-8222-222222222222',
      verificationHandle: 'single-use-provider-handle',
    });
    expect(attachUrl).toContain('/consent/guardian-attachment');
    expect(JSON.parse(String(attachInit.body))).toEqual({
      chargePersonId: '22222222-2222-4222-8222-222222222222',
      authorityToken: 'server-minted-authority-token',
    });
  });

  it('[WI-2986] retries the same opaque handle so the server can recover a committed token', async () => {
    let attempts = 0;
    mockFetch.setRoute('/consent/guardian-attachment/initiate', () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response(JSON.stringify({ error: 'response lost' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { authorityToken: 'recovered-authority-token' };
    });
    const screen = render(
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
        <GuardianAttachmentScreen />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('guardian-attachment-error')).toBeTruthy();
    });
    const user = userEvent.setup();
    await user.press(screen.getByTestId('guardian-attachment-retry'));
    await waitFor(() => {
      expect(screen.getByTestId('guardian-attachment-complete')).toBeTruthy();
    });

    const initiationBodies = mockFetch.mock.calls
      .filter(([url]) =>
        String(url).includes('/consent/guardian-attachment/initiate'),
      )
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(initiationBodies).toEqual([
      {
        chargePersonId: '22222222-2222-4222-8222-222222222222',
        verificationHandle: 'single-use-provider-handle',
      },
      {
        chargePersonId: '22222222-2222-4222-8222-222222222222',
        verificationHandle: 'single-use-provider-handle',
      },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
