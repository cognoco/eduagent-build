import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import type {
  AppealReport,
  ScopeDescriptor,
  SharedRecord,
} from '@eduagent/schemas';

import {
  cleanupScreen,
  createScreenWrapper,
  createTestProfile,
} from '../../test-utils/screen-render';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../test-utils/mock-api-routes';
import { SupportHubJournalTab } from './SupportHubJournalTab';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

let mockFetch: RoutedMockFetch;
let previousFetch: typeof globalThis.fetch;

const PERSON_ID = '550e8400-e29b-41d4-a716-446655440101';
const EDGE_ID = '550e8400-e29b-41d4-a716-446655440201';

const EMMA_SCOPE: Extract<ScopeDescriptor, { kind: 'person' }> = {
  kind: 'person',
  personId: PERSON_ID,
  edgeId: EDGE_ID,
  displayName: 'Emma',
};

const SHARED_RECORD: SharedRecord = {
  supportershipId: EDGE_ID,
  generatedAt: '2026-06-30T12:00:00.000Z',
  factIds: ['fact-1'],
  supporterView: {
    audience: 'supporter',
    factIds: ['fact-1'],
    headline: 'Emma has 1 shareable update.',
    facts: [
      {
        id: 'fact-1',
        kind: 'effort',
        title: 'Practiced fractions',
        detail: 'Completed the review set.',
        source: 'session',
      },
    ],
  },
  supporteeView: {
    audience: 'supportee',
    factIds: ['fact-1'],
    headline: 'Your supporter can see 1 shareable update.',
    facts: [
      {
        id: 'fact-1',
        kind: 'effort',
        title: 'Practiced fractions',
        detail: 'Completed the review set.',
        source: 'session',
      },
    ],
  },
};

const EMPTY_SHARED_RECORD: SharedRecord = {
  supportershipId: EDGE_ID,
  generatedAt: '2026-06-30T12:00:00.000Z',
  factIds: [],
  supporterView: {
    audience: 'supporter',
    factIds: [],
    headline: 'Emma has no shareable updates yet.',
    facts: [],
  },
  supporteeView: {
    audience: 'supportee',
    factIds: [],
    headline: 'No supporter-visible updates yet.',
    facts: [],
  },
};

function renderWithProfile(
  ui: React.ReactElement,
  initialRecord?: SharedRecord,
): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { gcTime: 0 },
    },
  });
  if (initialRecord) {
    queryClient.setQueryData(
      ['visibility-shared-record', PERSON_ID, EDGE_ID],
      initialRecord,
    );
  }
  const { wrapper } = createScreenWrapper({
    activeProfile: createTestProfile(),
    profiles: [createTestProfile()],
    queryClient,
  });
  render(ui, { wrapper });
  return queryClient;
}

describe('SupportHubJournalTab', () => {
  let queryClient: QueryClient | undefined;

  afterEach(() => {
    cleanupScreen(queryClient);
    queryClient = undefined;
    globalThis.fetch = previousFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    previousFetch = globalThis.fetch;
    mockFetch = createRoutedMockFetch();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      SHARED_RECORD,
    );
  });

  it('renders fetched shared-record facts for each person scope', async () => {
    queryClient = renderWithProfile(
      <SupportHubJournalTab personScopes={[EMMA_SCOPE]} />,
    );

    await waitFor(() => {
      screen.getByText('Emma has 1 shareable update.');
    });

    screen.getByText('Practiced fractions');
    screen.getByText('Completed the review set.');
    expect(
      fetchCallsMatching(
        mockFetch,
        `/visibility/reports/${PERSON_ID}/shared-record`,
      ),
    ).toHaveLength(1);
  });

  it('renders structured shared-record facts through the shared renderer', async () => {
    mockFetch.setRoute(`/visibility/reports/${PERSON_ID}/shared-record`, {
      ...SHARED_RECORD,
      supporterView: {
        ...SHARED_RECORD.supporterView,
        facts: [
          {
            ...SHARED_RECORD.supporterView.facts[0],
            title: 'Weekly report Topics explored: 3',
            detail: 'Legacy comparison',
            metadata: {
              templateKey: 'weeklyReport',
              stats: [{ metricKey: 'topicsExplored', value: 3 }],
            },
          },
        ],
      },
    });
    queryClient = renderWithProfile(
      <SupportHubJournalTab personScopes={[EMMA_SCOPE]} />,
    );

    await waitFor(() => screen.getByText('Weekly report'));
    screen.getByText('3 topics explored');
    expect(screen.queryByText('Legacy comparison')).toBeNull();
  });

  it('renders an honest empty journal state when the fetched record has no facts', async () => {
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      EMPTY_SHARED_RECORD,
    );

    queryClient = renderWithProfile(
      <SupportHubJournalTab personScopes={[EMMA_SCOPE]} />,
    );

    await waitFor(() => {
      screen.getByTestId(`support-hub-journal-empty-lamp-${PERSON_ID}`, {
        includeHiddenElements: true,
      });
    });

    screen.getByTestId(`support-hub-journal-empty-pen-${PERSON_ID}`, {
      includeHiddenElements: true,
    });
    screen.getByText('No shareable updates yet');
    screen.getByText(
      'When Emma finishes a session or report, updates shared with you will appear here.',
    );
    screen.getByText(
      'Private chats, notes, and mentor memory are not shown here.',
    );
    expect(screen.queryByText('No shared record yet')).toBeNull();
  });

  it('routes shared-record fetch failures through the shared error card', async () => {
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      new Response(JSON.stringify({ message: 'nope' }), { status: 500 }),
    );

    queryClient = renderWithProfile(
      <SupportHubJournalTab personScopes={[EMMA_SCOPE]} />,
    );

    await waitFor(() => {
      screen.getByTestId('visibility-shared-record-error');
    });
  });

  it('shows a refresh error instead of cached Support Hub data', async () => {
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      new Response(JSON.stringify({ message: 'nope' }), { status: 500 }),
    );

    queryClient = renderWithProfile(
      <SupportHubJournalTab personScopes={[EMMA_SCOPE]} />,
      SHARED_RECORD,
    );

    await waitFor(() => {
      screen.getByTestId('visibility-shared-record-error');
    });
    expect(screen.queryByText('Practiced fractions')).toBeNull();
  });

  it('requests the attention report when the appeal affordance is pressed', async () => {
    const APPEAL_REPORT: AppealReport = {
      supportershipId: EDGE_ID,
      generatedAt: '2026-07-01T12:00:00.000Z',
      report: 'Detailed attention report: Practiced fractions.',
      facts: [],
      artifactWall: true,
    };
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/appeal`,
      APPEAL_REPORT,
    );

    queryClient = renderWithProfile(
      <SupportHubJournalTab personScopes={[EMMA_SCOPE]} />,
    );

    await waitFor(() => {
      screen.getByTestId('visibility-appeal-button');
    });

    fireEvent.press(screen.getByTestId('visibility-appeal-button'));

    await waitFor(() => {
      screen.getByText(APPEAL_REPORT.report);
    });

    expect(
      fetchCallsMatching(mockFetch, `/visibility/reports/${PERSON_ID}/appeal`),
    ).toHaveLength(1);
  });
});
