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

jest.mock( /* gc1-allow: route test isolates fallback copy; formatter has direct unit coverage */
  '../../../lib/format-api-error',
  () => ({
    formatApiError: (error: Error) => error.message,
  }),
);

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockParams: Record<string, string> = {
  supporteePersonId: '00000000-0000-4000-8000-000000000004',
  supporteeName: 'Emma',
  relation: 'teacher',
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
}));

jest.mock( /* gc1-allow: route test controls active supporter person id */
  '../../../lib/profile',
  () => ({
    useProfile: () => ({
      activeProfile: { id: '00000000-0000-4000-8000-000000000003' },
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
  const NewLinkScreen = require('./new').default;

  return render(
    <QueryClientProvider client={queryClient}>
      <NewLinkScreen />
    </QueryClientProvider>,
  );
}

describe('NewLinkScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    mockParams.supporteePersonId = CONTRACT.supporteePersonId;
    mockParams.supporteeName = 'Emma';
    mockParams.relation = CONTRACT.relation;
  });

  it('initiates a visibility link from the active supporter', async () => {
    mockFetch.setRoute('/visibility/links', CONTRACT);

    renderScreen();

    screen.getByText('Start sharing request');
    fireEvent.press(screen.getByTestId('visibility-link-create'));

    await waitFor(() =>
      expect(fetchCallsMatching(mockFetch, '/visibility/links')).toHaveLength(
        1,
      ),
    );
    const body = extractJsonBody<{
      supporterPersonId: string;
      supporteePersonId: string;
      relation: string;
      managedTier: boolean;
    }>(fetchCallsMatching(mockFetch, '/visibility/links')[0]?.init);
    expect(body).toEqual({
      supporterPersonId: CONTRACT.supporterPersonId,
      supporteePersonId: CONTRACT.supporteePersonId,
      relation: CONTRACT.relation,
      managedTier: false,
    });
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/link/[contractId]',
      params: {
        contractId: CONTRACT.id,
        supporteeName: 'Emma',
      },
    });
  });
});
