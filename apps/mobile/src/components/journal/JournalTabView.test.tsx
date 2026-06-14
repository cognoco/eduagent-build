import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NowResponse } from '@eduagent/schemas';

import { JournalTabView } from './JournalTabView';

const mockPush = jest.fn();
let mockNowFeed: {
  data: NowResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: jest.Mock;
};
let mockRecaps: ReturnType<typeof query>;
let mockMonthlyReports: ReturnType<typeof query>;
let mockWeeklyReports: ReturnType<typeof query>;
let mockSessionsArchive: ReturnType<typeof infiniteQuery>;
let mockNotes: ReturnType<typeof infiniteQuery>;
let mockBookmarks: ReturnType<typeof infiniteQuery>;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../hooks/use-now-feed' /* gc1-allow: Journal moments consume the already-tested feed hook; component test pins feed states */,
  () => ({
    useNowFeed: () => mockNowFeed,
  }),
);

jest.mock(
  '../../hooks/use-journal-recaps' /* gc1-allow: section composition test; hook has its own API boundary */,
  () => ({
    useJournalRecaps: () => mockRecaps,
  }),
);

jest.mock(
  '../../hooks/use-progress' /* gc1-allow: Journal composes established progress hooks; route tests cover hook fetches */,
  () => ({
    useProfileReports: () => mockMonthlyReports,
    useProfileWeeklyReports: () => mockWeeklyReports,
    useProfileSessionsArchive: () => mockSessionsArchive,
  }),
);

jest.mock(
  '../../hooks/use-notes' /* gc1-allow: Journal only reads count previews from the archive hook */,
  () => ({
    useAllNotes: () => mockNotes,
  }),
);

jest.mock(
  '../../hooks/use-bookmarks' /* gc1-allow: Journal only reads count previews from the archive hook */,
  () => ({
    useBookmarks: () => mockBookmarks,
  }),
);

jest.mock(
  '../../lib/profile' /* gc1-allow: Journal composition test only needs active profile id for established hooks */,
  () => ({
    useProfile: () => ({
      activeProfile: {
        id: 'profile-1',
        displayName: 'Ada',
      },
    }),
  }),
);

function query<T>(data: T) {
  return {
    data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
}

function infiniteQuery<T extends Record<string, unknown>>(page: T) {
  return {
    data: { pages: [page], pageParams: [undefined] },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
}

const recap = {
  recapId: 'b0000000-0000-4000-8000-000000000001',
  sessionId: 'b0000000-0000-4000-8000-000000000001',
  childProfileId: 'a0000000-0000-4000-8000-000000000001',
  childDisplayName: 'Ada',
  subjectId: 'c0000000-0000-4000-8000-000000000001',
  subjectName: 'Math',
  topicId: 'd0000000-0000-4000-8000-000000000001',
  topicTitle: 'Fractions',
  sessionType: 'learning',
  startedAt: '2026-06-14T09:00:00.000Z',
  endedAt: '2026-06-14T09:20:00.000Z',
  exchangeCount: 8,
  displayTitle: 'Fractions session',
  displaySummary: 'Worked on comparing fractions.',
  highlight: 'Compared thirds and sixths.',
  narrative: null,
  conversationPrompt: null,
  engagementSignal: null,
  nextTopicTitle: null,
  nextTopicReason: null,
};

const weeklyReport = {
  id: 'weekly-1',
  reportWeek: '2026-06-08',
  createdAt: '2026-06-14T00:00:00.000Z',
  viewedAt: null,
  headlineStat: {
    value: 3,
    label: 'Topics explored',
    comparison: '3 new this week',
  },
};

const monthlyReport = {
  id: 'monthly-1',
  reportMonth: '2026-06',
  createdAt: '2026-06-14T00:00:00.000Z',
  viewedAt: null,
  headlineStat: {
    value: 5,
    label: 'Sessions',
    comparison: 'steady pace',
  },
};

describe('JournalTabView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNowFeed = {
      data: {
        scope: 'self',
        generatedAt: '2026-06-14T00:00:00.000Z',
        overflowCount: 0,
        cards: [
          {
            kind: 'ledger_moment',
            templateKey: 'now.ledger_moment.session_filed',
            params: { ledgerKind: 'session_filed', topicTitle: 'Fractions' },
            deepLink: {
              route: 'session.resume',
              params: { sessionId: 'session-1' },
              chain: [],
            },
            scope: 'self',
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
    mockRecaps = query([recap]);
    mockMonthlyReports = query([monthlyReport]);
    mockWeeklyReports = query([weeklyReport]);
    mockSessionsArchive = infiniteQuery({ sessions: [recap] });
    mockNotes = infiniteQuery({ notes: [{ id: 'note-1' }] });
    mockBookmarks = infiniteQuery({ bookmarks: [{ id: 'bookmark-1' }] });
  });

  it('renders ledger moments and defaults to the self recap section', () => {
    render(<JournalTabView />);

    screen.getByTestId('journal-screen');
    screen.getByTestId('journal-moments-strip');
    screen.getByText('Saved Fractions to your learning record.');
    screen.getByTestId('journal-segmented-control');
    screen.getByTestId('journal-recaps-section');
    screen.getByTestId(`journal-recap-row-${recap.recapId}`);
  });

  it('routes self recap rows to the learner session-summary route', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId(`journal-recap-row-${recap.recapId}`));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId: recap.sessionId,
        subjectId: recap.subjectId,
        topicId: recap.topicId,
      },
    });
  });

  it('switches to reports and routes report rows to existing report details', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-reports'));
    screen.getByTestId('journal-reports-section');

    fireEvent.press(screen.getByTestId('weekly-report-card-weekly-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/progress/weekly-report/[weeklyReportId]',
      params: { weeklyReportId: 'weekly-1' },
    });
  });

  it('switches to notes and routes archive rows to the existing notes surface', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-notes'));
    screen.getByTestId('journal-notes-section');
    fireEvent.press(screen.getByTestId('journal-notes-notes'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/my-notes/[kind]',
      params: { kind: 'notes', returnTo: 'journal' },
    });
  });

  it('keeps mentor memory controls reachable instead of replacing them', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-memory'));
    screen.getByTestId('journal-memory-section');
    fireEvent.press(screen.getByTestId('journal-memory-open'));

    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/mentor-memory?returnTo=journal',
    );
  });

  it('keeps feed failures retryable without blanking the paper trail', () => {
    mockNowFeed = {
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    };

    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-moments-retry'));
    expect(mockNowFeed.refetch).toHaveBeenCalledTimes(1);
    screen.getByTestId('journal-recaps-section');
  });
});
