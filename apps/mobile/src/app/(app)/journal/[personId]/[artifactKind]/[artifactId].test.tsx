import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import type { ScopeDescriptor, SharedRecord } from '@eduagent/schemas';

import {
  cleanupScreen,
  createScreenWrapper,
  createTestProfile,
} from '../../../../../test-utils/screen-render';
import {
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../../../../test-utils/mock-api-routes';

jest.mock(
  'react-i18next',
  () => require('../../../../../test-utils/mock-i18n').i18nMock,
);

const PERSON_ID = '550e8400-e29b-41d4-a716-446655440101';
const EDGE_ID = '550e8400-e29b-41d4-a716-446655440201';
const ARTIFACT_ID = '550e8400-e29b-41d4-a716-446655440301';

const PERSON_SCOPE: Extract<ScopeDescriptor, { kind: 'person' }> = {
  kind: 'person',
  personId: PERSON_ID,
  edgeId: EDGE_ID,
  displayName: 'Emma',
};

let mockParams: {
  personId?: string | string[];
  artifactKind?: string | string[];
  artifactId?: string | string[];
};
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));

const mockSetActiveScope = jest.fn();
let mockAvailableScopes: ScopeDescriptor[];
let mockScopesLoading: boolean;

jest.mock(
  '../../../../../lib/scope-context' /* gc1-allow: route test must hold the query-backed scope in unresolved-loading and revoked-edge states; the real provider cannot deterministically expose those states without coupling this route test to persistence and scope-query timing */,
  () => ({
    useScopeContext: () => ({
      activeScope: { kind: 'supporter-hub' },
      availableScopes: mockAvailableScopes,
      isLoading: mockScopesLoading,
      setActiveScope: mockSetActiveScope,
    }),
  }),
);

let mockFetch: RoutedMockFetch;

jest.mock(
  '../../../../../lib/api-client' /* gc1-allow: Clerk useAuth() external boundary; route test exercises the real query and shared schema */,
  () => {
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../../../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return mockApiClientFactory(mockFetch);
  },
);

const RECORD: SharedRecord = {
  supportershipId: EDGE_ID,
  generatedAt: '2026-07-30T12:00:00.000Z',
  factIds: [`weekly-report:${ARTIFACT_ID}`],
  supporterView: {
    audience: 'supporter',
    factIds: [`weekly-report:${ARTIFACT_ID}`],
    headline: 'Emma has 1 shareable update.',
    facts: [
      {
        id: `weekly-report:${ARTIFACT_ID}`,
        kind: 'observable_engagement',
        title: 'Weekly report 2026-07-20 Sessions this week: 4',
        detail: 'Up from 2 last week',
        occurredAt: '2026-07-27T12:00:00.000Z',
        source: 'weekly_report_summary',
        artifact: { kind: 'weekly_report', id: ARTIFACT_ID },
      },
    ],
  },
  supporteeView: {
    audience: 'supportee',
    factIds: [`weekly-report:${ARTIFACT_ID}`],
    headline: 'Your supporter can see 1 shareable update.',
    facts: [
      {
        id: `weekly-report:${ARTIFACT_ID}`,
        kind: 'observable_engagement',
        title: 'Weekly report 2026-07-20 Sessions this week: 4',
        detail: 'Up from 2 last week',
        occurredAt: '2026-07-27T12:00:00.000Z',
        source: 'weekly_report_summary',
        artifact: { kind: 'weekly_report', id: ARTIFACT_ID },
      },
    ],
  },
};

const PersonJournalArtifactScreen = require('./[artifactId]').default;

function renderScreen(initialRecord?: SharedRecord): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (initialRecord) {
    queryClient.setQueryData(
      [
        'visibility-shared-artifact',
        PERSON_ID,
        EDGE_ID,
        'weekly_report',
        ARTIFACT_ID,
      ],
      initialRecord,
    );
  }
  const { wrapper } = createScreenWrapper({
    activeProfile: createTestProfile(),
    profiles: [createTestProfile()],
    queryClient,
  });
  render(<PersonJournalArtifactScreen />, { wrapper });
  return queryClient;
}

describe('PersonJournalArtifactScreen', () => {
  let queryClient: QueryClient | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {
      personId: PERSON_ID,
      artifactKind: 'weekly_report',
      artifactId: ARTIFACT_ID,
    };
    mockAvailableScopes = [PERSON_SCOPE];
    mockScopesLoading = false;
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/artifacts/weekly_report/${ARTIFACT_ID}`,
      RECORD,
    );
  });

  afterEach(() => {
    cleanupScreen(queryClient);
    queryClient = undefined;
  });

  it('loads the durable artifact through the accepted shared-record endpoint', async () => {
    queryClient = renderScreen();

    screen.getByTestId('person-journal-artifact-loading');
    await waitFor(() => {
      screen.getByTestId(
        `person-journal-artifact-weekly_report-${ARTIFACT_ID}`,
      );
    });

    screen.getByText('Weekly report 2026-07-20 Sessions this week: 4');
    screen.getByText('Up from 2 last week');
    expect(mockSetActiveScope).toHaveBeenCalledWith(PERSON_SCOPE);
    expect(
      fetchCallsMatching(
        mockFetch,
        `/visibility/reports/${PERSON_ID}/artifacts/weekly_report/${ARTIFACT_ID}`,
      ),
    ).toHaveLength(1);
  });

  it('shows an explicit stale-link state when the persisted artifact disappeared', async () => {
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/artifacts/weekly_report/${ARTIFACT_ID}`,
      {
        ...RECORD,
        factIds: [],
        supporterView: {
          ...RECORD.supporterView,
          factIds: [],
          facts: [],
        },
        supporteeView: {
          ...RECORD.supporteeView,
          factIds: [],
          facts: [],
        },
      },
    );

    queryClient = renderScreen(RECORD);

    await waitFor(() => {
      screen.getByTestId('person-journal-artifact-stale');
    });
    screen.getByText('This report is no longer available');
    expect(screen.queryByText('Recap not found')).toBeNull();
    expect(
      screen.queryByTestId(
        `person-journal-artifact-weekly_report-${ARTIFACT_ID}`,
      ),
    ).toBeNull();
  });

  it('fails closed without a request when the person is no longer in authorized scopes', () => {
    mockAvailableScopes = [{ kind: 'supporter-hub' }];

    queryClient = renderScreen();

    screen.getByTestId('person-journal-artifact-stale');
    expect(
      fetchCallsMatching(
        mockFetch,
        `/visibility/reports/${PERSON_ID}/artifacts/weekly_report/${ARTIFACT_ID}`,
      ),
    ).toHaveLength(0);
  });

  it('keeps the deep link loading while authorized scopes are unresolved', () => {
    mockAvailableScopes = [];
    mockScopesLoading = true;

    queryClient = renderScreen();

    screen.getByTestId('person-journal-artifact-loading');
    expect(screen.queryByTestId('person-journal-artifact-stale')).toBeNull();
    expect(
      fetchCallsMatching(
        mockFetch,
        `/visibility/reports/${PERSON_ID}/artifacts/weekly_report/${ARTIFACT_ID}`,
      ),
    ).toHaveLength(0);
  });

  it('turns a server-side relationship denial into the stale-link state', async () => {
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/artifacts/weekly_report/${ARTIFACT_ID}`,
      new Response(
        JSON.stringify({
          code: 'FORBIDDEN',
          message: 'This support link is not active.',
        }),
        { status: 403 },
      ),
    );

    queryClient = renderScreen(RECORD);

    await waitFor(() => {
      screen.getByTestId('person-journal-artifact-stale');
    });
    expect(screen.queryByTestId('person-journal-artifact-error')).toBeNull();
  });
  it('shows an explicit error instead of cached artifact data when refresh fails', async () => {
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/artifacts/weekly_report/${ARTIFACT_ID}`,
      new Response(
        JSON.stringify({
          code: 'INTERNAL_ERROR',
          message: 'Shared record refresh failed.',
        }),
        { status: 500 },
      ),
    );

    queryClient = renderScreen(RECORD);

    await waitFor(() => {
      screen.getByTestId('person-journal-artifact-error');
    });
    expect(
      screen.queryByTestId(
        `person-journal-artifact-weekly_report-${ARTIFACT_ID}`,
      ),
    ).toBeNull();
  });
});
