import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import type { NowResponse } from '@eduagent/schemas';

import { JournalTabView } from './JournalTabView';
import { RecapRow } from './RecapRow';

const mockPush = jest.fn();
const mockSetActiveScope = jest.fn();
let mockJournalSection: string | undefined;
let mockNowFeed: {
  data: NowResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch: jest.Mock;
};
let mockRecaps: ReturnType<typeof query>;
let mockMonthlyReports: ReturnType<typeof query>;
let mockWeeklyReports: ReturnType<typeof query>;
let mockNotes: ReturnType<typeof infiniteQuery>;
let mockBookmarks: ReturnType<typeof infiniteQuery>;
let mockPracticeHistory!: ReturnType<typeof infiniteQuery>;
let lastPracticeOpts: { limit?: number; type?: string } | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ section: mockJournalSection }),
}));

jest.mock(
  '../../lib/scope-context' /* gc1-allow: real hook throws without its provider and resolves persisted scope asynchronously; this composition test only needs a stable setActiveScope spy */,
  () => ({
    useScopeContext: () => ({ setActiveScope: mockSetActiveScope }),
  }),
);

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
  '../../hooks/use-my-reports' /* gc1-allow: Journal composes self-scope report hooks; route tests cover hook fetches */,
  () => ({
    useMyReports: () => mockMonthlyReports,
    useMyWeeklyReports: () => mockWeeklyReports,
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
  // gc1-allow: Journal composes the practice-history hook; endpoint and hook have dedicated coverage
  '../../hooks/use-practice-activity-history',
  () => ({
    usePracticeActivityHistory: (opts?: { limit?: number; type?: string }) => {
      lastPracticeOpts = opts;
      return mockPracticeHistory;
    },
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

function firstCallOrder(mockFn: jest.Mock): number {
  const order = mockFn.mock.invocationCallOrder[0];
  if (order === undefined) {
    throw new Error('expected mock to have been called');
  }
  return order;
}

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
    mockJournalSection = undefined;
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
          {
            kind: 'ledger_moment',
            templateKey: 'now.ledger_moment.milestone_reached',
            params: {
              ledgerKind: 'milestone_reached',
              milestoneType: 'session_count',
              threshold: 3,
            },
            deepLink: {
              route: 'journal',
              params: {},
              chain: [],
            },
            scope: 'self',
          },
          {
            kind: 'ledger_moment',
            templateKey: 'now.ledger_moment.topic_mastered',
            params: {
              ledgerKind: 'topic_mastered',
              subjectId: 'subject-1',
              topicId: 'topic-1',
              bookId: 'book-1',
              topicTitle: 'Fractions',
            },
            deepLink: {
              route: 'subject.topic',
              params: {
                subjectId: 'subject-1',
                bookId: 'book-1',
                topicId: 'topic-1',
              },
              chain: ['subject.hub'],
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
    mockNotes = infiniteQuery({
      notes: [
        {
          id: 'note-1',
          content: 'Remember phase changes.',
          origin: 'self',
          subjectName: 'Science',
          topicTitle: 'States of matter',
        },
        {
          id: 'note-2',
          content: 'Mentor said evaporation is surface-only.',
          origin: 'mentor',
          subjectName: 'Science',
          topicTitle: 'States of matter',
        },
      ],
    });
    mockBookmarks = infiniteQuery({
      bookmarks: [
        {
          id: 'bookmark-1',
          content: 'Saved mentor explanation about fractions.',
          subjectName: 'Math',
          topicTitle: 'Fractions',
        },
      ],
    });
    lastPracticeOpts = undefined;
    mockPracticeHistory = infiniteQuery({
      items: [
        {
          id: 'activity-1',
          activityType: 'assessment',
          topicTitle: 'Photosynthesis',
          subjectName: 'Biology',
          occurredAt: '2026-06-20T10:00:00.000Z',
        },
        {
          id: 'activity-2',
          activityType: 'dictation',
          topicTitle: null,
          subjectName: 'Spanish',
          occurredAt: '2026-06-19T10:00:00.000Z',
        },
      ],
    });
  });

  it('renders ledger moments and defaults to the sessions section', () => {
    render(<JournalTabView />);

    screen.getByTestId('journal-screen');
    screen.getByTestId('journal-moments-strip');
    screen.getByText('Saved Fractions to your learning record.');
    screen.getByText('3 learning sessions completed');
    screen.getByText('Marked Fractions as mastered.');
    screen.getByTestId('journal-segmented-control');
    // The Sessions tab renders the recap list (recap = the session's row).
    screen.getByTestId('journal-recaps-section');
    screen.getByTestId(`journal-recap-row-${recap.recapId}`);
  });

  // [WI-2223 AC-1] activating a support.hub-linked ledger moment must select
  // the Support-hub scope BEFORE the Mentor tab opens — the second
  // pushNowDeepLink caller (the first is mentor.tsx, covered in
  // mentor.test.tsx), or the learner Mentor surface renders instead.
  it('[WI-2223] AC-1: selects the Support-hub scope before pushing a support.hub-linked moment', () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: {
        scope: 'self',
        generatedAt: '2026-06-14T00:00:00.000Z',
        overflowCount: 0,
        cards: [
          {
            kind: 'ledger_moment',
            templateKey: 'now.ledger_moment.session_filed',
            params: { ledgerKind: 'session_filed', topicTitle: 'Emma' },
            deepLink: { route: 'support.hub', params: {}, chain: [] },
            scope: 'self',
          },
        ],
      },
    };

    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-moment-session_filed'));

    expect(mockSetActiveScope).toHaveBeenCalledWith({ kind: 'supporter-hub' });
    expect(mockPush).toHaveBeenCalledWith('/(app)/mentor');
    expect(firstCallOrder(mockSetActiveScope)).toBeLessThan(
      firstCallOrder(mockPush),
    );
  });

  it('renders all five section buttons in the two-row control', () => {
    render(<JournalTabView />);

    screen.getByTestId('journal-tab-notes');
    screen.getByTestId('journal-tab-sessions');
    screen.getByTestId('journal-tab-practice');
    screen.getByTestId('journal-tab-memory');
    screen.getByTestId('journal-tab-reports');
    // Full labels render (no truncation/font-shrink) — the original bug.
    screen.getByText('Sessions');
    screen.getByText('Practice');
  });

  it('[WI-2110 AC-1/4] temporarily overrides a warm organic section and restores it', () => {
    const { rerender } = render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-notes'));
    screen.getByTestId('journal-notes-section');

    mockJournalSection = 'practice';
    rerender(<JournalTabView />);
    screen.getByTestId('journal-practice-section');
    screen.getByTestId('journal-moments-strip');

    mockJournalSection = undefined;
    rerender(<JournalTabView />);
    screen.getByTestId('journal-notes-section');
  });

  it('[WI-2110 AC-3] selects Practice for a cold-start section override', () => {
    mockJournalSection = 'practice';

    render(<JournalTabView />);

    screen.getByTestId('journal-practice-section');
  });

  it('[WI-2110 AC-2] ignores an unknown section and preserves organic selection', () => {
    const { rerender } = render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-notes'));
    mockJournalSection = 'future-section';
    rerender(<JournalTabView />);

    screen.getByTestId('journal-notes-section');
    screen.getByTestId('journal-moments-strip');
  });

  it('opens the practice hub from the Practice section', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-practice'));
    screen.getByTestId('journal-practice-section');
    screen.getByTestId('journal-practice-past-activity');

    fireEvent.press(screen.getByTestId('journal-practice-open-hub'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/practice',
      params: { returnTo: 'journal' },
    });
  });

  it('lists past practice activity of every type with topic as the headline', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-practice'));

    expect(screen.getByTestId('journal-activity-activity-1')).toBeTruthy();
    expect(screen.getByTestId('journal-activity-activity-2')).toBeTruthy();
    expect(
      screen.getByTestId('journal-activity-headline-activity-1'),
    ).toHaveTextContent('Photosynthesis');
    expect(
      screen.getByTestId('journal-activity-meta-activity-1'),
    ).toHaveTextContent(/^Assessment · Biology · .+$/);
    expect(
      screen.getByTestId('journal-activity-headline-activity-2'),
    ).toHaveTextContent('Dictation');
    expect(
      screen.getByTestId('journal-activity-meta-activity-2'),
    ).toHaveTextContent(/^Spanish · .+$/);
  });

  it('filters past activity by type chips, driving the server query', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-practice'));
    screen.getByTestId('journal-practice-filter');

    fireEvent.press(screen.getByTestId('journal-practice-filter-dictation'));
    expect(lastPracticeOpts?.type).toBe('dictation');

    fireEvent.press(screen.getByTestId('journal-practice-filter-all'));
    expect(lastPracticeOpts?.type).toBeUndefined();
  });

  it('auto-surfaces the latest report inline in the Reports section', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-reports'));
    // The most-recent report is opened inline (not just listed) — the V1
    // Progress "latest report" card, reused here.
    fireEvent.press(screen.getByTestId('progress-latest-report-card'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/progress/weekly-report/[weeklyReportId]',
      params: { weeklyReportId: 'weekly-1', returnTo: 'journal' },
    });
  });

  it('filters the notes archive by authorship with one-click chips', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-notes'));
    screen.getByTestId('journal-notes-filter');

    // "My notes" → only the learner-authored note (note-1).
    fireEvent.press(screen.getByTestId('journal-notes-filter-mine'));
    expect(screen.getByTestId('journal-note-note:note-1')).toBeTruthy();
    expect(screen.queryByTestId('journal-note-note:note-2')).toBeNull();
    expect(screen.queryByTestId('journal-note-bookmark:bookmark-1')).toBeNull();

    // "Bookmarks" → only saved-from-mentor items (note-2 + the bookmark).
    fireEvent.press(screen.getByTestId('journal-notes-filter-mentor'));
    expect(screen.queryByTestId('journal-note-note:note-1')).toBeNull();
    expect(screen.getByTestId('journal-note-note:note-2')).toBeTruthy();
    expect(screen.getByTestId('journal-note-bookmark:bookmark-1')).toBeTruthy();

    // "All" → everything restored.
    fireEvent.press(screen.getByTestId('journal-notes-filter-all'));
    expect(screen.getByTestId('journal-note-note:note-1')).toBeTruthy();
    expect(screen.getByTestId('journal-note-note:note-2')).toBeTruthy();
    expect(screen.getByTestId('journal-note-bookmark:bookmark-1')).toBeTruthy();
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
        returnTo: 'journal',
      },
    });
  });

  it('uses the recap caller return destination instead of silently forcing Journal', () => {
    render(<RecapRow recap={recap} returnTo="learner-home" />);

    fireEvent.press(screen.getByTestId(`journal-recap-row-${recap.recapId}`));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId: recap.sessionId,
        subjectId: recap.subjectId,
        topicId: recap.topicId,
        returnTo: 'learner-home',
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
      params: { weeklyReportId: 'weekly-1', returnTo: 'journal' },
    });

    fireEvent.press(screen.getByTestId('report-card-monthly-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/progress/reports/[reportId]',
      params: { reportId: 'monthly-1', returnTo: 'journal' },
    });
  });

  it('shows the full cross-subject saved list browse-first before any search', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-notes'));
    screen.getByTestId('journal-notes-section');

    // Browse-first: every saved item (2 notes + 1 bookmark) is visible without
    // typing anything into the search line.
    expect(screen.getByTestId('journal-note-note:note-1')).toBeTruthy();
    expect(screen.getByTestId('journal-note-note:note-2')).toBeTruthy();
    expect(screen.getByTestId('journal-note-bookmark:bookmark-1')).toBeTruthy();
    screen.getByText('Remember phase changes.');
    screen.getByText('Saved mentor explanation about fractions.');
  });

  it('marks per-item authorship (my note vs saved from mentor)', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-notes'));

    // note-1 is the learner's own (origin: 'self'); note-2 + the bookmark are
    // saved from the mentor.
    expect(screen.getAllByTestId('journal-note-authorship-mine').length).toBe(
      1,
    );
    expect(screen.getAllByTestId('journal-note-authorship-mentor').length).toBe(
      2,
    );
  });

  it('narrows the list while searching and restores it when cleared', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-notes'));
    const input = screen.getByTestId('journal-notes-search-input');

    // Filter to the bookmark only (matches subject "Math" / content "fractions").
    fireEvent.changeText(input, 'fractions');
    expect(screen.queryByTestId('journal-note-note:note-1')).toBeNull();
    expect(screen.getByTestId('journal-note-bookmark:bookmark-1')).toBeTruthy();

    // Clearing the filter restores the full browse list.
    fireEvent.changeText(input, '');
    expect(screen.getByTestId('journal-note-note:note-1')).toBeTruthy();
    expect(screen.getByTestId('journal-note-note:note-2')).toBeTruthy();
    expect(screen.getByTestId('journal-note-bookmark:bookmark-1')).toBeTruthy();
  });

  it('renders an empty state when no saved items match', () => {
    mockNotes = infiniteQuery({ notes: [] });
    mockBookmarks = infiniteQuery({ bookmarks: [] });

    render(<JournalTabView />);
    fireEvent.press(screen.getByTestId('journal-tab-notes'));

    screen.getByTestId('journal-notes-empty');
  });

  it('keeps the magic pen as the sole animated focal point in practice and reports empty states', () => {
    mockNowFeed = {
      data: {
        scope: 'self',
        generatedAt: '2026-06-14T00:00:00.000Z',
        overflowCount: 0,
        cards: [],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
    mockRecaps = query([]);
    mockNotes = infiniteQuery({ notes: [] });
    mockBookmarks = infiniteQuery({ bookmarks: [] });
    mockPracticeHistory = infiniteQuery({ items: [] });
    mockMonthlyReports = query([]);
    mockWeeklyReports = query([]);

    render(<JournalTabView />);

    screen.getByTestId('journal-moments-empty');
    screen.getByTestId('journal-moments-empty-book', {
      includeHiddenElements: true,
    });

    screen.getByTestId('journal-recaps-empty-book', {
      includeHiddenElements: true,
    });

    fireEvent.press(screen.getByTestId('journal-tab-notes'));
    screen.getByTestId('journal-notes-empty-pen', {
      includeHiddenElements: true,
    });

    fireEvent.press(screen.getByTestId('journal-tab-practice'));
    const practiceMotif = screen.getByTestId('journal-practice-empty-motif', {
      includeHiddenElements: true,
    });
    expect(
      within(practiceMotif).getAllByTestId(/^journal-practice-empty-motif-.+/, {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);
    screen.getByTestId('journal-practice-empty-motif-pen', {
      includeHiddenElements: true,
    });
    expect(
      screen.queryByTestId('journal-practice-empty-motif-lamp', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    expect(
      screen.queryByTestId('journal-practice-empty-motif-book', {
        includeHiddenElements: true,
      }),
    ).toBeNull();

    fireEvent.press(screen.getByTestId('journal-tab-reports'));
    const reportsMotif = screen.getByTestId('journal-reports-empty-motif', {
      includeHiddenElements: true,
    });
    expect(
      within(reportsMotif).getAllByTestId(/^journal-reports-empty-motif-.+/, {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);
    screen.getByTestId('journal-reports-empty-motif-pen', {
      includeHiddenElements: true,
    });
    expect(
      screen.queryByTestId('journal-reports-empty-motif-lamp', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    expect(
      screen.queryByTestId('journal-reports-empty-motif-book', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });

  it('[WI-1678] keeps the Reports empty motif hidden while report queries are still loading', () => {
    mockMonthlyReports = {
      ...query([]),
      isLoading: true,
    };
    mockWeeklyReports = query([]);

    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-reports'));
    screen.getByTestId('journal-reports-section');
    expect(
      screen.queryByTestId('journal-reports-empty-motif-lamp', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    expect(
      screen.queryByTestId('journal-reports-empty-motif-pen', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    expect(
      screen.queryByTestId('journal-reports-empty-motif-book', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });

  it('[WI-2186] shows one combined empty expectation only after both report queries settle', () => {
    mockMonthlyReports = query([]);
    mockWeeklyReports = query([]);

    render(<JournalTabView />);
    fireEvent.press(screen.getByTestId('journal-tab-reports'));

    expect(
      screen.getAllByText(
        'Your next weekly or monthly report will appear here once there is enough learning to summarize.',
      ),
    ).toHaveLength(1);
    expect(
      screen.queryByText(
        'The first report will arrive at the end of the month',
      ),
    ).toBeNull();
  });

  it('[WI-2186] keeps a settled endpoint error distinct from no report activity', () => {
    mockMonthlyReports = {
      ...query([]),
      isError: true,
    };
    mockWeeklyReports = query([]);

    render(<JournalTabView />);
    fireEvent.press(screen.getByTestId('journal-tab-reports'));

    screen.getByTestId('journal-reports-error');
    expect(screen.queryByTestId('progress-latest-report-empty')).toBeNull();
    expect(screen.queryByTestId('reports-list-empty')).toBeNull();
  });

  it.each([
    ['weekly-only', [], [weeklyReport], 'weekly-report-card-weekly-1'],
    ['monthly-only', [monthlyReport], [], 'report-card-monthly-1'],
  ])(
    '[WI-2186] preserves the %s report state',
    (_case, monthly, weekly, rowTestID) => {
      mockMonthlyReports = query(monthly);
      mockWeeklyReports = query(weekly);

      render(<JournalTabView />);
      fireEvent.press(screen.getByTestId('journal-tab-reports'));

      screen.getByTestId(rowTestID);
      expect(screen.queryByTestId('reports-list-empty')).toBeNull();
      expect(screen.queryByTestId('journal-reports-error')).toBeNull();
    },
  );

  it('exposes a transcription-only mic on the archive search line', () => {
    render(<JournalTabView />);
    fireEvent.press(screen.getByTestId('journal-tab-notes'));

    // The mic is the shared voice primitive — transcription only, no
    // tone/emotion analysis (§16). Tapping it does not navigate.
    const mic = screen.getByTestId('journal-notes-mic');
    expect(mic).toBeTruthy();
    fireEvent.press(screen.getByTestId('voice-record-button'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('routes a saved row to the existing notes surface', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-notes'));
    fireEvent.press(screen.getByTestId('journal-note-note:note-1'));

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

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/mentor-memory',
      params: { returnTo: 'journal' },
    });
  });

  it('keeps feed failures retryable without blanking the paper trail', () => {
    mockNowFeed = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch: jest.fn(),
    } as typeof mockNowFeed;

    render(<JournalTabView />);

    // Feed error renders the shared ErrorFallback (not bespoke inline UI).
    screen.getByTestId('journal-moments-error');
    fireEvent.press(screen.getByTestId('journal-moments-retry'));
    expect(mockNowFeed.refetch).toHaveBeenCalledTimes(1);
    screen.getByTestId('journal-recaps-section');
  });

  it('renders the shared ErrorFallback when the notes archive fails to load', () => {
    mockNotes = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('notes-load-failed'),
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof infiniteQuery>;
    mockBookmarks = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('bookmarks-load-failed'),
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof infiniteQuery>;

    render(<JournalTabView />);
    fireEvent.press(screen.getByTestId('journal-tab-notes'));

    // Shared ErrorFallback with a retry primary (testID stable across recovery).
    screen.getByTestId('journal-notes-error');
    fireEvent.press(screen.getByTestId('journal-notes-error-retry'));
    expect(mockNotes.refetch).toHaveBeenCalledTimes(1);
  });
});
