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
import { PersonScopeJournalPlaceholder } from './PersonScopeJournalPlaceholder';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

let mockFetch: RoutedMockFetch;

jest.mock(
  // gc1-allow: Clerk useAuth() external boundary; component test exercises real query + schema parsing over a routed Hono client
  '../../lib/api-client',
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

function renderWithProfile(ui: React.ReactElement): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { wrapper } = createScreenWrapper({
    activeProfile: createTestProfile(),
    profiles: [createTestProfile()],
    queryClient,
  });
  render(ui, { wrapper });
  return queryClient;
}

describe('PersonScopeJournalPlaceholder', () => {
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
    queryClient = renderWithProfile(
      <PersonScopeJournalPlaceholder scope={EMMA_SCOPE} />,
    );

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

  it('shows a visual empty state when the fetched record has no facts', async () => {
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      EMPTY_SHARED_RECORD,
    );

    queryClient = renderWithProfile(
      <PersonScopeJournalPlaceholder scope={EMMA_SCOPE} />,
    );

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

    queryClient = renderWithProfile(
      <PersonScopeJournalPlaceholder scope={EMMA_SCOPE} />,
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
