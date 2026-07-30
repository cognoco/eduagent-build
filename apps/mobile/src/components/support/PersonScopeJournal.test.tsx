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
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../test-utils/mock-api-routes';
import { PersonScopeJournal } from './PersonScopeJournal';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

let mockFetch: RoutedMockFetch;
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../lib/api-client' /* gc1-allow: Clerk useAuth() external boundary; component test exercises real query + schema parsing over a routed Hono client */,
  () => {
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return mockApiClientFactory(mockFetch);
  },
);

const PERSON_ID = '550e8400-e29b-41d4-a716-446655440101';
const EDGE_ID = '550e8400-e29b-41d4-a716-446655440201';

const EMMA_SCOPE: Extract<ScopeDescriptor, { kind: 'person' }> = {
  kind: 'person',
  personId: PERSON_ID,
  edgeId: EDGE_ID,
  displayName: 'Emma',
};

const NOAH_PERSON_ID = '550e8400-e29b-41d4-a716-446655440102';
const NOAH_EDGE_ID = '550e8400-e29b-41d4-a716-446655440202';

const NOAH_SCOPE: Extract<ScopeDescriptor, { kind: 'person' }> = {
  kind: 'person',
  personId: NOAH_PERSON_ID,
  edgeId: NOAH_EDGE_ID,
  displayName: 'Noah',
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
        kind: 'mastery',
        title: 'Knows equivalent fractions',
        detail: 'Answered the check without hints.',
        source: 'assessment',
        artifact: {
          kind: 'weekly_report',
          id: '550e8400-e29b-41d4-a716-446655440301',
        },
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
        kind: 'mastery',
        title: 'Knows equivalent fractions',
        detail: 'Answered the check without hints.',
        source: 'assessment',
        artifact: {
          kind: 'weekly_report',
          id: '550e8400-e29b-41d4-a716-446655440301',
        },
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
      mutations: { retry: false, gcTime: 0 },
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

describe('PersonScopeJournal', () => {
  let queryClient: QueryClient | undefined;

  afterEach(() => {
    cleanupScreen(queryClient);
    queryClient = undefined;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      SHARED_RECORD,
    );
  });

  it('renders the fetched shared record for the active person scope', async () => {
    queryClient = renderWithProfile(<PersonScopeJournal scope={EMMA_SCOPE} />);

    await waitFor(() => {
      screen.getByText('Emma has 1 shareable update.');
    });

    screen.getByText('Knows equivalent fractions');
    screen.getByText('Answered the check without hints.');
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
            title: 'Session recap ready',
            detail: 'Legacy recap detail',
            metadata: {
              templateKey: 'sessionRecap',
              sessionDate: '2026-06-28T12:00:00.000Z',
            },
          },
        ],
      },
    });
    queryClient = renderWithProfile(<PersonScopeJournal scope={EMMA_SCOPE} />);

    await waitFor(() => screen.getByText('Session recap ready'));
    expect(screen.queryByText('Legacy recap detail')).toBeNull();
  });

  it('deep-links a durable artifact inside the selected person Journal', async () => {
    queryClient = renderWithProfile(<PersonScopeJournal scope={EMMA_SCOPE} />);

    await waitFor(() => {
      screen.getByTestId(
        'journal-artifact-weekly_report-550e8400-e29b-41d4-a716-446655440301',
      );
    });

    fireEvent.press(
      screen.getByTestId(
        'journal-artifact-weekly_report-550e8400-e29b-41d4-a716-446655440301',
      ),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/journal/[personId]/[artifactKind]/[artifactId]',
      params: {
        personId: PERSON_ID,
        artifactKind: 'weekly_report',
        artifactId: '550e8400-e29b-41d4-a716-446655440301',
      },
    });
  });

  it('shows a visual empty state when the fetched record has no facts', async () => {
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      EMPTY_SHARED_RECORD,
    );

    queryClient = renderWithProfile(<PersonScopeJournal scope={EMMA_SCOPE} />);

    await waitFor(() => {
      screen.getByTestId('person-scope-journal-empty-lamp', {
        includeHiddenElements: true,
      });
    });

    screen.getByTestId('person-scope-journal-empty-pen', {
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

  it('shows a refresh error instead of cached person Journal data', async () => {
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      new Response(JSON.stringify({ message: 'nope' }), { status: 500 }),
    );

    queryClient = renderWithProfile(
      <PersonScopeJournal scope={EMMA_SCOPE} />,
      SHARED_RECORD,
    );

    await waitFor(() => {
      screen.getByTestId('visibility-shared-record-error');
    });
    expect(screen.queryByText('Knows equivalent fractions')).toBeNull();
  });

  it('requests the attention report when the appeal affordance is pressed', async () => {
    const APPEAL_REPORT: AppealReport = {
      supportershipId: EDGE_ID,
      generatedAt: '2026-07-01T12:00:00.000Z',
      report: 'Detailed attention report: Knows equivalent fractions.',
      facts: [],
      artifactWall: true,
    };
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/appeal`,
      APPEAL_REPORT,
    );

    queryClient = renderWithProfile(<PersonScopeJournal scope={EMMA_SCOPE} />);

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

  it('resets appeal state when the person scope changes without unmounting', async () => {
    const APPEAL_REPORT: AppealReport = {
      supportershipId: EDGE_ID,
      generatedAt: '2026-07-01T12:00:00.000Z',
      report: 'Detailed attention report: Knows equivalent fractions.',
      facts: [],
      artifactWall: true,
    };
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/appeal`,
      APPEAL_REPORT,
    );
    mockFetch.setRoute(`/visibility/reports/${NOAH_PERSON_ID}/shared-record`, {
      ...SHARED_RECORD,
      supportershipId: NOAH_EDGE_ID,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false, gcTime: 0 },
      },
    });
    const { wrapper } = createScreenWrapper({
      activeProfile: createTestProfile(),
      profiles: [createTestProfile()],
      queryClient,
    });
    const { rerender } = render(<PersonScopeJournal scope={EMMA_SCOPE} />, {
      wrapper,
    });

    await waitFor(() => {
      screen.getByTestId('visibility-appeal-button');
    });
    fireEvent.press(screen.getByTestId('visibility-appeal-button'));
    await waitFor(() => {
      screen.getByText(APPEAL_REPORT.report);
    });

    // Switch person scope without unmounting — the same component instance
    // stays mounted and just receives a new `scope` prop.
    rerender(<PersonScopeJournal scope={NOAH_SCOPE} />);

    await waitFor(() => {
      screen.getByTestId('visibility-appeal-button');
    });
    expect(screen.queryByText(APPEAL_REPORT.report)).toBeNull();

    cleanupScreen(queryClient);
  });
});
