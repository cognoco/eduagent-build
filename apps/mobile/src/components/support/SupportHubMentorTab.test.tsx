import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import type { ScopeDescriptor, SharedRecord } from '@eduagent/schemas';

import {
  cleanupScreen,
  createScreenWrapper,
  createTestProfile,
} from '../../test-utils/screen-render';
import {
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../test-utils/mock-api-routes';
import { SupportHubMentorTab } from './SupportHubMentorTab';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

let mockFetch: RoutedMockFetch;

jest.mock(
  '../../lib/api-client' /* gc1-allow: transport-boundary: Hono RPC client requires real HTTP transport */,
  () => {
    const actual = jest.requireActual('../../lib/api-client');
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return {
      ...actual,
      ...mockApiClientFactory(mockFetch),
    };
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
  ...SHARED_RECORD,
  factIds: [],
  supporterView: {
    ...SHARED_RECORD.supporterView,
    factIds: [],
    headline: 'Emma has no shareable updates yet.',
    facts: [],
  },
  supporteeView: {
    ...SHARED_RECORD.supporteeView,
    factIds: [],
    headline: 'Your supporter has no shareable updates yet.',
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

describe('SupportHubMentorTab', () => {
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

  it('renders visibility-backed cockpit cards with Mentor, Subjects, and Journal actions', async () => {
    const openMentor = jest.fn();
    const openSubjects = jest.fn();
    const openJournal = jest.fn();

    queryClient = renderWithProfile(
      <SupportHubMentorTab
        personScopes={[EMMA_SCOPE]}
        onOpenPersonScope={openMentor}
        onOpenSubjects={openSubjects}
        onOpenJournal={openJournal}
      />,
    );

    await waitFor(() => {
      screen.getByText('Emma has 1 shareable update.');
    });

    screen.getByText('Practiced fractions');
    screen.getByText('Completed the review set.');
    expect(
      screen.queryByText('Private chats, notes, and mentor memory'),
    ).toBeNull();

    fireEvent.press(screen.getByTestId(`support-hub-mentor-open-${PERSON_ID}`));
    fireEvent.press(
      screen.getByTestId(`support-hub-subjects-open-${PERSON_ID}`),
    );
    fireEvent.press(
      screen.getByTestId(`support-hub-journal-open-${PERSON_ID}`),
    );

    expect(openMentor).toHaveBeenCalledWith(EMMA_SCOPE);
    expect(openSubjects).toHaveBeenCalledWith(EMMA_SCOPE);
    expect(openJournal).toHaveBeenCalledWith(EMMA_SCOPE);
    expect(
      fetchCallsMatching(
        mockFetch,
        `/visibility/reports/${PERSON_ID}/shared-record`,
      ),
    ).toHaveLength(1);
  });

  it('shows the initial loading card while shared-record facts are pending', async () => {
    let resolveRecord: ((record: SharedRecord) => void) | undefined;
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      () =>
        new Promise<SharedRecord>((resolve) => {
          resolveRecord = resolve;
        }),
    );

    queryClient = renderWithProfile(
      <SupportHubMentorTab personScopes={[EMMA_SCOPE]} />,
    );

    screen.getByText('Checking shared updates...');
    screen.getByLabelText('Loading...');

    resolveRecord?.(SHARED_RECORD);
    await waitFor(() => {
      screen.getByText('Emma has 1 shareable update.');
    });
  });

  it('shows empty-card copy when the shared record has no supporter-visible facts', async () => {
    mockFetch.setRoute(
      `/visibility/reports/${PERSON_ID}/shared-record`,
      EMPTY_SHARED_RECORD,
    );

    queryClient = renderWithProfile(
      <SupportHubMentorTab personScopes={[EMMA_SCOPE]} />,
    );

    await waitFor(() => {
      screen.getByText('Emma has no shareable updates yet.');
    });

    screen.getByText('No shareable updates yet');
    screen.getByText(
      'When Emma has a shared session or report, it will show up here.',
    );
    expect(screen.queryByText('Practiced fractions')).toBeNull();
    expect(screen.queryByTestId('support-hub-mentor-fact-fact-1')).toBeNull();
  });

  it('shows an error card and refetches when retry is pressed', async () => {
    let attempts = 0;
    mockFetch.setRoute(`/visibility/reports/${PERSON_ID}/shared-record`, () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response(JSON.stringify({ error: 'temporary failure' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return SHARED_RECORD;
    });

    queryClient = renderWithProfile(
      <SupportHubMentorTab personScopes={[EMMA_SCOPE]} />,
    );

    await waitFor(() => {
      screen.getByText("Couldn't load shared updates");
    });
    screen.getByText('Try again in a moment.');

    fireEvent.press(
      screen.getByTestId(`support-hub-mentor-retry-${PERSON_ID}`),
    );

    await waitFor(() => {
      screen.getByText('Emma has 1 shareable update.');
    });
    expect(attempts).toBe(2);
  });
});
