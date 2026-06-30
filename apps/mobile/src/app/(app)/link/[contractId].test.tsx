import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import {
  createRoutedMockFetch,
  extractJsonBody,
  fetchCallsMatching,
} from '../../../test-utils/mock-api-routes';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockActiveProfileId = '00000000-0000-4000-8000-000000000003';
const mockParams: Record<string, string> = {
  contractId: '00000000-0000-4000-8000-000000000001',
  supporteeName: 'Emma',
  supporterName: 'Zuzana',
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));

jest.mock( /* gc1-allow: route test controls active person identity for supporter/supportee branches */
  '../../../lib/profile',
  () => ({
    useProfile: () => ({
      activeProfile: { id: mockActiveProfileId },
    }),
  }),
);

const mockFetch = createRoutedMockFetch();

jest.mock( /* gc1-allow: transport-boundary test uses routed Hono fetch mock */
  '../../../lib/api-client',
  () => {
    const {
      mockApiClientFactory,
    } = require('../../../test-utils/mock-api-routes');
    return mockApiClientFactory(mockFetch);
  },
);

const CONTRACT = {
  id: '00000000-0000-4000-8000-000000000001',
  supportershipId: '00000000-0000-4000-8000-000000000002',
  supporterPersonId: '00000000-0000-4000-8000-000000000003',
  supporteePersonId: '00000000-0000-4000-8000-000000000004',
  relation: 'teacher' as const,
  status: 'pending' as const,
  contractVersion: 1,
  reportableKinds: ['mastery' as const, 'effort' as const],
  artifactWall: true as const,
  renderEquivalence: true as const,
  safetyException: true as const,
  supporterAcceptedAt: null,
  supporteeAcceptedAt: null,
  createdAt: '2026-06-20T12:00:00.000Z',
  updatedAt: '2026-06-20T12:00:00.000Z',
};

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const LinkContractScreen = require('./[contractId]').default;

  return render(
    <QueryClientProvider client={queryClient}>
      <LinkContractScreen />
    </QueryClientProvider>,
  );
}

describe('LinkContractScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    mockParams.contractId = CONTRACT.id;
    mockParams.supporteeName = 'Emma';
    mockParams.supporterName = 'Zuzana';
    mockActiveProfileId = CONTRACT.supporterPersonId;
  });

  it(
    'loads the visibility contract and accepts for the active side',
    async () => {
      mockFetch.setRoute(
        '/visibility/links/',
        (url: string, init?: RequestInit) => {
          if (url.endsWith('/contract')) return CONTRACT;
          if (url.endsWith('/accept')) {
            return {
              ...CONTRACT,
              supporterAcceptedAt: '2026-06-20T12:01:00.000Z',
            };
          }
          return new Response(JSON.stringify({}), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      );

      renderScreen();

      await screen.findByTestId('visibility-contract-card');
      screen.getByText('Visibility contract');
      screen.getByText('You are asking to support Emma.');
      screen.getByText('Private chats, notes and journal artifacts stay hidden.');

      fireEvent.press(screen.getByTestId('visibility-contract-accept'));

      await waitFor(() =>
        expect(fetchCallsMatching(mockFetch, '/accept')).toHaveLength(1),
      );
      const body = extractJsonBody<{ actorPersonId: string; audience: string }>(
        fetchCallsMatching(mockFetch, '/accept')[0]?.init,
      );
      expect(body).toEqual({
        actorPersonId: '00000000-0000-4000-8000-000000000003',
        audience: 'supporter',
      });
    },
    10_000,
  );

  it('shows review and revoke actions after both sides accepted', async () => {
    mockActiveProfileId = CONTRACT.supporteePersonId;
    mockFetch.setRoute('/visibility/links/', (url: string) => {
      if (url.endsWith('/contract')) {
        return {
          ...CONTRACT,
          status: 'accepted',
          supporterAcceptedAt: '2026-06-20T12:01:00.000Z',
          supporteeAcceptedAt: '2026-06-20T12:02:00.000Z',
        };
      }
      if (url.endsWith('/revoke')) {
        return {
          supportershipId: CONTRACT.supportershipId,
          supporteePersonId: CONTRACT.supporteePersonId,
          supporterPersonId: CONTRACT.supporterPersonId,
          revokedAt: '2026-06-20T12:03:00.000Z',
          graceEndsAt: '2026-06-27T12:03:00.000Z',
        };
      }
      return {};
    });

    renderScreen();

    await screen.findByTestId('visibility-link-review');
    expect(
      screen.getAllByText('You can review this agreement here any time.'),
    ).toHaveLength(2);

    fireEvent.press(screen.getByTestId('visibility-contract-revoke'));

    await waitFor(() =>
      expect(fetchCallsMatching(mockFetch, '/revoke')).toHaveLength(1),
    );
    const revokeCall = fetchCallsMatching(mockFetch, '/revoke')[0];
    expect(revokeCall?.url).toContain(CONTRACT.supportershipId);
    expect(revokeCall?.url).not.toContain(CONTRACT.id);
  });

  it('does not expose agreement actions to a non-party viewer', async () => {
    mockActiveProfileId = '00000000-0000-4000-8000-000000000099';
    mockFetch.setRoute('/visibility/links/', (url: string) => {
      if (url.endsWith('/contract')) {
        return {
          ...CONTRACT,
          status: 'accepted',
          supporterAcceptedAt: '2026-06-20T12:01:00.000Z',
          supporteeAcceptedAt: '2026-06-20T12:02:00.000Z',
        };
      }
      return {};
    });

    renderScreen();

    await screen.findByTestId('visibility-contract-card');

    expect(screen.queryByTestId('visibility-contract-accept')).toBeNull();
    expect(screen.queryByTestId('visibility-contract-revoke')).toBeNull();
  });
});
