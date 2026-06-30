import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NowResponse } from '@eduagent/schemas';

import { JournalTabView } from './JournalTabView';

const mockPush = jest.fn();
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
            templateKey: 'now.ledger_moment.reward_receipt',
            params: {
              ledgerKind: 'reward_receipt',
              receiptKind: 'practice_points',
              amount: 12,
              topicTitle: 'Fractions',
            },
            deepLink: {
              route: 'journal',
              params: {},
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
  });

  it('renders ledger moments and defaults to the sessions section', () => {
    render(<JournalTabView />);

    screen.getByTestId('journal-screen');
    screen.getByTestId('journal-moments-strip');
    screen.getByText('Saved Fractions to your learning record.');
    screen.getByText('3 learning sessions completed');
    screen.getByText('+12 practice points for Fractions');
    screen.getByTestId('journal-segmented-control');
    // The Sessions tab renders the recap list (recap = the session's row).
    screen.getByTestId('journal-recaps-section');
    screen.getByTestId(`journal-recap-row-${recap.recapId}`);
  });

  it('renders all four section buttons in the segmented control', () => {
    render(<JournalTabView />);

    screen.getByTestId('journal-tab-notes');
    screen.getByTestId('journal-tab-sessions');
    screen.getByTestId('journal-tab-memory');
    screen.getByTestId('journal-tab-reports');
    // Full labels render (no truncation/font-shrink) — the original bug.
    screen.getByText('Sessions');
    expect(screen.queryByTestId('journal-tab-practice')).toBeNull();
  });

  it('auto-surfaces the latest report inline in the Reports section', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-tab-reports'));
    // The most-recent report is opened inline (not just listed) — the V1
    // Progress "latest report" card, reused here.
    screen.getByTestId('progress-latest-report-card');
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

    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/mentor-memory?returnTo=journal',
    );
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
